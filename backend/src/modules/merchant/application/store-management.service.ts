import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';
import { assertAdmin } from '../../../platform/security/admin-access';
import { pageOf, ListQueryDto } from '../../../platform/http/list-query.dto';
import { recordMutation, MutationActor } from '../../platform/public';
import { CreateStoreDto, UpdateStoreDto, StoreDto, StoreDetailDto, OperationalDecisionDto, OperationalListQueryDto, ReplaceHoursDto, SetStoreMemberDto } from '../infrastructure/dto/merchant.dto';
import { validateOpeningIntervals, InvalidOpeningIntervalsError } from '../domain/opening-hours';
import { assertStoreManager, syncMerchantRoles } from './store-operations';

interface Connection { query(sql: string, params?: any[]): Promise<{ rows: any[]; rowCount: number | null }> }
const selection = `s.id,s.name,s.description,s.category_code AS "categoryCode",s.zone_id AS "zoneId",z.name AS "zoneName",
  s.address_text AS "addressText",s.phone,s.legal_business_name AS "legalBusinessName",s.tax_id AS "taxId",s.status,
  s.status_reason AS "statusReason",s.accepting_orders AS "acceptingOrders",s.minimum_order_cents AS "minimumOrderCents",
  s.preparation_minutes AS "preparationMinutes",s.created_at AS "createdAt",
  CASE WHEN EXISTS(SELECT 1 FROM identity.user_roles r WHERE r.user_id=$1 AND r.role_code='admin') THEN 'admin'
    ELSE (SELECT m.membership_role FROM merchant.memberships m WHERE m.store_id=s.id AND m.user_id=$1 AND m.is_active) END AS "membershipRole",
  (s.status='active' AND s.accepting_orders AND z.is_active AND EXISTS(SELECT 1 FROM merchant.opening_intervals h
    WHERE h.store_id=s.id AND h.weekday=extract(isodow FROM now() AT TIME ZONE 'America/Lima')
    AND (now() AT TIME ZONE 'America/Lima')::time >= h.opens_at AND (now() AT TIME ZONE 'America/Lima')::time < h.closes_at)) AS "isOpen"`;
const visibility = `(EXISTS(SELECT 1 FROM merchant.memberships m WHERE m.store_id=s.id AND m.user_id=$1 AND m.is_active)
  OR EXISTS(SELECT 1 FROM identity.user_roles r WHERE r.user_id=$1 AND r.role_code='admin'))`;
function storeRow(row: any): StoreDto { return { ...row, minimumOrderCents: Number(row.minimumOrderCents), createdAt: row.createdAt.toISOString() }; }

@Injectable()
export class StoreManagementService {
  constructor(private readonly db: DatabaseService) {}

  async categories() { return (await this.db.query('SELECT code,label FROM merchant.categories ORDER BY label')).rows; }

  async listOwn(userId: string, query: ListQueryDto) {
    const rows = await this.db.query(`SELECT ${selection} FROM merchant.stores s JOIN geography.coverage_zones z ON z.id=s.zone_id
      WHERE EXISTS(SELECT 1 FROM merchant.memberships m WHERE m.store_id=s.id AND m.user_id=$1 AND m.is_active)
      AND ($2::uuid IS NULL OR s.id>$2) ORDER BY s.id LIMIT $3`, [userId, query.cursor || null, query.limit + 1]);
    return pageOf(rows.rows.map(storeRow), query.limit);
  }

  async listAdmin(userId: string, query: OperationalListQueryDto) {
    const rows = await this.db.query(`SELECT ${selection} FROM merchant.stores s JOIN geography.coverage_zones z ON z.id=s.zone_id
      WHERE ($2::uuid IS NULL OR s.id>$2) AND ($4::text IS NULL OR s.status=$4) ORDER BY s.id LIMIT $3`,
      [userId, query.cursor || null, query.limit + 1, query.status || null]);
    return pageOf(rows.rows.map(storeRow), query.limit);
  }

  async detail(userId: string, id: string, db: Connection = this.db): Promise<StoreDetailDto> {
    const result = await db.query(`SELECT ${selection} FROM merchant.stores s JOIN geography.coverage_zones z ON z.id=s.zone_id
      WHERE s.id=$2 AND ${visibility}`, [userId, id]);
    if (!result.rowCount) throw new NotFoundException('Tienda no encontrada o sin acceso');
    const hours = await db.query(`SELECT weekday,to_char(opens_at,'HH24:MI') AS "opensAt",
      CASE WHEN closes_at='24:00'::time THEN '24:00' ELSE to_char(closes_at,'HH24:MI') END AS "closesAt"
      FROM merchant.opening_intervals WHERE store_id=$1 ORDER BY weekday,opens_at`, [id]);
    return { ...storeRow(result.rows[0]), openingIntervals: hours.rows };
  }

  async create(actor: MutationActor, dto: CreateStoreDto) {
    return this.db.withTransaction(async (client) => {
      await this.validateLocation(client, dto.zoneId, dto.categoryCode);
      const result = await client.query(`INSERT INTO merchant.stores(category_code,zone_id,name,address_text,phone,description,
        legal_business_name,tax_id,minimum_order_cents,preparation_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [dto.categoryCode, dto.zoneId, dto.name, dto.addressText, dto.phone, dto.description || '', dto.legalBusinessName || null,
          dto.taxId || null, dto.minimumOrderCents ?? 0, dto.preparationMinutes ?? 30]);
      const id = result.rows[0].id;
      await client.query("INSERT INTO merchant.memberships(store_id,user_id,membership_role) VALUES($1,$2,'owner')", [id, actor.userId]);
      await recordMutation(client, actor, 'store', id, 'merchant.store_requested');
      return this.detail(actor.userId, id, client);
    });
  }

  async update(actor: MutationActor, id: string, dto: UpdateStoreDto) {
    return this.db.withTransaction(async (client) => {
      const old = (await client.query('SELECT * FROM merchant.stores WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!old) throw new NotFoundException('Tienda no encontrada');
      await assertStoreManager(client, id, actor.userId);
      if (old.status === 'suspended') throw new ConflictException('La tienda está suspendida; solicite revisión administrativa');
      const map: Record<string, string> = { name: 'name', zoneId: 'zone_id', categoryCode: 'category_code', addressText: 'address_text',
        legalBusinessName: 'legal_business_name', taxId: 'tax_id', phone: 'phone', description: 'description',
        minimumOrderCents: 'minimum_order_cents', preparationMinutes: 'preparation_minutes', acceptingOrders: 'accepting_orders' };
      const changed = Object.keys(map).filter((key) => (dto as any)[key] !== undefined && (dto as any)[key] !== old[map[key]]);
      const identityChanged = changed.some((key) => ['name','zoneId','categoryCode','addressText','legalBusinessName','taxId'].includes(key));
      if (identityChanged) await assertStoreManager(client, id, actor.userId, true);
      await this.validateLocation(client, dto.zoneId || old.zone_id, dto.categoryCode || old.category_code);
      const nextStatus = identityChanged && old.status === 'active' || old.status === 'rejected' ? 'pending' : old.status;
      if (dto.acceptingOrders === true && nextStatus !== 'active') throw new ConflictException('Solo una tienda aprobada puede recibir pedidos');
      const keys = changed.filter((key) => key !== 'acceptingOrders');
      const params: unknown[] = [id];
      const assignments = keys.map((key) => { params.push((dto as any)[key]); return `${map[key]}=$${params.length}`; });
      params.push(nextStatus); assignments.push(`status=$${params.length}`);
      params.push(nextStatus === 'active' ? (dto.acceptingOrders ?? old.accepting_orders) : false); assignments.push(`accepting_orders=$${params.length}`);
      if (nextStatus !== old.status) assignments.push("status_reason='Datos de afiliación actualizados; pendiente de revisión'");
      assignments.push('updated_at=now()');
      await client.query(`UPDATE merchant.stores SET ${assignments.join(',')} WHERE id=$1`, params);
      if (nextStatus !== old.status) await this.syncRoles(client, id);
      await recordMutation(client, actor, 'store', id, 'merchant.store_updated', { fields: changed, status: nextStatus });
      return this.detail(actor.userId, id, client);
    });
  }

  async replaceHours(actor: MutationActor, id: string, dto: ReplaceHoursDto) {
    try { validateOpeningIntervals(dto.intervals); } catch (error) {
      if (error instanceof InvalidOpeningIntervalsError) throw new BadRequestException({ code: 'INVALID_OPENING_INTERVALS', message: error.message });
      throw error;
    }
    return this.db.withTransaction(async (client) => {
      const store = (await client.query('SELECT status FROM merchant.stores WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!store) throw new NotFoundException('Tienda no encontrada');
      await assertStoreManager(client, id, actor.userId);
      if (store.status === 'suspended') throw new ConflictException('Tienda suspendida');
      await client.query('DELETE FROM merchant.opening_intervals WHERE store_id=$1', [id]);
      for (const interval of dto.intervals) await client.query(`INSERT INTO merchant.opening_intervals(store_id,weekday,opens_at,closes_at)
        VALUES($1,$2,$3,$4)`, [id, interval.weekday, interval.opensAt, interval.closesAt]);
      await recordMutation(client, actor, 'store', id, 'merchant.hours_updated', { intervals: dto.intervals.length });
      return this.detail(actor.userId, id, client);
    });
  }

  async decide(actor: MutationActor, id: string, dto: OperationalDecisionDto) {
    return this.db.withTransaction(async (client) => {
      await assertAdmin(client, actor.userId);
      const store = (await client.query('SELECT * FROM merchant.stores WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!store) throw new NotFoundException('Tienda no encontrada');
      const from = { approve: 'pending', reject: 'pending', suspend: 'active', reactivate: 'suspended' };
      const to = { approve: 'active', reject: 'rejected', suspend: 'suspended', reactivate: 'active' };
      if (store.status !== from[dto.decision]) throw new ConflictException('La decisión no corresponde al estado actual de la tienda');
      if (to[dto.decision] === 'active') {
        const owner = await client.query(`SELECT 1 FROM merchant.memberships m JOIN identity.users u ON u.id=m.user_id
          WHERE m.store_id=$1 AND m.is_active AND m.membership_role='owner' AND u.status='active'`, [id]);
        if (!owner.rowCount) throw new ConflictException('La tienda necesita un propietario con cuenta activa');
      }
      if (dto.decision === 'suspend') {
        const busy = await client.query("SELECT 1 FROM ordering.merchant_orders WHERE store_id=$1 AND status_code NOT IN ('delivered','cancelled','rejected') LIMIT 1", [id]);
        if (busy.rowCount) throw new ConflictException('Resuelva los pedidos activos antes de suspender la tienda');
      }
      if (to[dto.decision] === 'active') await this.validateLocation(client, store.zone_id, store.category_code);
      await client.query(`UPDATE merchant.stores SET status=$2,status_reason=$3,accepting_orders=$4,updated_at=now() WHERE id=$1`,
        [id, to[dto.decision], dto.reason, dto.decision === 'approve']);
      await this.syncRoles(client, id);
      await recordMutation(client, actor, 'store', id, `merchant.store_${dto.decision}`, { reason: dto.reason, fromStatus: store.status, toStatus: to[dto.decision] });
      return this.detail(actor.userId, id, client);
    });
  }

  async members(actor: MutationActor, id: string) {
    return this.db.withTransaction(async (client) => {
      await client.query('SELECT id FROM merchant.stores WHERE id=$1 FOR SHARE', [id]);
      await assertStoreManager(client, id, actor.userId, true);
      return (await client.query(`SELECT m.user_id AS "userId",u.full_name AS "fullName",u.email,m.membership_role AS "membershipRole",m.is_active AS "isActive"
        FROM merchant.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.store_id=$1 ORDER BY u.full_name,m.user_id`, [id])).rows;
    });
  }

  async setMember(actor: MutationActor, id: string, dto: SetStoreMemberDto) {
    return this.db.withTransaction(async (client) => {
      const store = (await client.query('SELECT status FROM merchant.stores WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!store) throw new NotFoundException('Tienda no encontrada');
      await assertStoreManager(client, id, actor.userId, true);
      if (store.status !== 'active') throw new ConflictException('La tienda debe estar aprobada para gestionar operadores');
      const user = (await client.query("SELECT id FROM identity.users WHERE email=$1 AND status='active' FOR SHARE", [dto.email])).rows[0];
      if (!user) throw new NotFoundException('La persona debe tener una cuenta activa registrada');
      const existing = (await client.query('SELECT membership_role FROM merchant.memberships WHERE store_id=$1 AND user_id=$2', [id, user.id])).rows[0];
      if (user.id === actor.userId || existing?.membership_role === 'owner') throw new ForbiddenException('No puede modificar su membresía ni la del propietario');
      await client.query(`INSERT INTO merchant.memberships(store_id,user_id,membership_role) VALUES($1,$2,$3)
        ON CONFLICT(store_id,user_id) DO UPDATE SET membership_role=excluded.membership_role,is_active=true,revoked_at=NULL`, [id, user.id, dto.membershipRole]);
      await syncMerchantRoles(client, [user.id]);
      await recordMutation(client, actor, 'store', id, 'merchant.member_set', { memberUserId: user.id, membershipRole: dto.membershipRole });
    });
  }

  async revokeMember(actor: MutationActor, id: string, userId: string) {
    return this.db.withTransaction(async (client) => {
      await client.query('SELECT id FROM merchant.stores WHERE id=$1 FOR UPDATE', [id]);
      await assertStoreManager(client, id, actor.userId, true);
      const member = (await client.query('SELECT membership_role,is_active FROM merchant.memberships WHERE store_id=$1 AND user_id=$2 FOR UPDATE', [id, userId])).rows[0];
      if (!member) throw new NotFoundException('Miembro no encontrado');
      if (userId === actor.userId || member.membership_role === 'owner') throw new ForbiddenException('No puede revocar al propietario ni su propia membresía');
      if (!member.is_active) return;
      await client.query('UPDATE merchant.memberships SET is_active=false,revoked_at=now() WHERE store_id=$1 AND user_id=$2', [id, userId]);
      await syncMerchantRoles(client, [userId]);
      await recordMutation(client, actor, 'store', id, 'merchant.member_revoked', { memberUserId: userId });
    });
  }

  private async syncRoles(client: any, id: string) {
    const members = await client.query('SELECT user_id FROM merchant.memberships WHERE store_id=$1', [id]);
    await syncMerchantRoles(client, members.rows.map((m: any) => m.user_id));
  }
  private async validateLocation(client: Connection, zoneId: string, category: string) {
    const zone = await client.query('SELECT id FROM geography.coverage_zones WHERE id=$1 AND is_active FOR SHARE', [zoneId]);
    const type = await client.query('SELECT code FROM merchant.categories WHERE code=$1', [category]);
    if (!zone.rowCount || !type.rowCount) throw new BadRequestException('Seleccione una zona activa y una categoría válida');
  }
}
