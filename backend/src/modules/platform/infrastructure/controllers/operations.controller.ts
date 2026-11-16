import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../../../platform/guards/auth.guard';
import { Roles, RolesGuard } from '../../../../platform/guards/roles.guard';
import { DatabaseService } from '../../../../platform/database/database.service';
import { OperationsDto } from '../operations.dto';

@Controller('api/v1/admin/operations') @UseGuards(AuthGuard, RolesGuard) @Roles('admin')
@ApiTags('Operación') @ApiCookieAuth('cookie')
export class OperationsController {
  constructor(private readonly db: DatabaseService) {}
  @Get() @ApiOkResponse({ type: OperationsDto })
  async status(): Promise<OperationsDto> {
    const metrics = (await this.db.query(`SELECT
      (SELECT count(*)::int FROM platform.outbox_events WHERE published_at IS NULL) AS "pendingEvents",
      (SELECT count(*)::int FROM platform.outbox_events WHERE published_at IS NULL AND attempts>=5) AS "retryingEvents",
      (SELECT extract(epoch FROM now()-min(created_at))::int FROM platform.outbox_events WHERE published_at IS NULL) AS "oldestPendingEventSeconds",
      (SELECT count(*)::int FROM ordering.merchant_orders WHERE status_code='pending' AND acceptance_expires_at<now()) AS "expiredPendingOrders",
      (SELECT count(*)::int FROM delivery.assignments WHERE status IN ('accepted','picked_up')) AS "activeAssignments",
      (SELECT count(*)::int FROM support.tickets WHERE status<>'resolved') AS "openTickets"`)).rows[0];
    const pool = this.db.getPool();
    const alerts: string[] = [];
    if (metrics.oldestPendingEventSeconds > 300) alerts.push('OUTBOX_LAG');
    if (metrics.retryingEvents) alerts.push('OUTBOX_RETRIES');
    if (metrics.expiredPendingOrders) alerts.push('ORDER_EXPIRATION_LAG');
    if (pool.waitingCount) alerts.push('DATABASE_POOL_WAITING');
    return { checkedAt: new Date().toISOString(), ...metrics, poolTotal: pool.totalCount, poolIdle: pool.idleCount, poolWaiting: pool.waitingCount, alerts };
  }
}
