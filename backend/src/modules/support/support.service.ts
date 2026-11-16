import {ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {DatabaseService} from '../../platform/database/database.service';
import {assertAdmin} from '../../platform/security/admin-access';
import {ListQueryDto,pageOf} from '../../platform/http/list-query.dto';
import {MutationActor,recordMutation} from '../platform/public';
import {TicketInput,TicketDecision} from './support.dto';
const fields=`id,subject,status,priority,version,created_at AS "createdAt",resolved_at AS "resolvedAt",merchant_order_id AS "orderId"`;
@Injectable()
export class SupportService {
 constructor(private readonly db:DatabaseService){}
 async list(actor:string,q:ListQueryDto,admin=false){return this.db.withTransaction(async c=>{
  if(admin)await assertAdmin(c,actor);
  return pageOf((await c.query(`SELECT ${fields} FROM support.tickets WHERE ($1::boolean OR requester_user_id=$2) AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4`,[admin,actor,q.cursor||null,q.limit+1])).rows,q.limit);
 });}
 async detail(actor:string,id:string,admin=false){return this.db.withTransaction(async c=>{
  if(admin)await assertAdmin(c,actor);
  const row=(await c.query(`SELECT ${fields} FROM support.tickets WHERE id=$1 AND ($2::boolean OR requester_user_id=$3)`,[id,admin,actor])).rows[0];
  if(!row)throw new NotFoundException('Ticket no disponible');
  row.messages=(await c.query(`SELECT id,author_user_id AS "authorUserId",body,created_at AS "createdAt" FROM support.ticket_messages WHERE ticket_id=$1 ORDER BY created_at,id`,[id])).rows;
  return row;
 });}
 async create(actor:MutationActor,d:TicketInput){return this.db.withTransaction(async c=>{
  if(d.orderId&&!(await c.query(`SELECT o.id FROM ordering.merchant_orders o JOIN ordering.purchases p ON p.id=o.purchase_id WHERE o.id=$1 AND (p.customer_id=$2 OR EXISTS(SELECT 1 FROM merchant.memberships m WHERE m.store_id=o.store_id AND m.user_id=$2 AND m.is_active) OR EXISTS(SELECT 1 FROM delivery.assignments a WHERE a.merchant_order_id=o.id AND a.courier_user_id=$2 AND a.status IN ('accepted','picked_up','delivered')))`,[d.orderId,actor.userId])).rowCount)throw new NotFoundException('Pedido no disponible');
  const row=(await c.query(`INSERT INTO support.tickets(requester_user_id,merchant_order_id,subject) VALUES($1,$2,$3) RETURNING ${fields}`,[actor.userId,d.orderId||null,d.subject])).rows[0];
  await c.query('INSERT INTO support.ticket_messages(ticket_id,author_user_id,body) VALUES($1,$2,$3)',[row.id,actor.userId,d.body]);
  await recordMutation(c,actor,'ticket',row.id,'support.created');return row;
 });}
 async message(actor:MutationActor,id:string,body:string,decision?:TicketDecision){return this.db.withTransaction(async c=>{
  const admin=!!decision;if(admin)await assertAdmin(c,actor.userId);
  const row=(await c.query('SELECT * FROM support.tickets WHERE id=$1 AND ($2::boolean OR requester_user_id=$3) FOR UPDATE',[id,admin,actor.userId])).rows[0];
  if(!row)throw new NotFoundException('Ticket no disponible');
  if(decision&&row.version!==decision.expectedVersion)throw new ConflictException('El ticket cambió; actualiza antes de responder');
  if(!decision&&row.status==='resolved')throw new ConflictException('El ticket está resuelto; crea una nueva solicitud si necesitas más ayuda');
  await c.query('INSERT INTO support.ticket_messages(ticket_id,author_user_id,body) VALUES($1,$2,$3)',[id,actor.userId,body]);
  if(decision){
   await c.query(`UPDATE support.tickets SET status=$2,priority=$3,resolved_at=CASE WHEN $2='resolved' THEN now() ELSE NULL END,version=version+1 WHERE id=$1`,[id,decision.status,decision.priority]);
   await c.query(`UPDATE delivery.incidents SET resolved_at=CASE WHEN $2='resolved' THEN now() ELSE NULL END WHERE ticket_id=$1`,[id,decision.status]);
  }else await c.query('UPDATE support.tickets SET version=version+1 WHERE id=$1',[id]);
  await recordMutation(c,actor,'ticket',id,decision?'support.decision':'support.message',decision?{status:decision.status,priority:decision.priority}:{});
 });}
}
