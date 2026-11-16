import {Injectable,NotFoundException,ConflictException} from '@nestjs/common';
import {DatabaseService} from '../../platform/database/database.service';
import {ListQueryDto,pageOf} from '../../platform/http/list-query.dto';
import {MutationActor,recordMutation} from '../platform/public';
import {ReviewInput} from './engagement.dto';
@Injectable()
export class EngagementService {
 constructor(private readonly db:DatabaseService){}
 async favorites(userId:string,q:ListQueryDto){
  const rows=(await this.db.query(`SELECT * FROM (
   SELECT p.id,'product' AS kind,p.name,(p.is_active AND s.status='active' AND z.is_active) AS available
   FROM catalog.product_favorites f JOIN catalog.products p ON p.id=f.product_id JOIN merchant.stores s ON s.id=p.store_id JOIN geography.coverage_zones z ON z.id=s.zone_id WHERE f.user_id=$1
   UNION ALL SELECT s.id,'store',s.name,(s.status='active' AND z.is_active) FROM catalog.favorites f JOIN merchant.stores s ON s.id=f.store_id JOIN geography.coverage_zones z ON z.id=s.zone_id WHERE f.user_id=$1
  ) f WHERE ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,[userId,q.cursor||null,q.limit+1])).rows;
  return pageOf(rows,q.limit);
 }
 async favorite(actor:MutationActor,kind:'products'|'stores',id:string,enabled:boolean){
  return this.db.withTransaction(async c=>{
   const product=kind==='products';const table=product?'catalog.product_favorites':'catalog.favorites';const column=product?'product_id':'store_id';
   if(enabled){
    const row=await c.query(product?`SELECT p.id FROM catalog.products p JOIN merchant.stores s ON s.id=p.store_id JOIN geography.coverage_zones z ON z.id=s.zone_id WHERE p.id=$1 AND p.is_active AND s.status='active' AND z.is_active`:`SELECT s.id FROM merchant.stores s JOIN geography.coverage_zones z ON z.id=s.zone_id WHERE s.id=$1 AND s.status='active' AND z.is_active`,[id]);
    if(!row.rowCount)throw new NotFoundException('Favorito no disponible');
   }
   const result=await c.query(enabled?`INSERT INTO ${table}(user_id,${column}) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id`:`DELETE FROM ${table} WHERE user_id=$1 AND ${column}=$2 RETURNING user_id`,[actor.userId,id]);
   if(result.rowCount)await recordMutation(c,actor,product?'product':'store',id,enabled?'favorite.added':'favorite.removed');
  });
 }
 async review(actor:MutationActor,id:string,dto:ReviewInput){
  return this.db.withTransaction(async c=>{
   const row=(await c.query(`SELECT o.status_code FROM ordering.merchant_orders o JOIN ordering.purchases p ON p.id=o.purchase_id WHERE o.id=$1 AND p.customer_id=$2 FOR UPDATE OF o`,[id,actor.userId])).rows[0];
   if(!row)throw new NotFoundException('Pedido no disponible');
   if(row.status_code!=='delivered')throw new ConflictException('Solo puedes reseñar pedidos entregados');
   const result=await c.query(`INSERT INTO ordering.reviews(merchant_order_id,rating,comment) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING merchant_order_id AS id,rating,comment,created_at AS "createdAt"`,[id,dto.rating,dto.comment||null]);
   if(!result.rowCount)throw new ConflictException('Este pedido ya tiene una reseña');
   await recordMutation(c,actor,'order',id,'order.reviewed',{rating:dto.rating});return result.rows[0];
  });
 }
 async reviews(storeId:string,q:ListQueryDto){
  if(!(await this.db.query(`SELECT s.id FROM merchant.stores s JOIN geography.coverage_zones z ON z.id=s.zone_id WHERE s.id=$1 AND s.status='active' AND z.is_active`,[storeId])).rowCount)throw new NotFoundException('Tienda no disponible');
  const rows=(await this.db.query(`SELECT r.merchant_order_id AS id,r.rating,r.comment,r.created_at AS "createdAt" FROM ordering.reviews r JOIN ordering.merchant_orders o ON o.id=r.merchant_order_id WHERE o.store_id=$1 AND ($2::uuid IS NULL OR r.merchant_order_id>$2) ORDER BY r.merchant_order_id LIMIT $3`,[storeId,q.cursor||null,q.limit+1])).rows;
  const totals=(await this.db.query(`SELECT count(*)::int AS count,avg(r.rating)::float AS average FROM ordering.reviews r JOIN ordering.merchant_orders o ON o.id=r.merchant_order_id WHERE o.store_id=$1`,[storeId])).rows[0];return {...pageOf(rows,q.limit),...totals};
 }
}
