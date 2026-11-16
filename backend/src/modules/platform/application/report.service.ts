import {BadRequestException,ForbiddenException,Injectable} from '@nestjs/common';
import {DatabaseService} from '../../../platform/database/database.service';
import {assertAdmin} from '../../../platform/security/admin-access';
import {assertStoreMember} from '../../merchant/public';
import {ReportQuery,AuditQuery} from '../infrastructure/report.dto';
@Injectable()
export class ReportService {
 constructor(private readonly db:DatabaseService){}
 async report(actor:string,kind:'admin'|'merchant'|'courier',q:ReportQuery,storeId?:string){return this.db.withTransaction(async c=>{
  if(kind==='admin')await assertAdmin(c,actor);
  if(kind==='merchant')await assertStoreMember(c,storeId!,actor);
  if(kind==='courier'&&!(await c.query(`SELECT user_id FROM identity.user_roles WHERE user_id=$1 AND role_code='courier'`,[actor])).rowCount)throw new ForbiddenException('Se requiere perfil de reparto');
  const end=q.to?new Date(q.to):new Date();const start=q.from?new Date(q.from):new Date(end.getTime()-30*86400000);
  if(start>=end||end.getTime()-start.getTime()>366*86400000)throw new BadRequestException('El rango debe ser positivo y de hasta 366 días');
  const filter=kind==='merchant'?'o.store_id=$3':kind==='courier'?`EXISTS(SELECT 1 FROM delivery.assignments a WHERE a.merchant_order_id=o.id AND a.courier_user_id=$3 AND a.status='delivered')`:'$3::uuid IS NULL';
  const r=(await c.query(`WITH eligible AS (SELECT o.id,o.status_code,o.purchase_id,t.total_cents FROM ordering.merchant_orders o JOIN ordering.order_totals t ON t.merchant_order_id=o.id WHERE o.created_at >= $1 AND o.created_at < $2 AND ${filter})
   SELECT count(*)::int AS orders,count(*) FILTER(WHERE status_code='delivered')::int AS delivered,count(*) FILTER(WHERE status_code IN ('cancelled','rejected'))::int AS cancelled,
   COALESCE(sum(total_cents) FILTER(WHERE status_code='delivered'),0)::bigint AS "deliveredSalesCents",
   COALESCE((SELECT sum(b.amount_cents) FROM billing.payment_attempts b WHERE b.method_code='cash' AND b.status='succeeded' AND b.purchase_id IN(SELECT purchase_id FROM eligible)),0)::bigint AS "cashCollectedCents",
   COALESCE((SELECT sum(a.agreed_fee_cents) FROM delivery.assignments a WHERE a.status='delivered' AND a.merchant_order_id IN(SELECT id FROM eligible)),0)::bigint AS "courierFeesCents" FROM eligible`,[start.toISOString(),end.toISOString(),kind==='admin'?null:kind==='merchant'?storeId:actor])).rows[0];
  for (const field of ['deliveredSalesCents','cashCollectedCents','courierFeesCents']) { r[field] = Number(r[field]); if (!Number.isSafeInteger(r[field]) || r[field] < 0) throw new BadRequestException('El importe del reporte excede el rango permitido'); }
  return {...r,from:start.toISOString(),to:end.toISOString(),currency:'PEN',definition:'Cohorte por creación del pedido [inicio, fin), estado vigente. Ventas: total de pedidos entregados incluido envío. Cobros: importe neto de efectivo confirmado de esa cohorte, no billetes recibidos. Tarifas: asignaciones entregadas. No representa saldo ni liquidación.'};
 });}
 async audit(actor:string,q:AuditQuery){return this.db.withTransaction(async c=>{await assertAdmin(c,actor);const rows=(await c.query(`SELECT id::text,actor_user_id AS "actorUserId",action,entity_type AS "entityType",entity_id AS "entityId",request_id AS "requestId",occurred_at AS "occurredAt" FROM platform.audit_entries WHERE ($1::numeric IS NULL OR id<$1::numeric) AND ($2::text IS NULL OR action=$2) ORDER BY id DESC LIMIT 51`,[q.cursor||null,q.action||null])).rows;return {items:rows.slice(0,50),nextCursor:rows.length>50?rows[49].id:null};});}
}
