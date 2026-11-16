import {Injectable,Logger,OnModuleInit,OnModuleDestroy} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {DatabaseService} from '../../../platform/database/database.service';
@Injectable()
export class NotificationWorker implements OnModuleInit,OnModuleDestroy {
 private readonly logger=new Logger(NotificationWorker.name);private timer?:NodeJS.Timeout;private running?:Promise<number>;private stopped=false;
 constructor(private readonly db:DatabaseService,private readonly config:ConfigService){}
 onModuleInit(){const seconds=Number(this.config.get('NOTIFICATION_INTERVAL_SECONDS','30'));if(!Number.isInteger(seconds)||seconds<0||seconds>3600)throw new Error('Invalid NOTIFICATION_INTERVAL_SECONDS');if(this.config.get('NODE_ENV')==='test'||!seconds)return;this.timer=setInterval(()=>{void this.runBatch().catch(()=>this.logger.error('No se pudo procesar outbox; se reintentará.'));},seconds*1000);this.timer.unref();}
 async onModuleDestroy(){this.stopped=true;if(this.timer)clearInterval(this.timer);await this.running?.catch(()=>{});}
 runBatch():Promise<number>{if(this.stopped)return Promise.resolve(0);if(this.running)return this.running;this.running=this.process().finally(()=>{this.running=undefined;});return this.running;}
 private async process(){return this.db.withTransaction(async c=>{
  const events=(await c.query(`SELECT * FROM platform.outbox_events WHERE published_at IS NULL AND available_at<=now() ORDER BY available_at,created_at,id LIMIT 25 FOR UPDATE SKIP LOCKED`)).rows;
  for(const e of events){await c.query('SAVEPOINT notification_event');try{
   let recipients:{id:string;url:string}[]=[];let title='Actualización de tu cuenta';let message='Consulta el estado actualizado en Quickly.';let kind='system';
   if(e.aggregate_type==='order'&&!['order.reviewed'].includes(e.event_type)){
    recipients=(await c.query(`SELECT p.customer_id AS id,'/cliente/pedidos/'||o.id AS url FROM ordering.merchant_orders o JOIN ordering.purchases p ON p.id=o.purchase_id WHERE o.id=$1
     UNION SELECT m.user_id,'/comercio/pedidos/'||o.id FROM ordering.merchant_orders o JOIN merchant.memberships m ON m.store_id=o.store_id AND m.is_active WHERE o.id=$1
     UNION SELECT a.courier_user_id,'/repartidor/pedidos/'||a.merchant_order_id FROM delivery.assignments a WHERE a.merchant_order_id=$1 AND a.status IN ('accepted','picked_up','delivered')`,[e.aggregate_id])).rows;
    kind='order';title='Actualización de pedido';message='Hay novedades en tu pedido. Revisa su historial.';
   }else if(e.aggregate_type==='ticket'){
    recipients=(await c.query(`SELECT requester_user_id AS id,'/cliente/ayuda/'||id AS url FROM support.tickets WHERE id=$1 UNION SELECT r.user_id,'/admin/incidencias/'||$1::text FROM identity.user_roles r WHERE r.role_code='admin'`,[e.aggregate_id])).rows;
    title='Actualización de soporte';message='Hay una nueva actividad en una solicitud de soporte.';
   }else if(/^merchant\.store_(approve|reject|suspend|reactivate)$/.test(e.event_type)){
    recipients=(await c.query(`SELECT user_id AS id,'/comercio/tienda' AS url FROM merchant.memberships WHERE store_id=$1 AND is_active`,[e.aggregate_id])).rows;
   }else if(e.aggregate_type==='courier'&&/^delivery\.courier_/.test(e.event_type))recipients=[{id:e.aggregate_id,url:'/repartidor/perfil'}];
   for(const r of recipients)await c.query(`INSERT INTO platform.notifications(user_id,kind,title,message,relative_url,source_event_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (source_event_id,user_id) WHERE source_event_id IS NOT NULL DO NOTHING`,[r.id,kind,title,message,r.url,e.id]);
   await c.query('UPDATE platform.outbox_events SET published_at=now(),attempts=attempts+1 WHERE id=$1',[e.id]);await c.query('RELEASE SAVEPOINT notification_event');
  }catch{await c.query('ROLLBACK TO SAVEPOINT notification_event');await c.query(`UPDATE platform.outbox_events SET attempts=attempts+1,available_at=now()+make_interval(secs=>LEAST(3600,5*power(2,LEAST(attempts,10)))::int) WHERE id=$1`,[e.id]);await c.query('RELEASE SAVEPOINT notification_event');}}
  return events.length;
 });}
}
