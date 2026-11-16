import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';
import { assertAdmin } from '../../../platform/security/admin-access';
import { assertStoreMember, assertStoreOrderable } from '../../merchant/public';
import { pageOf } from '../../../platform/http/list-query.dto';
import { CreatePurchaseDto } from '../infrastructure/dto/ordering.dto';
import { OrderQueryDto } from '../infrastructure/dto/flow.dto';
import { PoolClient } from 'pg';

const selection=`o.id,o.purchase_id AS "purchaseId",p.checkout_group_id AS "checkoutGroupId",'QK-'||lpad(p.code::text,6,'0') AS code,o.store_id AS "storeId",s.name AS "storeName",
  o.status_code AS status,o.version,t.subtotal_cents AS "subtotalCents",o.delivery_fee_cents AS "deliveryFeeCents",t.total_cents AS "totalCents",
  o.created_at AS "createdAt",o.acceptance_expires_at AS "acceptanceExpiresAt",pay.status AS "paymentStatus",
  pay.cash_tender_cents AS "cashTenderCents",pay.cash_received_cents AS "cashReceivedCents",pay.collected_by_user_id AS "collectedByUserId",
  (SELECT jsonb_build_object('id',a.id,'courierUserId',a.courier_user_id,'status',a.status,'version',a.version,'agreedFeeCents',a.agreed_fee_cents)
   FROM delivery.assignments a WHERE a.merchant_order_id=o.id ORDER BY (a.status IN ('accepted','picked_up')) DESC,a.accepted_at DESC,a.id DESC LIMIT 1) AS assignment`;
const from=` FROM ordering.merchant_orders o JOIN ordering.purchases p ON p.id=o.purchase_id
  JOIN merchant.stores s ON s.id=o.store_id JOIN ordering.order_totals t ON t.merchant_order_id=o.id
  JOIN LATERAL (SELECT * FROM billing.payment_attempts b WHERE b.purchase_id=p.id ORDER BY b.created_at DESC,b.id DESC LIMIT 1) pay ON true`;

@Injectable()
export class OrderFlowService {
  constructor(private readonly db: DatabaseService) {}
  async attempt(actorId:string,key:string){
    const row=(await this.db.query("SELECT response_body FROM platform.idempotency_keys WHERE user_id=$1 AND operation='create-purchase' AND key=$2",[actorId,key])).rows[0];
    if(!row?.response_body?.orderId)throw new NotFoundException('No hay una respuesta confirmada para esta solicitud');
    return this.detail(actorId,row.response_body.orderId);
  }
  async quote(actorId: string,dto: CreatePurchaseDto) {
    return this.db.withTransaction(client => this.quoteWithClient(client, actorId, dto));
  }
  async quoteWithClient(client: PoolClient, actorId: string, dto: CreatePurchaseDto) {
      const address=(await client.query(`SELECT a.zone_id,z.base_fee_cents FROM geography.addresses a JOIN geography.coverage_zones z ON z.id=a.zone_id
        WHERE a.id=$1 AND a.user_id=$2 AND a.archived_at IS NULL AND z.is_active`,[dto.addressId,actorId])).rows[0];
      if(!address)throw new NotFoundException('Dirección no disponible');
      const rows=(await client.query(`SELECT sk.id,sk.variant_name,sk.price_cents,sk.is_active,p.is_active AS product_active,p.name,p.store_id,s.name AS store_name,s.zone_id,s.minimum_order_cents,
        COALESCE(a.available,0) AS available FROM catalog.skus sk JOIN catalog.products p ON p.id=sk.product_id JOIN merchant.stores s ON s.id=p.store_id
        LEFT JOIN inventory.availability a ON a.sku_id=sk.id WHERE sk.id=ANY($1::uuid[])`,[dto.items.map(i=>i.skuId)])).rows;
      const requested=new Map<string,number>();for(const i of dto.items)requested.set(i.skuId,(requested.get(i.skuId)||0)+i.quantity);
      if(rows.length!==requested.size)throw new NotFoundException('SKU no disponible');
      if(new Set(rows.map(r=>r.store_id)).size!==1)throw new BadRequestException('Selecciona productos de una sola tienda');
      const store=rows[0];await assertStoreOrderable(client,store.store_id);
      const isStoreMember = (await client.query(
        `SELECT 1 FROM merchant.memberships WHERE user_id = $1 AND store_id = $2`,
        [actorId, store.store_id],
      )).rowCount;
      if (isStoreMember) {
        throw new ForbiddenException({
          code: 'MERCHANT_CANNOT_ORDER_OWN_STORE',
          message: 'Una tienda no puede cotizar ni realizar pedidos a su propio comercio.',
        });
      }
      const isMerchant = (await client.query(
        `SELECT 1 FROM identity.user_roles WHERE user_id = $1 AND role_code = 'merchant'`,
        [actorId],
      )).rowCount;
      if (isMerchant) {
        throw new ForbiddenException({
          code: 'MERCHANT_CANNOT_PLACE_ORDERS',
          message: 'Las cuentas de comercio están destinadas a la gestión de su tienda y no pueden cotizar pedidos.',
        });
      }
      if(!address||!address.zone_id)throw new ConflictException('La dirección de entrega no cuenta con una zona de reparto activa');
      for(const row of rows)if(!row.is_active||!row.product_active||Number(row.available)<requested.get(row.id)!)throw new ConflictException({code:'OUT_OF_STOCK',message:'Un producto no está disponible en la cantidad solicitada'});
      const items=dto.items.map(i=>{const sku=rows.find(r=>r.id===i.skuId)!;return{skuId:i.skuId,quantity:i.quantity,productName:sku.name,variantName:sku.variant_name,unitPriceCents:Number(sku.price_cents),note:i.note||''};});
      const subtotalCents=items.reduce((n,i)=>n+i.unitPriceCents*i.quantity,0);const totalCents=subtotalCents+Number(address.base_fee_cents);
      if(subtotalCents<Number(store.minimum_order_cents))throw new ConflictException('No se alcanza el mínimo de compra');
      if(totalCents>100000000000000)throw new BadRequestException('El importe excede el máximo permitido');
      const cashTenderCents=dto.cashTenderCents??totalCents;if(cashTenderCents<totalCents)throw new ConflictException({code:'INSUFFICIENT_CASH',message:'El efectivo previsto no cubre el total'});
      return{storeId:store.store_id,storeName:store.store_name,items,subtotalCents,deliveryFeeCents:Number(address.base_fee_cents),totalCents,cashTenderCents,cashChangeCents:cashTenderCents-totalCents,paymentMethods:['cash']};
  }
  async list(actorId:string,kind:'customer'|'merchant'|'admin'|'courier',query:OrderQueryDto,storeId?:string){
    return this.db.withTransaction(async client=>{
      if(kind==='admin')await assertAdmin(client,actorId);
      if(kind==='merchant')await assertStoreMember(client,storeId!,actorId);
      let filter=kind==='customer'?'p.customer_id=$1':kind==='merchant'?'o.store_id=$5':kind==='admin'?'true':`EXISTS(SELECT 1 FROM delivery.assignments mine WHERE mine.merchant_order_id=o.id AND mine.courier_user_id=$1 AND ${query.scope==='active' ? "mine.status IN ('accepted','picked_up')" : "mine.status IN ('delivered','cancelled')"})`;
      if(kind==='courier'&&query.scope==='available')filter=`o.status_code='ready' AND NOT EXISTS(SELECT 1 FROM delivery.assignments live WHERE live.merchant_order_id=o.id AND live.status IN ('accepted','picked_up'))
        AND EXISTS(SELECT 1 FROM delivery.courier_profiles c JOIN geography.coverage_zones z ON z.id=c.current_zone_id JOIN ordering.purchase_destinations d ON d.purchase_id=p.id
        WHERE c.user_id=$1 AND c.status='active' AND c.is_online AND z.is_active AND c.current_zone_id=d.zone_id AND c.current_zone_id=s.zone_id)
        AND NOT EXISTS(SELECT 1 FROM delivery.assignments busy WHERE busy.courier_user_id=$1 AND busy.status IN ('accepted','picked_up'))`;
      const fields=kind==='courier'?selection.replace('WHERE a.merchant_order_id=o.id','WHERE a.merchant_order_id=o.id AND a.courier_user_id=$1'):selection;
      const result=await client.query(`SELECT ${fields}${from} WHERE (${filter}) AND ($2::uuid IS NULL OR o.id>$2) AND ($3::text IS NULL OR o.status_code=$3)
        AND $1::uuid IS NOT NULL AND ($5::uuid IS NULL OR true) ORDER BY o.id LIMIT $4`,[actorId,query.cursor||null,query.status||null,query.limit+1,storeId||null]);
      return pageOf(result.rows,query.limit);
    });
  }
  async detail(actorId:string,id:string,byPurchase=false){
    return this.db.withTransaction(async client=>{
      const row=(await client.query(`SELECT ${selection},p.customer_id AS "customerId"${from} WHERE ${byPurchase?'o.purchase_id':'o.id'}=$1`,[id])).rows[0];
      if(!row)throw new NotFoundException('Pedido no encontrado');
      let courierOnly=false;let canSeeIncidents=false;
      if(row.customerId!==actorId){
        const role=await client.query("SELECT 1 FROM identity.user_roles WHERE user_id=$1 AND role_code='admin'",[actorId]);
        canSeeIncidents=!!role.rowCount;
        const member=await client.query('SELECT 1 FROM merchant.memberships WHERE store_id=$1 AND user_id=$2 AND is_active',[row.storeId,actorId]);
        if(!role.rowCount&&!member.rowCount){
          if(!row.assignment||row.assignment.courierUserId!==actorId||!['accepted','picked_up','delivered'].includes(row.assignment.status))throw new NotFoundException('Pedido no encontrado o sin acceso');
          courierOnly=true;
          canSeeIncidents=true;
        }
      }
      if(byPurchase&&row.customerId!==actorId)throw new NotFoundException('Compra no encontrada');
      const items=(await client.query(`SELECT sku_id AS "skuId",product_name_at_sale AS "productName",variant_name_at_sale AS "variantName",quantity,unit_price_cents AS "unitPriceCents",note FROM ordering.order_items WHERE merchant_order_id=$1 ORDER BY id`,[row.id])).rows;
      const events=(await client.query(`SELECT status_code AS status,COALESCE(reason,'') AS reason,occurred_at AS "occurredAt" FROM ordering.order_events WHERE merchant_order_id=$1 ORDER BY order_version`,[row.id])).rows;
      const destination=courierOnly&&row.assignment.status==='delivered'?null:(await client.query(`SELECT recipient_name AS "recipientName",phone,street,street_number AS "streetNumber",reference FROM ordering.purchase_destinations WHERE purchase_id=$1`,[row.purchaseId])).rows[0]||null;
      const incidents=canSeeIncidents?(await client.query(`SELECT i.id,i.description,i.created_at AS "createdAt" FROM delivery.incidents i JOIN delivery.assignments a ON a.id=i.assignment_id WHERE a.merchant_order_id=$1 ORDER BY i.created_at,i.id`,[row.id])).rows:undefined;
      const {customerId,...summary}=row;return{...summary,items,events,destination,...(incidents?{incidents}:{})};
    });
  }
  async couriers(actorId:string,storeId?:string){return this.db.withTransaction(async client=>{await assertAdmin(client,actorId);return(await client.query(`SELECT c.user_id AS "userId",u.full_name AS "fullName" FROM delivery.courier_profiles c JOIN identity.users u ON u.id=c.user_id
    JOIN geography.coverage_zones z ON z.id=c.current_zone_id WHERE c.status='active' AND c.is_online AND u.status='active' AND z.is_active
    AND ($1::uuid IS NULL OR c.current_zone_id=(SELECT zone_id FROM merchant.stores WHERE id=$1))
    AND NOT EXISTS(SELECT 1 FROM delivery.assignments a WHERE a.courier_user_id=c.user_id AND a.status IN ('accepted','picked_up')) ORDER BY u.full_name,c.user_id`,[storeId||null])).rows;});}
}
