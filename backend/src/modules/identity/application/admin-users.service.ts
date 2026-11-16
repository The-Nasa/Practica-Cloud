import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';
import { assertAdmin } from '../../../platform/security/admin-access';
import { pageOf } from '../../../platform/http/list-query.dto';
import { MutationActor, recordMutation } from '../../platform/public';
import { AdminUserQueryDto, UserStatusDto } from '../infrastructure/dto/admin-users.dto';

@Injectable()
export class AdminUsersService {
  constructor(private readonly db: DatabaseService) {}
  async list(query: AdminUserQueryDto) {
    const rows = await this.db.query(`SELECT u.id,u.full_name AS "fullName",u.email,u.phone,u.status,u.created_at AS "createdAt",
      ARRAY(SELECT r.role_code FROM identity.user_roles r WHERE r.user_id=u.id ORDER BY r.role_code) AS roles,
      (SELECT a.details->>'reason' FROM platform.audit_entries a WHERE a.entity_id=u.id AND a.action='identity.user_status_changed' ORDER BY a.id DESC LIMIT 1) AS "statusReason"
      FROM identity.users u WHERE ($1::uuid IS NULL OR u.id>$1) AND ($2::text IS NULL OR u.status=$2) ORDER BY u.id LIMIT $3`,
      [query.cursor || null, query.status || null, query.limit + 1]);
    return pageOf(rows.rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })), query.limit);
  }
  async overview() {
    return (await this.db.query(`SELECT
      (SELECT count(*)::int FROM merchant.stores WHERE status='pending') AS "pendingStores",
      (SELECT count(*)::int FROM delivery.courier_profiles WHERE status='pending') AS "pendingCouriers",
      (SELECT count(*)::int FROM merchant.stores WHERE status='active') AS "activeStores",
      (SELECT count(*)::int FROM delivery.courier_profiles WHERE status='active') AS "activeCouriers",
      (SELECT count(*)::int FROM identity.users WHERE status='active') AS "activeUsers",
      (SELECT count(*)::int FROM identity.users WHERE status='suspended') AS "suspendedUsers"`)).rows[0];
  }
  async changeStatus(actor: MutationActor, id: string, dto: UserStatusDto) {
    if (id.toLowerCase() === actor.userId.toLowerCase()) throw new ForbiddenException('No puede cambiar su propio estado administrativo');
    return this.db.withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('quickly.identity.administration'))");
      await assertAdmin(client, actor.userId);
      const target = (await client.query('SELECT id,status FROM identity.users WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!target) throw new NotFoundException('Usuario no encontrado');
      if (target.status === dto.status) throw new ConflictException('La cuenta ya tiene ese estado');
      if (dto.status === 'suspended') {
        const adminRole = await client.query("SELECT 1 FROM identity.user_roles WHERE user_id=$1 AND role_code='admin'", [id]);
        if (adminRole.rowCount) {
          const count = (await client.query("SELECT count(*)::int AS n FROM identity.users u JOIN identity.user_roles r ON r.user_id=u.id WHERE r.role_code='admin' AND u.status='active'")).rows[0].n;
          if (count <= 1) throw new ConflictException('Debe conservar al menos un administrador activo');
        }
        await client.query('SELECT user_id FROM delivery.courier_profiles WHERE user_id=$1 FOR UPDATE', [id]);
        await client.query(`SELECT s.id FROM merchant.stores s JOIN merchant.memberships m ON m.store_id=s.id
          WHERE m.user_id=$1 AND m.is_active AND m.membership_role='owner' ORDER BY s.id FOR UPDATE OF s`, [id]);
        const busy = await client.query(`SELECT 1 WHERE EXISTS(SELECT 1 FROM delivery.assignments WHERE courier_user_id=$1 AND status IN ('accepted','picked_up'))
          OR EXISTS(SELECT 1 FROM ordering.merchant_orders o JOIN merchant.memberships m ON m.store_id=o.store_id
            WHERE m.user_id=$1 AND m.is_active AND m.membership_role='owner' AND o.status_code NOT IN ('delivered','cancelled','rejected'))`, [id]);
        if (busy.rowCount) throw new ConflictException('Resuelva los pedidos o entregas activos antes de suspender la cuenta');
        await client.query('UPDATE delivery.courier_profiles SET is_online=false,updated_at=now() WHERE user_id=$1', [id]);
        await client.query(`UPDATE merchant.stores SET accepting_orders=false,updated_at=now() WHERE id IN
          (SELECT store_id FROM merchant.memberships WHERE user_id=$1 AND is_active AND membership_role='owner')`, [id]);
        await client.query('UPDATE identity.sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
      }
      await client.query('UPDATE identity.users SET status=$2,updated_at=now() WHERE id=$1', [id, dto.status]);
      await recordMutation(client, actor, 'user', id, 'identity.user_status_changed', { reason: dto.reason, fromStatus: target.status, toStatus: dto.status });
    });
  }
}
