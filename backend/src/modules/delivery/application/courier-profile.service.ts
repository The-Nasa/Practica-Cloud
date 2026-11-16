import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';
import { assertAdmin } from '../../../platform/security/admin-access';
import { pageOf } from '../../../platform/http/list-query.dto';
import { recordMutation, MutationActor } from '../../platform/public';
import { OperationalDecisionDto, OperationalListQueryDto } from '../../../platform/http/operational.dto';
import { ApplyCourierDto } from '../infrastructure/dto/courier-profile.dto';

interface Connection { query(sql: string, params?: any[]): Promise<{ rows: any[]; rowCount: number | null }> }
const selection = `c.user_id AS id,c.user_id AS "userId",u.full_name AS "fullName",u.email,u.phone,c.vehicle_type AS "vehicleType",
  c.plate,c.current_zone_id AS "zoneId",z.name AS "zoneName",c.status,c.status_reason AS "statusReason",c.is_online AS "isOnline",c.created_at AS "createdAt"`;
const from = 'FROM delivery.courier_profiles c JOIN identity.users u ON u.id=c.user_id LEFT JOIN geography.coverage_zones z ON z.id=c.current_zone_id';
const mapped = (row: any) => ({ ...row, createdAt: row.createdAt.toISOString() });

@Injectable()
export class CourierProfileService {
  constructor(private readonly db: DatabaseService) {}
  async own(userId: string, db: Connection = this.db) {
    const result = await db.query(`SELECT ${selection} ${from} WHERE c.user_id=$1`, [userId]);
    if (!result.rowCount) throw new NotFoundException('Todavía no tiene solicitud de reparto');
    return mapped(result.rows[0]);
  }
  async list(query: OperationalListQueryDto) {
    const result = await this.db.query(`SELECT ${selection} ${from} WHERE ($1::uuid IS NULL OR c.user_id>$1)
      AND ($2::text IS NULL OR c.status=$2) ORDER BY c.user_id LIMIT $3`, [query.cursor || null, query.status || null, query.limit + 1]);
    return pageOf(result.rows.map(mapped), query.limit);
  }
  async apply(actor: MutationActor, dto: ApplyCourierDto) {
    if (dto.vehicleType !== 'bicycle' && !dto.plate) throw new BadRequestException('La placa es obligatoria para vehículos motorizados');
    return this.db.withTransaction(async (client) => {
      // User lock serializes first submissions as well as edits of an existing profile.
      const user = await client.query("SELECT id FROM identity.users WHERE id=$1 AND status='active' FOR UPDATE", [actor.userId]);
      if (!user.rowCount) throw new NotFoundException('Cuenta no activa');
      const zone = await client.query('SELECT id FROM geography.coverage_zones WHERE id=$1 AND is_active FOR SHARE', [dto.zoneId]);
      if (!zone.rowCount) throw new BadRequestException('Seleccione una zona activa');
      const old = (await client.query('SELECT * FROM delivery.courier_profiles WHERE user_id=$1 FOR UPDATE', [actor.userId])).rows[0];
      if (old?.status === 'suspended') throw new ConflictException('Su perfil está suspendido; solicite revisión administrativa');
      const changed = !old || old.vehicle_type !== dto.vehicleType || (old.plate || null) !== (dto.plate || null);
      if (old && (changed || old.current_zone_id !== dto.zoneId)) await this.assertNotBusy(client, actor.userId);
      const nextStatus = old?.status === 'active' && !changed ? 'active' : 'pending';
      await client.query(`INSERT INTO delivery.courier_profiles(user_id,vehicle_type,plate,current_zone_id)
        VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET vehicle_type=excluded.vehicle_type,plate=excluded.plate,
        current_zone_id=excluded.current_zone_id,status=$5,is_online=false,status_reason=NULL,updated_at=now()`,
        [actor.userId, dto.vehicleType, dto.plate || null, dto.zoneId, nextStatus]);
      if (nextStatus !== 'active') await client.query("DELETE FROM identity.user_roles WHERE user_id=$1 AND role_code='courier'", [actor.userId]);
      await recordMutation(client, actor, 'courier', actor.userId, old ? 'delivery.profile_updated' : 'delivery.courier_requested', { status: nextStatus });
      return this.own(actor.userId, client);
    });
  }
  async availability(actor: MutationActor, online: boolean) {
    return this.db.withTransaction(async (client) => {
      const profile = (await client.query('SELECT * FROM delivery.courier_profiles WHERE user_id=$1 FOR UPDATE', [actor.userId])).rows[0];
      if (!profile) throw new NotFoundException('Perfil no encontrado');
      if (profile.status !== 'active') throw new ConflictException('El perfil debe estar aprobado para cambiar disponibilidad');
      if (online && !(await client.query('SELECT id FROM geography.coverage_zones WHERE id=$1 AND is_active FOR SHARE', [profile.current_zone_id])).rowCount) {
        throw new ConflictException('Su zona no está activa');
      }
      await client.query('UPDATE delivery.courier_profiles SET is_online=$2,updated_at=now() WHERE user_id=$1', [actor.userId, online]);
      await recordMutation(client, actor, 'courier', actor.userId, 'delivery.availability_changed', { isOnline: online });
      return this.own(actor.userId, client);
    });
  }
  async decide(actor: MutationActor, id: string, dto: OperationalDecisionDto) {
    return this.db.withTransaction(async (client) => {
      await assertAdmin(client, actor.userId);
      const profile = (await client.query('SELECT * FROM delivery.courier_profiles WHERE user_id=$1 FOR UPDATE', [id])).rows[0];
      if (!profile) throw new NotFoundException('Perfil no encontrado');
      const fromStatus = { approve: 'pending', reject: 'pending', suspend: 'active', reactivate: 'suspended' };
      const toStatus = { approve: 'active', reject: 'rejected', suspend: 'suspended', reactivate: 'active' };
      if (profile.status !== fromStatus[dto.decision]) throw new ConflictException('La decisión no corresponde al estado actual del repartidor');
      if (dto.decision === 'suspend') await this.assertNotBusy(client, id);
      if (toStatus[dto.decision] === 'active') {
        const valid = await client.query(`SELECT 1 FROM identity.users u JOIN geography.coverage_zones z ON z.id=$2 WHERE u.id=$1 AND u.status='active' AND z.is_active`, [id, profile.current_zone_id]);
        if (!valid.rowCount) throw new ConflictException('La cuenta y la zona deben estar activas');
        await client.query("INSERT INTO identity.user_roles(user_id,role_code) VALUES($1,'courier') ON CONFLICT DO NOTHING", [id]);
      } else await client.query("DELETE FROM identity.user_roles WHERE user_id=$1 AND role_code='courier'", [id]);
      await client.query('UPDATE delivery.courier_profiles SET status=$2,status_reason=$3,is_online=false,updated_at=now() WHERE user_id=$1', [id, toStatus[dto.decision], dto.reason]);
      await recordMutation(client, actor, 'courier', id, `delivery.courier_${dto.decision}`, { reason: dto.reason, fromStatus: profile.status, toStatus: toStatus[dto.decision] });
      return this.own(id, client);
    });
  }
  private async assertNotBusy(client: Connection, userId: string) {
    if ((await client.query("SELECT 1 FROM delivery.assignments WHERE courier_user_id=$1 AND status IN ('accepted','picked_up') LIMIT 1", [userId])).rowCount) {
      throw new ConflictException('Resuelva la entrega activa antes de cambiar o suspender el perfil');
    }
  }
}
