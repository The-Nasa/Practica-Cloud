import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../platform/database/database.service';
import { releaseOrderStock } from '../../inventory/public';
import { recordMutation } from '../../platform/public';

export function pendingOrderTtl(config: ConfigService): number {
  const minutes = Number(config.get('PENDING_ORDER_TTL_MINUTES','15'));
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) throw new Error('Invalid PENDING_ORDER_TTL_MINUTES');
  return minutes;
}

@Injectable()
export class OrderExpirationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderExpirationService.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<number>;
  private stopping = false;
  constructor(private readonly db: DatabaseService, private readonly config: ConfigService) {}
  onModuleInit() {
    pendingOrderTtl(this.config);
    const seconds = Number(this.config.get('ORDER_EXPIRATION_INTERVAL_SECONDS','30'));
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) throw new Error('Invalid ORDER_EXPIRATION_INTERVAL_SECONDS');
    if (this.config.get('NODE_ENV') === 'test' || !seconds) return;
    this.timer = setInterval(() => { void this.runBatch().catch(() => this.logger.error('No se pudo ejecutar el vencimiento; se reintentará en el siguiente ciclo.')); },seconds*1000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running?.catch(() => {});
  }
  /** Caller already holds the order row lock. Recheck time/state after acquiring it. */
  async expireLocked(client: PoolClient, orderId: string): Promise<boolean> {
    const order = (await client.query(`SELECT id,purchase_id,version FROM ordering.merchant_orders
      WHERE id=$1 AND status_code='pending' AND acceptance_expires_at<=clock_timestamp()`,[orderId])).rows[0];
    if (!order) return false;
    // F3 only operates cash, single-store purchases without delivery assignments.
    // Other payment lifecycles need F6 reconciliation, never an automatic release here.
    const payments = (await client.query(`SELECT id,method_code,status FROM billing.payment_attempts WHERE purchase_id=$1 ORDER BY id FOR UPDATE`,[order.purchase_id])).rows;
    const purchase = (await client.query(`SELECT
      (SELECT count(*)::int FROM ordering.merchant_orders WHERE purchase_id=$1) AS orders,
      EXISTS(SELECT 1 FROM delivery.assignments WHERE merchant_order_id=$2) AS assigned`,[order.purchase_id,orderId])).rows[0];
    if (purchase.orders !== 1 || purchase.assigned || !payments.length || payments.some((p) => p.method_code !== 'cash' || p.status !== 'pending')) return false;
    const changed = (await client.query(`UPDATE ordering.merchant_orders SET status_code='cancelled',updated_at=now()
      WHERE id=$1 RETURNING version`,[orderId])).rows[0];
    await releaseOrderStock(client,orderId);
    await client.query(`UPDATE billing.payment_attempts SET status='cancelled' WHERE purchase_id=$1 AND method_code='cash' AND status='pending'`,[order.purchase_id]);
    await client.query(`INSERT INTO ordering.order_events(merchant_order_id,order_version,status_code,actor_user_id,reason)
      VALUES($1,$2,'cancelled',NULL,'Vencido sin aceptación del comercio')`,[orderId,changed.version]);
    await recordMutation(client,{userId:null,requestId:randomUUID()},'order',orderId,'order.expired',{source:'pending-order-expiration',purchaseId:order.purchase_id});
    return true;
  }
  runBatch(limit = 50): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return Promise.reject(new Error('Invalid expiration batch limit'));
    if (this.stopping) return Promise.resolve(0);
    if (this.running) return this.running;
    this.running = this.processBatch(limit).finally(() => { this.running = undefined; });
    return this.running;
  }
  private async processBatch(limit: number): Promise<number> {
    let expired = 0;
    for (let index=0;index<limit && !this.stopping;index++) {
      const result = await this.db.withTransaction(async (client) => {
        const order = (await client.query(`SELECT o.id FROM ordering.merchant_orders o
          WHERE o.status_code='pending' AND o.acceptance_expires_at<=clock_timestamp()
          AND (SELECT count(*) FROM ordering.merchant_orders other WHERE other.purchase_id=o.purchase_id)=1
          AND NOT EXISTS(SELECT 1 FROM delivery.assignments a WHERE a.merchant_order_id=o.id)
          AND EXISTS(SELECT 1 FROM billing.payment_attempts p WHERE p.purchase_id=o.purchase_id AND p.method_code='cash' AND p.status='pending')
          AND NOT EXISTS(SELECT 1 FROM billing.payment_attempts p WHERE p.purchase_id=o.purchase_id AND (p.method_code<>'cash' OR p.status<>'pending'))
          ORDER BY o.acceptance_expires_at,o.id LIMIT 1 FOR UPDATE OF o SKIP LOCKED`)).rows[0];
        return order ? this.expireLocked(client,order.id) : false;
      });
      if (!result) break;
      expired++;
    }
    return expired;
  }
}
