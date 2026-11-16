import { BadRequestException, ConflictException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { MutationActor, recordMutation } from '../platform/public';

/** Transactional inventory facade. The caller supplies its current PostgreSQL client.
 * Lock physical rows before reading availability; all multi-SKU callers use UUID order.
 * Reservations never expire merely because their timestamp has passed. Order policy
 * must authorize cancellation/rejection first, then call releaseOrderStock.
 */
export async function lockAvailability(client: PoolClient, skuIds: string[]) {
  const ids = [...new Set(skuIds)].sort();
  await client.query('SELECT sku_id FROM inventory.stock WHERE sku_id=ANY($1::uuid[]) ORDER BY sku_id FOR UPDATE', [ids]);
  return (await client.query('SELECT sku_id,on_hand,reserved,available FROM inventory.availability WHERE sku_id=ANY($1::uuid[]) ORDER BY sku_id', [ids])).rows;
}
export async function initializeStock(client: PoolClient, skuId: string, quantity: number, threshold: number, actor: MutationActor) {
  await client.query('INSERT INTO inventory.stock(sku_id,on_hand,low_stock_threshold) VALUES($1,$2,$3)', [skuId,quantity,threshold]);
  if (quantity) await client.query(`INSERT INTO inventory.movements(sku_id,actor_user_id,kind,quantity,on_hand_after,reason)
    VALUES($1,$2,'initial',$3,$3,'Existencia inicial')`, [skuId,actor.userId,quantity]);
}
export async function adjustStock(client: PoolClient, skuId: string, quantity: number, reason: string, actor: MutationActor) {
  if (!quantity || !reason.trim()) throw new BadRequestException('El ajuste requiere cantidad distinta de cero y motivo');
  const [stock] = await lockAvailability(client,[skuId]);
  const next = Number(stock.on_hand) + quantity;
  if (next < Number(stock.reserved) || next > 2147483647) throw new ConflictException({ code: 'STOCK_RESERVED', message: 'El ajuste excede el rango permitido o afecta unidades reservadas' });
  await client.query('UPDATE inventory.stock SET on_hand=$2,updated_at=now() WHERE sku_id=$1',[skuId,next]);
  const movement = (await client.query(`INSERT INTO inventory.movements(sku_id,actor_user_id,kind,quantity,on_hand_after,reason)
    VALUES($1,$2,'adjustment',$3,$4,$5) RETURNING id,kind,quantity,on_hand_after AS "onHandAfter",reason,
    actor_user_id AS "actorUserId",created_at AS "createdAt"`, [skuId,actor.userId,quantity,next,reason.trim()])).rows[0];
  await recordMutation(client,actor,'sku',skuId,'stock.adjusted',{quantity,movementId:movement.id});
  return movement;
}
export async function reserveStock(client: PoolClient, orderItemId: string, expiresAt: Date | null = null) {
  const item = (await client.query('SELECT sku_id,quantity FROM ordering.order_items WHERE id=$1',[orderItemId])).rows[0];
  const [stock] = await lockAvailability(client,[item.sku_id]);
  if (!stock || Number(stock.available)<item.quantity) throw new ConflictException({code:'OUT_OF_STOCK',message:'Stock insuficiente'});
  await client.query(`INSERT INTO inventory.reservations(order_item_id,status,expires_at) VALUES($1,'active',$2)`,[orderItemId,expiresAt]);
}
export async function releaseOrderStock(client: PoolClient, orderId: string) {
  const items = (await client.query('SELECT sku_id FROM ordering.order_items WHERE merchant_order_id=$1 ORDER BY sku_id',[orderId])).rows;
  await lockAvailability(client,items.map((item)=>item.sku_id));
  await client.query(`UPDATE inventory.reservations r SET status='released',closed_at=now() FROM ordering.order_items i
    WHERE r.order_item_id=i.id AND i.merchant_order_id=$1 AND r.status='active'`,[orderId]);
}
export async function consumeOrderStock(client: PoolClient, orderId: string, actorUserId: string) {
  const items = (await client.query(`SELECT id AS item_id,sku_id,quantity FROM ordering.order_items
    WHERE merchant_order_id=$1 ORDER BY sku_id,id`,[orderId])).rows;
  await lockAvailability(client,items.map((item)=>item.sku_id));
  for (const item of items) {
    const consumed = await client.query(`UPDATE inventory.reservations SET status='consumed',closed_at=now()
      WHERE order_item_id=$1 AND status='active'`,[item.item_id]);
    if (consumed.rowCount!==1) throw new ConflictException('El pedido no tiene todas sus reservas activas');
    const changed = await client.query(`UPDATE inventory.stock SET on_hand=on_hand-$1,updated_at=now()
      WHERE sku_id=$2 RETURNING on_hand`,[item.quantity,item.sku_id]);
    await client.query(`INSERT INTO inventory.movements(sku_id,actor_user_id,kind,quantity,on_hand_after,reason,order_item_id)
      VALUES($1,$2,'consumption',$3,$4,'Retiro de pedido',$5)`,[item.sku_id,actorUserId,-item.quantity,changed.rows[0].on_hand,item.item_id]);
  }
}
