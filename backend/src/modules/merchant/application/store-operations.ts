import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';

/** Membership reads also cover pending/suspended stores without granting operation. */
export async function assertStoreMember(client: PoolClient, storeId: string, userId: string): Promise<void> {
  const access = await client.query(`SELECT 1 FROM identity.users u WHERE u.id=$2 AND u.status='active'
    AND (EXISTS(SELECT 1 FROM identity.user_roles r WHERE r.user_id=u.id AND r.role_code='admin')
      OR EXISTS(SELECT 1 FROM merchant.memberships m WHERE m.store_id=$1 AND m.user_id=u.id AND m.is_active))`,[storeId,userId]);
  if (!access.rowCount) throw new ForbiddenException('No tiene acceso a esta tienda');
}

/** Caller must lock the store before authorizing a management mutation. */
export async function assertStoreManager(client: PoolClient, storeId: string, userId: string, ownerOnly = false): Promise<void> {
  const admin = await client.query(`SELECT 1 FROM identity.users u JOIN identity.user_roles r ON r.user_id=u.id
    WHERE u.id=$1 AND u.status='active' AND r.role_code='admin'`, [userId]);
  if (admin.rowCount) return;
  const membership = await client.query(`SELECT m.membership_role FROM merchant.memberships m
    JOIN identity.users u ON u.id=m.user_id WHERE m.store_id=$1 AND m.user_id=$2 AND m.is_active AND u.status='active' FOR SHARE OF m`, [storeId, userId]);
  const allowed = ownerOnly ? ['owner'] : ['owner', 'manager'];
  if (!membership.rowCount || !allowed.includes(membership.rows[0].membership_role)) throw new ForbiddenException('No tiene permisos de gestión para esta tienda');
}

export async function assertStoreOrderable(client: PoolClient, storeId: string): Promise<void> {
  const result = await client.query(`SELECT s.status,s.accepting_orders,z.is_active,
    EXISTS(SELECT 1 FROM merchant.opening_intervals h WHERE h.store_id=s.id
      AND h.weekday=extract(isodow FROM now() AT TIME ZONE 'America/Lima')
      AND (now() AT TIME ZONE 'America/Lima')::time >= h.opens_at
      AND (now() AT TIME ZONE 'America/Lima')::time < h.closes_at) AS in_schedule
    FROM merchant.stores s JOIN geography.coverage_zones z ON z.id=s.zone_id WHERE s.id=$1`, [storeId]);
  if (!result.rowCount) throw new NotFoundException('Tienda no encontrada');
  const store = result.rows[0];
  if (store.status !== 'active' || !store.accepting_orders || !store.is_active || !store.in_schedule) {
    throw new ConflictException({ code: 'STORE_CLOSED', message: 'La tienda está cerrada, pausada o fuera de su horario de atención' });
  }
}

export async function syncMerchantRoles(client: PoolClient, userIds: string[]): Promise<void> {
  for (const id of [...new Set(userIds)].sort()) {
    const active = await client.query(`SELECT 1 FROM merchant.memberships m JOIN merchant.stores s ON s.id=m.store_id
      WHERE m.user_id=$1 AND m.is_active AND s.status='active' LIMIT 1`, [id]);
    if (active.rowCount) await client.query("INSERT INTO identity.user_roles(user_id,role_code) VALUES($1,'merchant') ON CONFLICT DO NOTHING", [id]);
    else await client.query("DELETE FROM identity.user_roles WHERE user_id=$1 AND role_code='merchant'", [id]);
  }
}
