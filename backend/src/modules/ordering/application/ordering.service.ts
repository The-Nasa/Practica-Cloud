import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../../../platform/database/database.service';
import { CancelOrderDto, CreatePurchaseDto } from '../infrastructure/dto/ordering.dto';
import { assertStoreAccess, assertStoreOrderable } from '../../merchant/public';
import { lockAvailability, releaseOrderStock, reserveStock } from '../../inventory/public';
import { ConfigService } from '@nestjs/config';
import { OrderExpirationService, pendingOrderTtl } from './order-expiration.service';
import { MutationActor, recordMutation } from '../../platform/public';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';

@Injectable()
export class OrderingService {
  constructor(private readonly db: DatabaseService, private readonly config: ConfigService, private readonly expiration: OrderExpirationService) {}

  async createPurchase(
    customerId: string,
    idempotencyKey: string | undefined,
    dto: CreatePurchaseDto,
    actor: MutationActor = {userId:customerId,requestId:randomUUID()},
  ) {
    return this.db.withTransaction(client => this.createPurchaseInTransaction(client, customerId, idempotencyKey, dto, actor));
  }

  /** Internal composition: caller owns the transaction and global stock lock order. */
  async createPurchaseInTransaction(client: PoolClient, customerId: string, idempotencyKey: string | undefined,
    dto: CreatePurchaseDto, actor: MutationActor, checkoutGroupId?: string) {
    if (!idempotencyKey?.trim() || idempotencyKey.length > 200) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Envíe Idempotency-Key de 1 a 200 caracteres' });
    }
    // Stable property order for equivalent DTOs received with different JSON key order.
    const bodyHash = createHash('sha256').update(JSON.stringify({
      addressId: dto.addressId, paymentMethod: dto.paymentMethod,
      cashTenderCents: dto.cashTenderCents ?? null,
      expectedTotalCents: dto.expectedTotalCents ?? null,
      items: dto.items.map((item) => ({ skuId: item.skuId, quantity: item.quantity, note: item.note || '' })),
    })).digest('hex');

      // The unique insert waits for an in-flight request; rollback also removes its claim.
      await client.query(
        `INSERT INTO platform.idempotency_keys (user_id, operation, key, request_hash, expires_at)
         VALUES ($1, 'create-purchase', $2, $3, now() + interval '24 hours')
         ON CONFLICT DO NOTHING`, [customerId, idempotencyKey, bodyHash],
      );
      const keyResult = await client.query(
        `SELECT request_hash, response_body, expires_at <= now() AS expired
         FROM platform.idempotency_keys
         WHERE user_id = $1 AND operation = 'create-purchase' AND key = $2 FOR UPDATE`,
        [customerId, idempotencyKey],
      );
      const key = keyResult.rows[0];
      if (key.request_hash !== bodyHash || key.expired) {
        throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'La clave ya fue usada con otro contenido o venció' });
      }
      if (key.response_body) return key.response_body;
      if (dto.paymentMethod !== 'cash') {
        throw new BadRequestException({ code: 'PAYMENT_METHOD_UNAVAILABLE', message: 'Por ahora solo se admite efectivo' });
      }
      // 2. Validate Address & Zone
      const addrRes = await client.query(
        `SELECT a.id, a.zone_id, a.recipient_name, a.phone, a.street, a.street_number,
                a.reference, a.latitude, a.longitude,
                z.base_fee_cents, z.is_active as zone_active
         FROM geography.addresses a
         JOIN geography.coverage_zones z ON a.zone_id = z.id
         WHERE a.id = $1 AND a.user_id = $2 AND a.archived_at IS NULL
         FOR SHARE OF a, z`,
        [dto.addressId, customerId],
      );

      if (addrRes.rows.length === 0) {
        throw new NotFoundException('La dirección seleccionada no existe o no pertenece al usuario');
      }

      const address = addrRes.rows[0];
      if (!address.zone_active) {
        throw new BadRequestException('La zona de cobertura de la dirección no se encuentra activa');
      }

      // 3. Lock SKUs in stable order (UUID order) to avoid deadlocks
      const skuIds = [...new Set(dto.items.map((i) => i.skuId))].sort();

      const skusRes = await client.query(
        `SELECT s.id, s.product_id, s.sku_code, s.variant_name, s.price_cents, s.is_active,
                p.store_id, p.name as product_name, p.is_active as product_active,
                st.name as store_name, st.status as store_status, st.accepting_orders,
                st.minimum_order_cents,st.zone_id
         FROM catalog.skus s
         JOIN catalog.products p ON s.product_id = p.id
         JOIN merchant.stores st ON p.store_id = st.id
         WHERE s.id = ANY($1::uuid[])
         ORDER BY s.id ASC
         FOR SHARE`,
        [skuIds],
      );

      if (skusRes.rows.length !== skuIds.length) {
        throw new NotFoundException('Uno o más SKUs solicitados no existen en el catálogo');
      }

      // Enforce single-store rule (Section 2 & 8.1 of architecture-backend.md)
      const storeIds = [...new Set(skusRes.rows.map((s) => s.store_id))];
      if (storeIds.length > 1) {
        throw new BadRequestException('El pedido solo puede contener productos de un único comercio');
      }

      const storeId = storeIds[0];
      const storeInfo = skusRes.rows[0];

      // Bloquear compras/reservas de la propia tienda o cuentas de comercio
      const isStoreMember = (await client.query(
        `SELECT 1 FROM merchant.memberships WHERE user_id = $1 AND store_id = $2`,
        [customerId, storeId],
      )).rowCount;
      if (isStoreMember) {
        throw new ForbiddenException({
          code: 'MERCHANT_CANNOT_ORDER_OWN_STORE',
          message: 'Una tienda no puede realizar pedidos o reservas a su propio comercio.',
        });
      }

      const isMerchantRole = (await client.query(
        `SELECT 1 FROM identity.user_roles WHERE user_id = $1 AND role_code = 'merchant'`,
        [customerId],
      )).rowCount;
      if (isMerchantRole) {
        throw new ForbiddenException({
          code: 'MERCHANT_CANNOT_PLACE_ORDERS',
          message: 'Las cuentas de comercio están destinadas a la gestión de su tienda y no pueden realizar pedidos ni reservas.',
        });
      }
      if (!address || !address.zone_id) throw new ConflictException({code:'STORE_OUTSIDE_ZONE',message:'La dirección de entrega no cuenta con una zona de reparto activa'});
      await assertStoreOrderable(client, storeId);
      if (storeInfo.store_status !== 'active' || !storeInfo.accepting_orders) {
        throw new ConflictException({
          code: 'STORE_NOT_ACCEPTING_ORDERS',
          message: 'El comercio no está recibiendo pedidos actualmente',
        });
      }
      if (skusRes.rows.some((sku) => !sku.is_active || !sku.product_active)) {
        throw new ConflictException({ code: 'PRODUCT_UNAVAILABLE', message: 'Un producto o SKU ya no está disponible' });
      }

      // 4. Lock physical stock and check availability
      const stockRows = await lockAvailability(client,skuIds);

      const availabilityMap = new Map<string, number>();
      stockRows.forEach((r) => availabilityMap.set(r.sku_id, Number(r.available)));

      // Aggregate requested quantities per SKU
      const requestedMap = new Map<string, number>();
      for (const item of dto.items) {
        requestedMap.set(item.skuId, (requestedMap.get(item.skuId) || 0) + item.quantity);
      }

      for (const [skuId, requestedQty] of requestedMap.entries()) {
        const available = availabilityMap.get(skuId) || 0;
        if (available < requestedQty) {
          const skuData = skusRes.rows.find((s) => s.id === skuId);
          throw new ConflictException({
            code: 'OUT_OF_STOCK',
            message: `Stock insuficiente para ${skuData?.product_name || 'el producto'}. Solicitado: ${requestedQty}, disponible: ${available}`,
          });
        }
      }
      const subtotal = dto.items.reduce((sum, item) => sum + Number(
        skusRes.rows.find((sku) => sku.id === item.skuId)!.price_cents,
      ) * item.quantity, 0);
      if (subtotal < Number(storeInfo.minimum_order_cents)) {
        throw new ConflictException({ code: 'MINIMUM_ORDER_NOT_MET', message: 'No se alcanza el mínimo de compra del comercio' });
      }
      const total = subtotal + Number(address.base_fee_cents);
      if(dto.expectedTotalCents!==undefined&&dto.expectedTotalCents!==total)throw new ConflictException({code:'PRICE_CHANGED',message:'El total cambió; solicita una nueva cotización y revisa el importe'});
      if (total>100000000000000) throw new BadRequestException('El importe excede el máximo permitido');
      const cashTender = dto.cashTenderCents ?? total;
      if (cashTender<total) throw new ConflictException({code:'INSUFFICIENT_CASH',message:'El efectivo previsto no cubre el total vigente'});

      // 5. Insert Purchase
      const purchaseRes = await client.query(
        `INSERT INTO ordering.purchases (customer_id,checkout_group_id)
         VALUES ($1,$2)
         RETURNING id, code, created_at`,
        [customerId,checkoutGroupId ?? null],
      );
      const purchase = purchaseRes.rows[0];

      // 6. Insert Purchase Destination (Historical snapshot)
      await client.query(
        `INSERT INTO ordering.purchase_destinations (
           purchase_id, zone_id, recipient_name, phone, street, street_number,
           reference, latitude, longitude
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          purchase.id,
          address.zone_id,
          address.recipient_name,
          address.phone,
          address.street,
          address.street_number,
          address.reference,
          address.latitude,
          address.longitude,
        ],
      );

      // 7. Insert Merchant Order
      const deliveryFeeCents = address.base_fee_cents;
      const orderRes = await client.query(
        `INSERT INTO ordering.merchant_orders (
           purchase_id, store_id, delivery_fee_cents, status_code, acceptance_expires_at
         ) VALUES ($1, $2, $3, 'pending', CASE WHEN $4::int>0 THEN clock_timestamp()+make_interval(mins=>$4) END)
         RETURNING id, version, acceptance_expires_at`,
        [purchase.id, storeId, deliveryFeeCents, pendingOrderTtl(this.config)],
      );
      const merchantOrder = orderRes.rows[0];

      // 8. Insert Order Items & Reservations
      const createdItems = [];
      for (const item of dto.items) {
        const sku = skusRes.rows.find((s) => s.id === item.skuId)!;
        const itemRes = await client.query(
          `INSERT INTO ordering.order_items (
             merchant_order_id, sku_id, product_name_at_sale, variant_name_at_sale,
             unit_price_cents, quantity, note
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, product_name_at_sale, unit_price_cents, quantity`,
          [
            merchantOrder.id,
            sku.id,
            sku.product_name,
            sku.variant_name,
            sku.price_cents,
            item.quantity,
            item.note || '',
          ],
        );
        const orderItem = itemRes.rows[0];

        // Active inventory reservation
        await reserveStock(client,orderItem.id,merchantOrder.acceptance_expires_at);

        createdItems.push(orderItem);
      }

      // 9. Initial Order Event
      await client.query(
        `INSERT INTO ordering.order_events (
           merchant_order_id, order_version, status_code, actor_user_id, reason
         ) VALUES ($1, 0, 'pending', $2, 'Compra creada por cliente')`,
        [merchantOrder.id, customerId],
      );

      // 10. Query purchase total from ordering.purchase_totals view
      const totalRes = await client.query(
        `SELECT subtotal_cents, delivery_fee_cents, total_cents
         FROM ordering.purchase_totals
         WHERE purchase_id = $1`,
        [purchase.id],
      );
      const totals = totalRes.rows[0];

      // 11. Initial payment attempt
      await client.query(
        `INSERT INTO billing.payment_attempts (
           purchase_id, method_code, provider, amount_cents, status,cash_tender_cents
         ) VALUES ($1, $2, 'quickly-local', $3, 'pending',$4)`,
        [purchase.id, dto.paymentMethod, totals.total_cents,cashTender],
      );

      const responsePayload = {
        purchaseId: purchase.id,
        purchaseNumber: `QK-${String(purchase.code).padStart(6, '0')}`,
        orderId: merchantOrder.id,
        storeId,
        storeName: storeInfo.store_name,
        statusCode: 'pending',
        deliveryFeeCents,
        itemsSubtotalCents: totals.subtotal_cents,
        totalCents: totals.total_cents,
        paymentMethod: dto.paymentMethod,
        items: createdItems,
        createdAt: purchase.created_at,
        acceptanceExpiresAt: merchantOrder.acceptance_expires_at,
        cashTenderCents: cashTender,
        cashChangeCents: cashTender-total,
      };

      // Notify store owners/managers in platform.notifications
      await client.query(
        `INSERT INTO platform.notifications (user_id, kind, title, message, relative_url)
         SELECT m.user_id, 'order',
                '¡Nuevo pedido recibido! (' || $1 || ')',
                'Tienes un nuevo pedido pendiente de revisión en ' || $2 || '.',
                '/comercio/pedidos'
         FROM merchant.memberships m
         WHERE m.store_id = $3 AND m.is_active = true`,
        [responsePayload.purchaseNumber, storeInfo.store_name, storeId],
      );

      // JSON serialization keeps first response and retries identical (including dates).
      const response = JSON.parse(JSON.stringify(responsePayload));
      await recordMutation(client,actor,'order',merchantOrder.id,'order.created',{purchaseId:purchase.id});
      await client.query(
        `UPDATE platform.idempotency_keys SET response_status = 201, response_body = $4
         WHERE user_id = $1 AND operation = 'create-purchase' AND key = $2 AND request_hash = $3`,
        [customerId, idempotencyKey, bodyHash, response],
      );
      return response;
  }

  async cancelOrder(orderId: string, actorUserId: string, dto: CancelOrderDto, actor: MutationActor = {userId:actorUserId,requestId:randomUUID()}, target: 'cancelled'|'rejected' = 'cancelled') {
    return this.db.withTransaction(async (client) => {
      // Lock order
      const orderRes = await client.query(
        `SELECT mo.id, mo.store_id, mo.purchase_id, mo.status_code, mo.version, p.customer_id
         FROM ordering.merchant_orders mo
         JOIN ordering.purchases p ON mo.purchase_id = p.id
         WHERE mo.id = $1
         FOR UPDATE`,
        [orderId],
      );

      if (orderRes.rows.length === 0) {
        throw new NotFoundException('Pedido no encontrado');
      }

      const order = orderRes.rows[0];

      // Check permissions: only customer or admin/store member
      if (target==='rejected' || order.customer_id !== actorUserId) {
        await assertStoreAccess(client, order.store_id, actorUserId);
      }
      if (dto.expectedVersion!==undefined && dto.expectedVersion!==order.version) throw new ConflictException({code:'VERSION_CONFLICT',message:'El pedido cambió; actualice antes de continuar'});
      if (target==='rejected' && order.status_code!=='pending') throw new ConflictException('Solo se rechazan pedidos pendientes');
      const payments=await client.query('SELECT method_code,status FROM billing.payment_attempts WHERE purchase_id=$1 ORDER BY id FOR UPDATE',[order.purchase_id]);
      if (payments.rows.some(p=>p.method_code!=='cash' || p.status!=='pending')) throw new ConflictException({code:'PAYMENT_REQUIRES_REVIEW',message:'El pago requiere revisión antes de cancelar'});

      if (order.status_code !== 'pending' && order.status_code !== 'confirmed') {
        throw new ConflictException({
          code: 'ORDER_STATE_CONFLICT',
          message: `El pedido está en estado '${order.status_code}' y ya no puede ser cancelado`,
        });
      }

      // Transition to cancelled (triggers will auto-check transitions and bump version)
      await client.query(
        `UPDATE ordering.merchant_orders
         SET status_code = $2, updated_at = now()
         WHERE id = $1`,
        [orderId,target],
      );

      // Release active reservations for this order
      await releaseOrderStock(client,orderId);

      // Record event
      await client.query(
        `INSERT INTO ordering.order_events (
           merchant_order_id, order_version, status_code, actor_user_id, reason
         ) VALUES ($1, $2 + 1, $5, $3, $4)`,
        [orderId, order.version, actorUserId, dto.reason,target],
      );
      await recordMutation(client,actor,'order',orderId,`order.${target}`);
      await client.query(
        `UPDATE billing.payment_attempts SET status = 'cancelled'
         WHERE purchase_id = $1 AND method_code = 'cash' AND status = 'pending'`, [order.purchase_id],
      );

      return {
        orderId,
        status: target,
        message: 'Pedido cancelado y reservas de inventario liberadas exitosamente',
      };
    });
  }

  async updateStatus(
    orderId: string,
    targetStatus: string,
    actorUserId: string,
    reason: string,
    expectedVersion?: number,
    actor: MutationActor = {userId:actorUserId,requestId:randomUUID()},
  ) {
    const result = await this.db.withTransaction(async (client) => {
      const orderRes = await client.query(
        `SELECT id, status_code, version, store_id
         FROM ordering.merchant_orders
         WHERE id = $1
         FOR UPDATE`,
        [orderId],
      );

      if (orderRes.rows.length === 0) {
        throw new NotFoundException('Pedido no encontrado');
      }

      const order = orderRes.rows[0];
      await assertStoreAccess(client, order.store_id, actorUserId);
      if (expectedVersion!==undefined && expectedVersion!==order.version) throw new ConflictException({code:'VERSION_CONFLICT',message:'El pedido cambió; actualice antes de continuar'});
      const expected: Record<string, string> = { confirmed: 'pending', preparing: 'confirmed', ready: 'preparing' };
      if (!expected[targetStatus] || order.status_code !== expected[targetStatus]) {
        throw new ConflictException({ code: 'ORDER_STATE_CONFLICT', message: 'La transición no corresponde al estado actual' });
      }

      // Update status
      const changed = await client.query(
        `UPDATE ordering.merchant_orders
         SET status_code = $1, updated_at = now()
         WHERE id = $2 AND ($1<>'confirmed' OR acceptance_expires_at IS NULL OR acceptance_expires_at>clock_timestamp())
         RETURNING id`,
        [targetStatus, orderId],
      );
      if (!changed.rowCount) {
        if (await this.expiration.expireLocked(client,orderId)) return { expired: true as const };
        throw new ConflictException({code:'ORDER_EXPIRED_REQUIRES_REVIEW',message:'El plazo de aceptación venció; el pedido requiere revisión'});
      }

      // Record event
      await recordMutation(client,actor,'order',orderId,`order.${targetStatus}`);
      await client.query(
        `INSERT INTO ordering.order_events (
           merchant_order_id, order_version, status_code, actor_user_id, reason
         ) VALUES ($1, $2 + 1, $3, $4, $5)`,
        [orderId, order.version, targetStatus, actorUserId, reason],
      );

      return {
        expired: false as const,
        orderId,
        previousStatus: order.status_code,
        currentStatus: targetStatus,
      };
    });
    if (result.expired) throw new ConflictException({code:'ORDER_EXPIRED',message:'El pedido venció sin aceptación y sus reservas fueron liberadas'});
    const { expired, ...response } = result;
    return response;
  }

  async getUserPurchases(userId: string) {
    const res = await this.db.query(
      `SELECT p.id, p.code, p.created_at,
              ps.status as overall_status,
              pt.subtotal_cents, pt.delivery_fee_cents, pt.total_cents,
              dest.recipient_name, dest.street, dest.street_number,
              COALESCE(
                json_agg(
                  json_build_object(
                    'orderId', mo.id,
                    'storeId', mo.store_id,
                    'storeName', st.name,
                    'status', mo.status_code,
                    'deliveryFeeCents', mo.delivery_fee_cents,
                    'acceptanceExpiresAt', mo.acceptance_expires_at
                  )
                ) FILTER (WHERE mo.id IS NOT NULL),
                '[]'
              ) as store_orders
       FROM ordering.purchases p
       JOIN ordering.purchase_states ps ON p.id = ps.purchase_id
       JOIN ordering.purchase_totals pt ON p.id = pt.purchase_id
       LEFT JOIN ordering.purchase_destinations dest ON p.id = dest.purchase_id
       LEFT JOIN ordering.merchant_orders mo ON p.id = mo.purchase_id
       LEFT JOIN merchant.stores st ON mo.store_id = st.id
       WHERE p.customer_id = $1
       GROUP BY p.id, ps.status, pt.subtotal_cents, pt.delivery_fee_cents, pt.total_cents,
                dest.recipient_name, dest.street, dest.street_number
       ORDER BY p.created_at DESC`,
      [userId],
    );
    return res.rows;
  }

  async getStoreOrders(storeId: string, actorUserId: string) {
    await assertStoreAccess(this.db, storeId, actorUserId);
    const res = await this.db.query(
      `SELECT mo.id as order_id, mo.status_code, mo.delivery_fee_cents, mo.created_at, mo.version,mo.acceptance_expires_at AS "acceptanceExpiresAt",
              ot.subtotal_cents, ot.total_cents,
              dest.recipient_name, dest.phone, dest.street, dest.street_number, dest.reference,
              a.id as assignment_id, a.courier_user_id as "courierUserId", a.status as "assignmentStatus",
              cu.full_name as "courierName", cu.phone as "courierPhone",
              COALESCE(
                json_agg(
                  json_build_object(
                    'itemId', oi.id,
                    'productName', oi.product_name_at_sale,
                    'variantName', oi.variant_name_at_sale,
                    'unitPriceCents', oi.unit_price_cents,
                    'quantity', oi.quantity,
                    'note', oi.note
                  )
                ) FILTER (WHERE oi.id IS NOT NULL),
                '[]'
              ) as items
       FROM ordering.merchant_orders mo
       JOIN ordering.order_totals ot ON mo.id = ot.merchant_order_id
       JOIN ordering.purchases p ON mo.purchase_id = p.id
       LEFT JOIN ordering.purchase_destinations dest ON p.id = dest.purchase_id
       LEFT JOIN ordering.order_items oi ON mo.id = oi.merchant_order_id
       LEFT JOIN delivery.assignments a ON mo.id = a.merchant_order_id AND a.status IN ('accepted', 'picked_up', 'delivered')
       LEFT JOIN identity.users cu ON a.courier_user_id = cu.id
       WHERE mo.store_id = $1
       GROUP BY mo.id, ot.subtotal_cents, ot.total_cents,
                dest.recipient_name, dest.phone, dest.street, dest.street_number, dest.reference,
                a.id, a.courier_user_id, a.status, cu.full_name, cu.phone
       ORDER BY mo.created_at DESC`,
      [storeId],
    );
    return res.rows;
  }
}
