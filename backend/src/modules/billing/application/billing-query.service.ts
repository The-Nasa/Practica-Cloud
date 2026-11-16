import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';
import { ListQueryDto, pageOf } from '../../../platform/http/list-query.dto';
import { PaymentHistoryDto, PaymentMethodDto } from '../infrastructure/billing.dto';

@Injectable()
export class BillingQueryService {
  constructor(private readonly db: DatabaseService) {}

  async methods(): Promise<PaymentMethodDto[]> {
    const result = await this.db.query('SELECT code,label FROM billing.payment_methods ORDER BY code');
    // Catalog presence does not mean a provider is integrated or enabled.
    return result.rows.map(row => ({
      ...row, available: row.code === 'cash',
      unavailableReason: row.code === 'cash' ? null : 'El pago digital aún no está habilitado',
    }));
  }

  async ownPayments(userId: string, purchaseId: string, query: ListQueryDto): Promise<PaymentHistoryDto> {
    const purchase = await this.db.query('SELECT 1 FROM ordering.purchases WHERE id=$1 AND customer_id=$2', [purchaseId, userId]);
    if (!purchase.rowCount) throw new NotFoundException('Compra no encontrada');
    const result = await this.db.query(`SELECT p.id,p.method_code AS "methodCode",p.status,p.amount_cents AS "amountCents",
      p.created_at AS "createdAt",p.succeeded_at AS "succeededAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'orderId',r.merchant_order_id,
        'amountCents',r.amount_cents,'status',r.status,'createdAt',r.created_at,'succeededAt',r.succeeded_at)
        ORDER BY r.created_at,r.id) FROM billing.refunds r WHERE r.payment_attempt_id=p.id),'[]'::jsonb) AS refunds
      FROM billing.payment_attempts p WHERE p.purchase_id=$1 AND ($2::uuid IS NULL OR p.id>$2)
      ORDER BY p.id LIMIT $3`, [purchaseId, query.cursor || null, query.limit + 1]);
    return pageOf(result.rows.map(row => ({ ...row, amountCents: Number(row.amountCents),
      createdAt: row.createdAt.toISOString(), succeededAt: row.succeededAt?.toISOString() ?? null,
    })), query.limit);
  }
}
