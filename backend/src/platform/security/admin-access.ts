import { ForbiddenException } from '@nestjs/common';
import { PoolClient } from 'pg';

export async function assertAdmin(client: PoolClient, userId: string): Promise<void> {
  const result = await client.query(`SELECT u.id FROM identity.users u
    WHERE u.id=$1 AND u.status='active'
      AND EXISTS(SELECT 1 FROM identity.user_roles r WHERE r.user_id=u.id AND r.role_code='admin') FOR SHARE`, [userId]);
  if (!result.rowCount) throw new ForbiddenException('Se requiere una cuenta administradora activa');
}
