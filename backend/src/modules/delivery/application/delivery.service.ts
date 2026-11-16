import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../../platform/database/database.service';
import { consumeOrderStock } from '../../inventory/public';
import {MutationActor,recordMutation} from '../../platform/public';
import {assertAdmin} from '../../../platform/security/admin-access';
import {randomUUID} from 'crypto';

@Injectable()
export class DeliveryService {
  constructor(private readonly db: DatabaseService, private readonly config: ConfigService) {}

  async listAvailableOrders(courierUserId:string) {
    const res = await this.db.query(
      `SELECT mo.id as order_id, mo.store_id, mo.delivery_fee_cents, mo.created_at,
              st.name as store_name, st.address_text as store_address, st.phone as store_phone,
              ot.total_cents
       FROM ordering.merchant_orders mo
       JOIN merchant.stores st ON mo.store_id = st.id
       JOIN ordering.order_totals ot ON mo.id = ot.merchant_order_id
       LEFT JOIN delivery.assignments a ON mo.id = a.merchant_order_id AND a.status IN ('accepted', 'picked_up')
       WHERE mo.status_code = 'ready'
         AND a.id IS NULL
         AND EXISTS(SELECT 1 FROM delivery.courier_profiles c JOIN ordering.purchase_destinations d ON d.purchase_id=mo.purchase_id
           JOIN geography.coverage_zones z ON z.id=c.current_zone_id WHERE c.user_id=$1 AND c.status='active' AND c.is_online AND z.is_active AND c.current_zone_id=d.zone_id AND c.current_zone_id=st.zone_id)
       ORDER BY mo.created_at ASC`,
       [courierUserId],
    );
    return res.rows;
  }

  async getActiveAssignment(courierUserId: string) {
    const res = await this.db.query(
      `SELECT a.id as assignment_id, a.merchant_order_id, a.agreed_fee_cents, a.status as assignment_status,
              a.accepted_at, a.picked_up_at,
              mo.status_code as order_status,
              st.name as store_name, st.address_text as store_address, st.phone as store_phone,
              dest.recipient_name, dest.phone as recipient_phone,
              dest.street as dest_street, dest.street_number as dest_number, dest.reference as dest_reference,
              ot.total_cents
       FROM delivery.assignments a
       JOIN ordering.merchant_orders mo ON a.merchant_order_id = mo.id
       JOIN merchant.stores st ON mo.store_id = st.id
       JOIN ordering.order_totals ot ON mo.id = ot.merchant_order_id
       JOIN ordering.purchases p ON mo.purchase_id = p.id
       JOIN ordering.purchase_destinations dest ON p.id = dest.purchase_id
       WHERE a.courier_user_id = $1
         AND a.status IN ('accepted', 'picked_up')`,
      [courierUserId],
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  async listAvailableCouriers(actorUserId?: string) {
    const res = await this.db.query(
      `SELECT c.user_id as "courierUserId", u.full_name as "fullName", u.email, u.phone,
              c.vehicle_type as "vehicleType", c.plate, c.is_online as "isOnline",
              c.current_zone_id as "currentZoneId", z.name as "zoneName"
       FROM delivery.courier_profiles c
       JOIN identity.users u ON c.user_id = u.id
       LEFT JOIN geography.coverage_zones z ON c.current_zone_id = z.id
       WHERE c.status = 'active' AND u.status = 'active' AND c.is_online = true
       ORDER BY u.full_name ASC`,
    );
    return res.rows;
  }

  async resolveStoreId(actorUserId: string, storeId?: string): Promise<string> {
    if (storeId) {
      const access = await this.db.query(
        `SELECT 1 FROM merchant.memberships m WHERE m.store_id = $1 AND m.user_id = $2 AND m.is_active = true
         UNION SELECT 1 FROM identity.user_roles r WHERE r.user_id = $2 AND r.role_code = 'admin'`,
        [storeId, actorUserId],
      );
      if (access.rowCount) return storeId;
    }
    const mem = await this.db.query(
      `SELECT m.store_id FROM merchant.memberships m
       JOIN merchant.stores s ON m.store_id = s.id
       WHERE m.user_id = $1 AND m.is_active = true AND s.status = 'active'
       ORDER BY m.created_at ASC LIMIT 1`,
      [actorUserId],
    );
    if (!mem.rowCount) {
      throw new ForbiddenException('No tienes una tienda activa asociada a tu cuenta');
    }
    return mem.rows[0].store_id;
  }

  async listStoreCouriers(actorUserId: string, storeId?: string) {
    const activeStoreId = await this.resolveStoreId(actorUserId, storeId);
    const res = await this.db.query(
      `SELECT c.user_id as "courierUserId", u.full_name as "fullName", u.email, u.phone,
              c.vehicle_type as "vehicleType", c.plate, c.is_online as "isOnline",
              c.current_zone_id as "currentZoneId", z.name as "zoneName",
              sc.status as "associationStatus",
              (sc.courier_user_id IS NOT NULL) as "isAssociated",
              sc.created_at as "associatedAt",
              COALESCE(stats.delivered_count, 0)::int as "deliveredOrdersCount",
              COALESCE(live.has_active, false) as "hasActiveOrder"
       FROM delivery.courier_profiles c
       JOIN identity.users u ON c.user_id = u.id
       LEFT JOIN geography.coverage_zones z ON c.current_zone_id = z.id
       LEFT JOIN merchant.store_couriers sc ON sc.store_id = $1 AND sc.courier_user_id = c.user_id AND sc.status = 'active'
       LEFT JOIN (
         SELECT a.courier_user_id, count(*)::int as delivered_count
         FROM delivery.assignments a
         JOIN ordering.merchant_orders mo ON a.merchant_order_id = mo.id
         WHERE mo.store_id = $1 AND a.status = 'delivered'
         GROUP BY a.courier_user_id
       ) stats ON stats.courier_user_id = c.user_id
       LEFT JOIN (
         SELECT a.courier_user_id, true as has_active
         FROM delivery.assignments a
         WHERE a.status IN ('accepted', 'picked_up')
         GROUP BY a.courier_user_id
       ) live ON live.courier_user_id = c.user_id
       WHERE c.status = 'active' AND u.status = 'active'
       ORDER BY (sc.courier_user_id IS NOT NULL) DESC, c.is_online DESC, u.full_name ASC`,
      [activeStoreId],
    );
    return res.rows;
  }

  async associateCourierToStore(actorUserId: string, dto: { courierUserId?: string; phone?: string; notes?: string }, storeId?: string) {
    const activeStoreId = await this.resolveStoreId(actorUserId, storeId);
    let courierUserId = dto.courierUserId;
    if (!courierUserId && dto.phone) {
      const cleanPhone = dto.phone.replace(/\D/g, '');
      const userRes = await this.db.query(
        `SELECT c.user_id FROM delivery.courier_profiles c
         JOIN identity.users u ON c.user_id = u.id
         WHERE (u.phone LIKE '%' || $1 OR replace(u.phone, ' ', '') LIKE '%' || $1)
           AND c.status = 'active' LIMIT 1`,
        [cleanPhone.slice(-9)],
      );
      if (!userRes.rowCount) {
        throw new NotFoundException('No se encontró ningún repartidor activo con ese número telefónico en Tingo María');
      }
      courierUserId = userRes.rows[0].user_id;
    }
    if (!courierUserId) {
      throw new BadRequestException('Debes proporcionar el ID del repartidor o su número de celular');
    }
    await this.db.query(
      `INSERT INTO merchant.store_couriers(store_id, courier_user_id, status, notes)
       VALUES ($1, $2, 'active', $3)
       ON CONFLICT (store_id, courier_user_id) DO UPDATE SET status = 'active', notes = COALESCE($3, merchant.store_couriers.notes)`,
      [activeStoreId, courierUserId, dto.notes || null],
    );
    return this.listStoreCouriers(actorUserId, activeStoreId);
  }

  async removeCourierFromStore(actorUserId: string, courierUserId: string, storeId?: string) {
    const activeStoreId = await this.resolveStoreId(actorUserId, storeId);
    await this.db.query(
      `DELETE FROM merchant.store_couriers WHERE store_id = $1 AND courier_user_id = $2`,
      [activeStoreId, courierUserId],
    );
    return { success: true };
  }

  async getStoreDeliveryHistory(actorUserId: string, storeId?: string) {
    const activeStoreId = await this.resolveStoreId(actorUserId, storeId);
    const res = await this.db.query(
      `SELECT a.id as "assignmentId",
              mo.id as "orderId",
              'QK-' || lpad(p.code::text, 6, '0') as "orderCode",
              a.status as "assignmentStatus",
              mo.status_code as "orderStatus",
              a.agreed_fee_cents as "agreedFeeCents",
              ot.total_cents as "totalCents",
              a.accepted_at as "acceptedAt",
              a.picked_up_at as "pickedUpAt",
              a.delivered_at as "deliveredAt",
              a.cancelled_at as "cancelledAt",
              jsonb_build_object(
                'userId', u.id,
                'fullName', u.full_name,
                'phone', u.phone,
                'vehicleType', c.vehicle_type,
                'plate', c.plate
              ) as "courier",
              jsonb_build_object(
                'recipientName', dest.recipient_name,
                'phone', dest.phone,
                'street', dest.street,
                'streetNumber', dest.street_number,
                'reference', dest.reference,
                'zoneName', z.name
              ) as "customer",
              (
                SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'productName', oi.product_name,
                  'variantName', oi.variant_name,
                  'quantity', oi.quantity,
                  'unitPriceCents', oi.unit_price_cents
                )), '[]'::jsonb)
                FROM ordering.order_items oi
                WHERE oi.merchant_order_id = mo.id
              ) as "items"
       FROM delivery.assignments a
       JOIN ordering.merchant_orders mo ON a.merchant_order_id = mo.id
       JOIN ordering.purchases p ON mo.purchase_id = p.id
       JOIN ordering.purchase_destinations dest ON p.id = dest.purchase_id
       LEFT JOIN geography.coverage_zones z ON dest.zone_id = z.id
       LEFT JOIN ordering.order_totals ot ON mo.id = ot.merchant_order_id
       JOIN delivery.courier_profiles c ON a.courier_user_id = c.user_id
       JOIN identity.users u ON c.user_id = u.id
       WHERE mo.store_id = $1
       ORDER BY a.accepted_at DESC
       LIMIT 100`,
      [activeStoreId],
    );
    return res.rows;
  }

  async claimOrder(orderId: string, courierUserId: string, expectedVersion?:number, actor:MutationActor={userId:courierUserId,requestId:randomUUID()},reason?:string) {
    return this.db.withTransaction(async (client) => {
      if (actor.userId !== courierUserId) {
        // Allow store owners/members of the store that owns this order, or platform admin
        const isMerchantOfOrder = await client.query(
          `SELECT 1 FROM ordering.merchant_orders mo
           JOIN merchant.memberships m ON mo.store_id = m.store_id
           WHERE mo.id = $1 AND m.user_id = $2 AND m.is_active = true`,
          [orderId, actor.userId],
        );
        if (!isMerchantOfOrder.rowCount) {
          await assertAdmin(client, actor.userId);
        }
      }
      // 1. Verify courier profile is active and has courier role
      const profileRes = await client.query(
        `SELECT c.user_id,c.status,c.is_online FROM delivery.courier_profiles c JOIN identity.users u ON u.id=c.user_id
         WHERE c.user_id=$1 AND u.status='active' AND EXISTS(SELECT 1 FROM identity.user_roles r WHERE r.user_id=c.user_id AND r.role_code='courier') FOR UPDATE OF c`,
        [courierUserId],
      );

      if (profileRes.rows.length === 0 || profileRes.rows[0].status !== 'active') {
        throw new ForbiddenException('Perfil de repartidor inexistente o no habilitado');
      }
      if (!profileRes.rows[0].is_online) {
        throw new ConflictException({ code: 'COURIER_OFFLINE', message: 'Debe estar disponible para tomar una entrega' });
      }
      const coverage = await client.query(`SELECT 1 FROM delivery.courier_profiles c JOIN geography.coverage_zones z ON z.id=c.current_zone_id
        WHERE c.user_id=$1 AND z.is_active FOR SHARE OF z`, [courierUserId]);
      if (!coverage.rowCount) throw new ConflictException({ code: 'COURIER_ZONE_INACTIVE', message: 'Seleccione una zona activa antes de tomar una entrega' });

      // Check if courier already has an active assignment (1 delivery per courier MVP)
      const activeRes = await client.query(
        `SELECT id FROM delivery.assignments WHERE courier_user_id = $1 AND status IN ('accepted', 'picked_up')`,
        [courierUserId],
      );
      if (activeRes.rows.length > 0) {
        throw new ConflictException({
          code: 'COURIER_BUSY',
          message: 'El repartidor ya cuenta con una entrega activa en curso',
        });
      }

      // 2. Lock order and check status is 'ready', 'confirmed', or 'preparing'
      const orderRes = await client.query(
        `SELECT o.id,o.status_code,o.delivery_fee_cents,o.version,s.name as store_name,s.zone_id,d.zone_id AS destination_zone FROM ordering.merchant_orders o
         JOIN merchant.stores s ON s.id=o.store_id JOIN ordering.purchase_destinations d ON d.purchase_id=o.purchase_id WHERE o.id=$1 FOR UPDATE OF o`,
        [orderId],
      );

      if (orderRes.rows.length === 0) {
        throw new NotFoundException('Pedido no encontrado');
      }

      const order = orderRes.rows[0];
      if(expectedVersion!==undefined&&expectedVersion!==order.version)throw new ConflictException({code:'VERSION_CONFLICT',message:'El pedido cambió; actualice la lista'});
      const zone=(await client.query('SELECT current_zone_id FROM delivery.courier_profiles WHERE user_id=$1',[courierUserId])).rows[0].current_zone_id;
      if(zone!==order.zone_id||zone!==order.destination_zone)throw new ConflictException('El repartidor no cubre la zona del pedido');
      if (!['ready', 'confirmed', 'preparing'].includes(order.status_code)) {
        throw new ConflictException({
          code: 'ORDER_NOT_READY',
          message: `El pedido está en estado '${order.status_code}', solo se pueden asignar pedidos confirmados, en preparación o listos`,
        });
      }

      const existing = await client.query(
        `SELECT id FROM delivery.assignments WHERE merchant_order_id = $1 AND status IN ('accepted', 'picked_up')`, [orderId],
      );
      if (existing.rowCount) throw new ConflictException({ code: 'ORDER_ALREADY_CLAIMED', message: 'El pedido ya tiene un repartidor asignado' });
      // Provisional development policy; business must approve before pilot (D06).
      const feeBps = Number(this.config.get('COURIER_FEE_BPS', '8000'));
      if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) throw new Error('Invalid COURIER_FEE_BPS');
      const agreedFeeCents = Math.round(Number(order.delivery_fee_cents) * feeBps / 10000);
      const assignRes = await client.query(
        `INSERT INTO delivery.assignments (
           merchant_order_id, courier_user_id, agreed_fee_cents, status
         ) VALUES ($1, $2, $3, 'accepted')
         RETURNING id, status, agreed_fee_cents, accepted_at`,
        [orderId, courierUserId, agreedFeeCents],
      );
      await recordMutation(client,actor,'order',orderId,'delivery.claimed',{assignmentId:assignRes.rows[0].id,courierUserId,...(reason?{reason}:{})});

      // Send notification to courier in platform.notifications
      await client.query(
        `INSERT INTO platform.notifications (user_id, kind, title, message, relative_url)
         VALUES ($1, 'delivery', '¡Nueva entrega asignada!', 'Se te ha asignado un pedido de ' || $2 || '.', '/repartidor/pedidos')`,
        [courierUserId, order.store_name || 'la tienda'],
      );

      return assignRes.rows[0];
    });
  }

  async releaseAssignment(assignmentId:string,actor:MutationActor,reason:string,expectedVersion?:number){
    return this.db.withTransaction(async client=>{
      const row=(await client.query(`SELECT a.id,a.courier_user_id,a.status,a.version,a.merchant_order_id,o.status_code FROM delivery.assignments a JOIN ordering.merchant_orders o ON o.id=a.merchant_order_id WHERE a.id=$1 FOR UPDATE`,[assignmentId])).rows[0];
      if(!row)throw new NotFoundException('Asignación no encontrada');
      if(row.courier_user_id!==actor.userId)await assertAdmin(client,actor.userId);
      if(expectedVersion!==undefined&&row.version!==expectedVersion)throw new ConflictException({code:'VERSION_CONFLICT',message:'La asignación cambió'});
      if(row.status!=='accepted'||row.status_code!=='ready')throw new ConflictException('Solo se libera una asignación antes del retiro');
      await client.query("UPDATE delivery.assignments SET status='cancelled',cancelled_at=now() WHERE id=$1",[assignmentId]);
      await recordMutation(client,actor,'order',row.merchant_order_id,'delivery.released',{assignmentId,reason});
      return{orderId:row.merchant_order_id};
    });
  }
  async reportIncident(assignmentId:string,actor:MutationActor,reason:string,expectedVersion:number){
    return this.db.withTransaction(async client=>{
      const row=(await client.query("SELECT merchant_order_id,version FROM delivery.assignments WHERE id=$1 AND courier_user_id=$2 AND status IN ('accepted','picked_up') FOR UPDATE",[assignmentId,actor.userId])).rows[0];
      if(!row)throw new NotFoundException('Asignación activa no encontrada');
      if(row.version!==expectedVersion)throw new ConflictException({code:'VERSION_CONFLICT',message:'La asignación cambió'});
      const existing=(await client.query('SELECT id,ticket_id AS "ticketId" FROM delivery.incidents WHERE assignment_id=$1 AND reported_by_user_id=$2 AND description=$3 AND ticket_id IS NOT NULL ORDER BY created_at DESC LIMIT 1',[assignmentId,actor.userId,reason])).rows[0];
      if(existing)return existing;
      const ticket=(await client.query(`INSERT INTO support.tickets(requester_user_id,merchant_order_id,subject,priority) VALUES($1,$2,'Incidencia de reparto','high') RETURNING id`,[actor.userId,row.merchant_order_id])).rows[0];
      await client.query('INSERT INTO support.ticket_messages(ticket_id,author_user_id,body) VALUES($1,$2,$3)',[ticket.id,actor.userId,reason]);
      const inserted=(await client.query('INSERT INTO delivery.incidents(assignment_id,reported_by_user_id,description,ticket_id) VALUES($1,$2,$3,$4) RETURNING id,ticket_id AS "ticketId"',[assignmentId,actor.userId,reason,ticket.id])).rows[0];
      await recordMutation(client,actor,'ticket',ticket.id,'support.created');
      await recordMutation(client,actor,'order',row.merchant_order_id,'delivery.incident_reported',{assignmentId,incidentId:inserted.id});
      return inserted;
    });
  }
  async pickupDelivery(assignmentId: string, courierUserId: string, expectedVersion?:number,actor:MutationActor={userId:courierUserId,requestId:randomUUID()}) {
    return this.db.withTransaction(async (client) => {
      // 1. Lock assignment
      const assignRes = await client.query(
        `SELECT a.id, a.merchant_order_id, a.status, mo.version,a.version AS assignment_version
         FROM delivery.assignments a
         JOIN ordering.merchant_orders mo ON a.merchant_order_id = mo.id
         WHERE a.id = $1 AND a.courier_user_id = $2
         FOR UPDATE`,
        [assignmentId, courierUserId],
      );

      if (assignRes.rows.length === 0) {
        throw new NotFoundException('Asignación no encontrada o no pertenece al repartidor');
      }

      const assignment = assignRes.rows[0];
      if(expectedVersion!==undefined&&expectedVersion!==assignment.assignment_version)throw new ConflictException({code:'VERSION_CONFLICT',message:'La asignación cambió; actualice la entrega'});
      if (assignment.status !== 'accepted') {
        throw new ConflictException('La asignación no se encuentra en estado inicial');
      }

      // 2. Order items and physical stock deduction (Section 8.3)
      await consumeOrderStock(client,assignment.merchant_order_id,courierUserId);

      // 3. Update assignment -> picked_up
      await client.query(
        `UPDATE delivery.assignments
         SET status = 'picked_up', picked_up_at = now()
         WHERE id = $1`,
        [assignmentId],
      );

      // 4. Update order status -> in_transit
      await client.query(
        `UPDATE ordering.merchant_orders
         SET status_code = 'in_transit', updated_at = now()
         WHERE id = $1`,
        [assignment.merchant_order_id],
      );

      // 5. Record order event
      await recordMutation(client,actor,'order',assignment.merchant_order_id,'delivery.picked_up',{assignmentId});
      await client.query(
        `INSERT INTO ordering.order_events (
           merchant_order_id, order_version, status_code, actor_user_id, reason
         ) VALUES ($1, $2 + 1, 'in_transit', $3, 'Repartidor retiró el pedido del comercio')`,
        [assignment.merchant_order_id, assignment.version, courierUserId],
      );

      return {
        assignmentId,
        status: 'picked_up',
        orderStatus: 'in_transit',
      };
    });
  }

  async completeDelivery(assignmentId: string, courierUserId: string,cashReceivedCents:number,expectedVersion?:number,actor:MutationActor={userId:courierUserId,requestId:randomUUID()}) {
    return this.db.withTransaction(async (client) => {
      // 1. Lock assignment
      const assignRes = await client.query(
        `SELECT a.id, a.merchant_order_id, a.status, mo.version, mo.purchase_id,a.version AS assignment_version
         FROM delivery.assignments a
         JOIN ordering.merchant_orders mo ON a.merchant_order_id = mo.id
         WHERE a.id = $1 AND a.courier_user_id = $2
         FOR UPDATE`,
        [assignmentId, courierUserId],
      );

      if (assignRes.rows.length === 0) {
        throw new NotFoundException('Asignación no encontrada');
      }

      const assignment = assignRes.rows[0];
      if(expectedVersion!==undefined&&expectedVersion!==assignment.assignment_version)throw new ConflictException({code:'VERSION_CONFLICT',message:'La asignación cambió; actualice la entrega'});
      if (assignment.status !== 'picked_up') {
        throw new ConflictException('Solo se pueden entregar pedidos previamente retirados (picked_up)');
      }
      const payment=(await client.query(`SELECT id,amount_cents,status,method_code FROM billing.payment_attempts WHERE purchase_id=$1 ORDER BY id FOR UPDATE`,[assignment.purchase_id])).rows;
      if(payment.length!==1||payment[0].method_code!=='cash'||payment[0].status!=='pending')throw new ConflictException('El cobro requiere revisión');
      if(!Number.isSafeInteger(cashReceivedCents)||cashReceivedCents<Number(payment[0].amount_cents))throw new ConflictException({code:'INSUFFICIENT_CASH',message:'El efectivo recibido no cubre el total'});

      // 2. Mark assignment delivered
      await client.query(
        `UPDATE delivery.assignments
         SET status = 'delivered', delivered_at = now()
         WHERE id = $1`,
        [assignmentId],
      );

      // 3. Mark merchant order delivered
      await client.query(
        `UPDATE ordering.merchant_orders
         SET status_code = 'delivered', updated_at = now()
         WHERE id = $1`,
        [assignment.merchant_order_id],
      );

      // 4. Record order event
      await client.query(
        `INSERT INTO ordering.order_events (
           merchant_order_id, order_version, status_code, actor_user_id, reason
         ) VALUES ($1, $2 + 1, 'delivered', $3, 'Pedido entregado al cliente')`,
        [assignment.merchant_order_id, assignment.version, courierUserId],
      );

      // 5. If cash payment, mark payment_attempt succeeded (Section 8.3)
      await client.query(
        `UPDATE billing.payment_attempts
         SET status = 'succeeded', succeeded_at = now(), collected_by_user_id = $1,cash_received_cents=$3
         WHERE purchase_id = $2 AND method_code = 'cash' AND status = 'pending'`,
        [courierUserId, assignment.purchase_id,cashReceivedCents],
      );
      await recordMutation(client,actor,'order',assignment.merchant_order_id,'delivery.delivered',{assignmentId});

      return {
        assignmentId,
        status: 'delivered',
        orderStatus: 'delivered',
        message: 'Entrega finalizada exitosamente',
      };
    });
  }
}
