import { ForbiddenException } from '@nestjs/common';

/** Public membership policy; callers may provide their current transaction. */
export async function assertStoreAccess(
  db: { query(sql: string, params: unknown[]): Promise<{ rowCount: number | null }> },
  storeId: string,
  actorUserId: string,
  allowedRoles: string[] = ['owner', 'manager', 'operator'],
): Promise<void> {
  const result = await db.query(
    `SELECT 1 FROM identity.users u
     WHERE u.id = $2 AND u.status = 'active' AND (
       EXISTS (SELECT 1 FROM identity.user_roles r WHERE r.user_id = u.id AND r.role_code = 'admin')
       OR (EXISTS (SELECT 1 FROM identity.user_roles r WHERE r.user_id = u.id AND r.role_code = 'merchant')
           AND EXISTS (SELECT 1 FROM merchant.memberships m
                       JOIN merchant.stores s ON s.id = m.store_id
                       WHERE m.store_id = $1 AND m.user_id = u.id AND m.is_active
                         AND m.membership_role = ANY($3::text[]) AND s.status = 'active'))
     )`,
    [storeId, actorUserId, allowedRoles],
  );
  if (!result.rowCount) {
    throw new ForbiddenException({ code: 'STORE_ACCESS_DENIED', message: 'No tiene acceso operativo a este comercio' });
  }
}
