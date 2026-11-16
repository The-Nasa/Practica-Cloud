import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../platform/database/database.service';
import { lockAvailability } from '../../inventory/public';
import { MutationActor, recordMutation } from '../../platform/public';
import { CreatePurchaseDto } from '../infrastructure/dto/ordering.dto';
import { GroupCheckoutDto, GroupQuoteDto } from '../infrastructure/dto/group-checkout.dto';
import { QuoteDto } from '../infrastructure/dto/flow.dto';
import { OrderingService } from './ordering.service';
import { OrderFlowService } from './order-flow.service';

@Injectable()
export class GroupCheckoutService {
  constructor(private readonly db: DatabaseService, private readonly flow: OrderFlowService, private readonly orders: OrderingService) {}

  private async split(client: PoolClient, dto: CreatePurchaseDto, lock: boolean) {
    const ids = [...new Set(dto.items.map(i => i.skuId))].sort();
    const rows = (await client.query(`SELECT sk.id,p.store_id FROM catalog.skus sk
      JOIN catalog.products p ON p.id=sk.product_id JOIN merchant.stores s ON s.id=p.store_id
      WHERE sk.id=ANY($1::uuid[]) ORDER BY sk.id ${lock ? 'FOR SHARE OF sk,p,s' : ''}`, [ids])).rows;
    if (rows.length !== ids.length) throw new NotFoundException('SKU no disponible');
    const stores = [...new Set<string>(rows.map(r => r.store_id))].sort();
    if (stores.length > 10) throw new BadRequestException('Una confirmación admite hasta 10 tiendas');
    if (stores.length > 1 && dto.cashTenderCents != null) throw new BadRequestException({ code: 'CASH_PER_STORE', message: 'En compras de varias tiendas prepara el importe exacto para cada entrega' });
    if (lock) await lockAvailability(client, ids);
    return stores.map(storeId => ({ storeId, body: { ...dto, expectedTotalCents: undefined,
      items: dto.items.filter(i => rows.find(r => r.id === i.skuId)!.store_id === storeId) } }));
  }

  private async quoteParts(client: PoolClient, actorId: string, parts: Awaited<ReturnType<GroupCheckoutService['split']>>): Promise<GroupQuoteDto> {
    const stores: QuoteDto[] = [];
    for (const part of parts) stores.push(await this.flow.quoteWithClient(client, actorId, part.body));
    const sum = (field: 'subtotalCents' | 'deliveryFeeCents' | 'totalCents') => stores.reduce((n, s) => n + s[field], 0);
    const result = { stores, subtotalCents: sum('subtotalCents'), deliveryFeeCents: sum('deliveryFeeCents'), totalCents: sum('totalCents') };
    if (!Number.isSafeInteger(result.totalCents) || result.totalCents > 100000000000000) throw new BadRequestException('El importe excede el máximo permitido');
    return result;
  }

  async quote(actorId: string, dto: CreatePurchaseDto): Promise<GroupQuoteDto> {
    return this.db.withTransaction(async client => this.quoteParts(client, actorId, await this.split(client, dto, false)));
  }

  async create(actor: MutationActor, key: string | undefined, dto: CreatePurchaseDto): Promise<GroupCheckoutDto> {
    if (!key?.trim() || key.length > 200) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Envíe Idempotency-Key de 1 a 200 caracteres' });
    const hash = createHash('sha256').update(JSON.stringify({ addressId: dto.addressId, paymentMethod: dto.paymentMethod,
      expectedTotalCents: dto.expectedTotalCents ?? null, cashTenderCents: dto.cashTenderCents ?? null,
      items: dto.items.map(i => ({ skuId: i.skuId, quantity: i.quantity, note: i.note || '' })) })).digest('hex');
    return this.db.withTransaction(async client => {
      await client.query(`INSERT INTO platform.idempotency_keys(user_id,operation,key,request_hash,expires_at)
        VALUES($1,'create-checkout-group',$2,$3,now()+interval '24 hours') ON CONFLICT DO NOTHING`, [actor.userId, key, hash]);
      const entry = (await client.query(`SELECT request_hash,response_body,expires_at<=now() AS expired FROM platform.idempotency_keys
        WHERE user_id=$1 AND operation='create-checkout-group' AND key=$2 FOR UPDATE`, [actor.userId, key])).rows[0];
      if (entry.request_hash !== hash || entry.expired) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'La clave ya fue usada con otro contenido o venció' });
      if (entry.response_body) return entry.response_body;
      const parts = await this.split(client, dto, true);
      const quote = await this.quoteParts(client, actor.userId, parts);
      if (dto.expectedTotalCents !== undefined && dto.expectedTotalCents !== quote.totalCents) throw new ConflictException({ code: 'PRICE_CHANGED', message: 'El total cambió; revisa la cotización antes de confirmar' });
      const group = (await client.query('INSERT INTO ordering.checkout_groups(customer_id) VALUES($1) RETURNING id', [actor.userId])).rows[0];
      for (const [index, part] of parts.entries()) {
        const childKey = `group:${group.id}:${part.storeId}`;
        await this.orders.createPurchaseInTransaction(client, actor.userId, childKey,
          { ...part.body, expectedTotalCents: quote.stores[index].totalCents }, actor, group.id);
      }
      await recordMutation(client, actor, 'checkout', group.id, 'checkout.created', { stores: parts.length });
      const response = await this.read(client, actor.userId, group.id);
      await client.query(`UPDATE platform.idempotency_keys SET response_status=201,response_body=$3
        WHERE user_id=$1 AND operation='create-checkout-group' AND key=$2`, [actor.userId, key, response]);
      return response;
    });
  }

  private async read(client: PoolClient, userId: string, id: string): Promise<GroupCheckoutDto> {
    const group = (await client.query('SELECT id,created_at FROM ordering.checkout_groups WHERE id=$1 AND customer_id=$2', [id, userId])).rows[0];
    if (!group) throw new NotFoundException('Confirmación no encontrada');
    const orders = (await client.query(`SELECT o.id AS "orderId",p.id AS "purchaseId",o.store_id AS "storeId",s.name AS "storeName",
      'QK-'||lpad(p.code::text,6,'0') AS code,o.status_code AS status,b.status AS "paymentStatus",
      t.total_cents AS "totalCents",t.subtotal_cents AS "subtotalCents",t.delivery_fee_cents AS "deliveryFeeCents"
      FROM ordering.purchases p JOIN ordering.merchant_orders o ON o.purchase_id=p.id JOIN merchant.stores s ON s.id=o.store_id
      JOIN ordering.order_totals t ON t.merchant_order_id=o.id
      JOIN LATERAL (SELECT status FROM billing.payment_attempts WHERE purchase_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) b ON true
      WHERE p.checkout_group_id=$1 ORDER BY o.store_id`, [id])).rows;
    const sum = (field: string) => orders.reduce((n, o) => n + Number(o[field]), 0);
    return { id, createdAt: group.created_at.toISOString(), orders, subtotalCents: sum('subtotalCents'), deliveryFeeCents: sum('deliveryFeeCents'), totalCents: sum('totalCents') };
  }

  async detail(userId: string, id: string) { return this.db.withTransaction(client => this.read(client, userId, id)); }
  async attempt(userId: string, key: string) {
    const row = (await this.db.query(`SELECT response_body->>'id' AS id FROM platform.idempotency_keys
      WHERE user_id=$1 AND operation='create-checkout-group' AND key=$2`, [userId, key])).rows[0];
    if (!row?.id) throw new NotFoundException('No hay una confirmación guardada para esta solicitud');
    return this.detail(userId, row.id);
  }
}
