import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { readSessionToken, isCsrfValid } from '../security/web-session';

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  roles: string[];
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawToken = readSessionToken(request);
    if (!rawToken) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Inicie sesión para continuar',
      });
    }

    // CSRF check is required for cookie-based authentication on mutating requests.
    // Bearer token authentication is explicitly set by client JavaScript and is not subject to CSRF attacks.
    const isBearer = typeof request.headers['authorization'] === 'string' &&
      request.headers['authorization'].toLowerCase().startsWith('bearer ');

    if (!isBearer && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !isCsrfValid(rawToken, request.headers['x-csrf-token'])) {
      throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'No se pudo verificar la solicitud. Actualice la sesión.' });
    }
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    // Query active unexpired unrevoked session and fetch user + roles
    const sessionRes = await this.db.query(
      `SELECT s.id as session_id, s.expires_at, u.id, u.full_name, u.email, u.phone, u.status,
              COALESCE(array_agg(ur.role_code) FILTER (WHERE ur.role_code IS NOT NULL), '{}') as roles
       FROM identity.sessions s
       JOIN identity.users u ON s.user_id = u.id
       LEFT JOIN identity.user_roles ur ON u.id = ur.user_id
       WHERE s.token_hash = $1
         AND s.expires_at > now()
         AND s.revoked_at IS NULL
         AND u.status = 'active'
       GROUP BY s.id, u.id`,
      [tokenHash],
    );

    if (sessionRes.rows.length === 0) {
      throw new UnauthorizedException({
        code: 'INVALID_SESSION',
        message: 'Sesión inexistente, revocada o vencida',
      });
    }

    const row = sessionRes.rows[0];
    request.sessionId = row.session_id;
    request.sessionExpiresAt = row.expires_at;
    request.user = {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      roles: row.roles,
    } as AuthenticatedUser;

    return true;
  }
}
