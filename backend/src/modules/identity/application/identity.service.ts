import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { DatabaseService } from '../../../platform/database/database.service';
import { MailService } from '../../../platform/mail/mail.service';
import { PasswordHasher } from '../domain/password.service';
import {
  GoogleAuthDto,
  LoginDto,
  RegisterDto,
  UserProfileDto,
  UpdateProfileDto,
} from '../infrastructure/dto/auth.dto';

interface SessionResult { rawToken: string; expiresAt: string; user: UserProfileDto }
interface Queryable { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> }

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly passwordHasher: PasswordHasher,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async sendVerificationCode(email: string): Promise<{ success: boolean; message: string; devCode?: string }> {
    const emailNorm = email.trim().toLowerCase();

    // 1. Verify if user with this email already exists
    const exists = await this.db.query('SELECT id FROM identity.users WHERE email = $1', [emailNorm]);
    if (exists.rows.length > 0) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Ya existe un usuario registrado con este correo electrónico',
      });
    }

    // 2. Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // 3. Store in identity.email_verification_codes
    await this.db.query(
      `INSERT INTO identity.email_verification_codes (email, code_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [emailNorm, codeHash, expiresAt],
    );

    // 4. Send email
    await this.mailService.sendVerificationCode(emailNorm, code);

    const isDev = this.config.get('NODE_ENV') !== 'production';
    return {
      success: true,
      message: 'Código de verificación enviado correctamente a tu correo',
      ...(isDev ? { devCode: code } : {}),
    };
  }

  async register(dto: RegisterDto, previousToken?: string): Promise<SessionResult> {
    const emailNorm = dto.email.trim().toLowerCase();
    const phoneNorm = dto.phone.trim();

    // Check if email or phone exists
    const checkRes = await this.db.query(
      `SELECT email, phone FROM identity.users WHERE email = $1 OR phone = $2`,
      [emailNorm, phoneNorm],
    );

    if (checkRes.rows.length > 0) {
      const match = checkRes.rows[0];
      if (match.email === emailNorm) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Ya existe un usuario registrado con este correo',
        });
      }
      throw new ConflictException({
        code: 'PHONE_ALREADY_EXISTS',
        message: 'Ya existe un usuario registrado con este número telefónico',
      });
    }

    // Verify verification code if provided
    if (dto.verificationCode) {
      const codeRow = await this.db.query(
        `SELECT id, code_hash, expires_at, attempts, consumed_at
         FROM identity.email_verification_codes
         WHERE email = $1
         ORDER BY created_at DESC LIMIT 1`,
        [emailNorm],
      );

      if (codeRow.rows.length === 0 || codeRow.rows[0].consumed_at) {
        throw new BadRequestException({
          code: 'INVALID_VERIFICATION_CODE',
          message: 'Código de verificación no válido o ya utilizado. Solicita un nuevo código.',
        });
      }

      const verification = codeRow.rows[0];
      if (new Date() > new Date(verification.expires_at)) {
        throw new BadRequestException({
          code: 'EXPIRED_VERIFICATION_CODE',
          message: 'El código de verificación ha expirado (15 min). Solicita uno nuevo.',
        });
      }

      const inputHash = createHash('sha256').update(dto.verificationCode.trim()).digest('hex');
      if (inputHash !== verification.code_hash) {
        await this.db.query(
          `UPDATE identity.email_verification_codes SET attempts = attempts + 1 WHERE id = $1`,
          [verification.id],
        );
        throw new BadRequestException({
          code: 'INVALID_VERIFICATION_CODE',
          message: 'El código de verificación es incorrecto',
        });
      }
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);

    return this.db.withTransaction(async (client) => {
      // 1. Mark verification code as consumed if used
      if (dto.verificationCode) {
        await client.query(
          `UPDATE identity.email_verification_codes SET consumed_at = now() WHERE email = $1 AND consumed_at IS NULL`,
          [emailNorm],
        );
      }

      // 2. Insert user
      const userRes = await client.query(
        `INSERT INTO identity.users (full_name, email, phone, status)
         VALUES ($1, $2, $3, 'active')
         RETURNING id, full_name, email, phone`,
        [dto.fullName.trim(), emailNorm, phoneNorm],
      );
      const user = userRes.rows[0];

      // 3. Insert password credentials
      await client.query(
        `INSERT INTO identity.password_credentials (user_id, password_hash)
         VALUES ($1, $2)`,
        [user.id, passwordHash],
      );

      // 4. Grant default role 'customer'
      await client.query(
        `INSERT INTO identity.user_roles (user_id, role_code)
         VALUES ($1, 'customer')`,
        [user.id],
      );

      await this.revokePrevious(client, previousToken);

      // 5. Create session in database
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = this.sessionExpiry();

      await client.query(
        `INSERT INTO identity.sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt],
      );

      return {
        user: await this.getProfile(user.id, client),
        rawToken,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  async googleLogin(dto: GoogleAuthDto, previousToken?: string): Promise<SessionResult> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    let googlePayload: { sub: string; email: string; name?: string; picture?: string } | null = null;

    try {
      if (clientId) {
        const client = new OAuth2Client(clientId);
        const ticket = await client.verifyIdToken({
          idToken: dto.idToken,
          audience: clientId,
        });
        const payload = ticket.getPayload();
        if (payload?.sub && payload?.email) {
          googlePayload = {
            sub: payload.sub,
            email: payload.email.toLowerCase(),
            name: payload.name || payload.given_name || 'Usuario Google',
            picture: payload.picture,
          };
        }
      } else {
        // Fallback: verify directly via Google tokeninfo public API
        const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(dto.idToken)}`);
        if (!res.ok) {
          throw new Error('Google tokeninfo rejected token');
        }
        const data = await res.json();
        if (data.sub && data.email) {
          googlePayload = {
            sub: data.sub,
            email: data.email.toLowerCase(),
            name: data.name || data.email.split('@')[0],
            picture: data.picture,
          };
        }
      }
    } catch (err: any) {
      this.logger.error(`Error verificando token de Google: ${err.message}`);
      throw new UnauthorizedException({
        code: 'INVALID_GOOGLE_TOKEN',
        message: 'No se pudo verificar el token de Google. Inicia sesión nuevamente.',
      });
    }

    if (!googlePayload || !googlePayload.email) {
      throw new UnauthorizedException({
        code: 'GOOGLE_EMAIL_REQUIRED',
        message: 'No se pudo obtener el correo de la cuenta de Google',
      });
    }

    const { sub, email, name } = googlePayload;

    return this.db.withTransaction(async (client) => {
      // 1. Check if external account exists
      const extRes = await client.query(
        `SELECT user_id FROM identity.external_accounts WHERE provider = 'google' AND provider_subject = $1`,
        [sub],
      );

      let userId: string;

      if (extRes.rows.length > 0) {
        userId = extRes.rows[0].user_id;
      } else {
        // 2. Check if user with this email already exists
        const userRes = await client.query(
          `SELECT id, status FROM identity.users WHERE email = $1`,
          [email],
        );

        if (userRes.rows.length > 0) {
          userId = userRes.rows[0].id;
          // Link existing user to google provider
          await client.query(
            `INSERT INTO identity.external_accounts (user_id, provider, provider_subject)
             VALUES ($1, 'google', $2)
             ON CONFLICT (provider, provider_subject) DO NOTHING`,
            [userId, sub],
          );
          // Ensure base customer role exists while preserving all other assigned roles
          await client.query(
            `INSERT INTO identity.user_roles (user_id, role_code)
             VALUES ($1, 'customer')
             ON CONFLICT (user_id, role_code) DO NOTHING`,
            [userId],
          );
        } else {
          // 3. Create new user
          const phone = dto.phone?.trim() || `+519${Math.floor(10000000 + Math.random() * 90000000)}`;
          const newUserRes = await client.query(
            `INSERT INTO identity.users (full_name, email, phone, status)
             VALUES ($1, $2, $3, 'active')
             RETURNING id`,
            [name || 'Usuario Google', email, phone],
          );
          userId = newUserRes.rows[0].id;

          // Assign default role 'customer'
          await client.query(
            `INSERT INTO identity.user_roles (user_id, role_code)
             VALUES ($1, 'customer')`,
            [userId],
          );

          // Link external account
          await client.query(
            `INSERT INTO identity.external_accounts (user_id, provider, provider_subject)
             VALUES ($1, 'google', $2)`,
            [userId, sub],
          );
        }
      }

      // Check user status
      const statusCheck = await client.query(
        `SELECT status FROM identity.users WHERE id = $1`,
        [userId],
      );
      if (statusCheck.rows.length === 0 || statusCheck.rows[0].status !== 'active') {
        throw new UnauthorizedException({
          code: 'ACCOUNT_SUSPENDED',
          message: 'La cuenta no se encuentra activa',
        });
      }

      await this.revokePrevious(client, previousToken);

      // Create session in identity.sessions (database persistence)
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = this.sessionExpiry();

      await client.query(
        `INSERT INTO identity.sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt],
      );

      return {
        user: await this.getProfile(userId, client),
        rawToken,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  async login(dto: LoginDto, previousToken?: string): Promise<SessionResult> {
    const emailNorm = dto.email.trim().toLowerCase();

    const userRes = await this.db.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.status, pc.password_hash,
              COALESCE(array_agg(ur.role_code) FILTER (WHERE ur.role_code IS NOT NULL), '{}') as roles
       FROM identity.users u
       JOIN identity.password_credentials pc ON u.id = pc.user_id
       LEFT JOIN identity.user_roles ur ON u.id = ur.user_id
       WHERE u.email = $1
       GROUP BY u.id, pc.password_hash`,
      [emailNorm],
    );

    if (userRes.rows.length === 0) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Correo o contraseña incorrectos',
      });
    }

    const user = userRes.rows[0];

    if (user.status !== 'active') {
      throw new UnauthorizedException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'La cuenta no se encuentra activa',
      });
    }

    const isValid = await this.passwordHasher.verify(dto.password, user.password_hash);

    if (!isValid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Correo o contraseña incorrectos',
      });
    }

    return this.db.withTransaction(async (client) => {
      await this.revokePrevious(client, previousToken);
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = this.sessionExpiry();
      await client.query(
        `INSERT INTO identity.sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt],
      );
      return {
        user: await this.getProfile(user.id, client),
        rawToken,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  async logout(sessionId: string): Promise<void> {
    await this.db.query(
      `UPDATE identity.sessions
       SET revoked_at = now()
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId],
    );
  }

  private async revokePrevious(db: Queryable, token?: string): Promise<void> {
    if (!token) return;
    await db.query('UPDATE identity.sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
      [createHash('sha256').update(token).digest('hex')]);
  }

  private sessionExpiry(): Date {
    const hours = Number(this.config.get('SESSION_TTL_HOURS', '72'));
    if (!Number.isFinite(hours) || hours < 1 || hours > 720) throw new Error('Invalid SESSION_TTL_HOURS');
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  async getProfile(userId: string, db: Queryable = this.db): Promise<UserProfileDto> {
    const res = await db.query(
      `SELECT u.id, u.full_name, u.email, u.phone, u.status, u.avatar_object_key, u.created_at,
              COALESCE(array_agg(ur.role_code) FILTER (WHERE ur.role_code IS NOT NULL), '{}') as roles
       FROM identity.users u
       LEFT JOIN identity.user_roles ur ON u.id = ur.user_id
       WHERE u.id = $1 AND u.status = 'active'
       GROUP BY u.id`,
      [userId],
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const row = res.rows[0];
    const memberships = await db.query(
      `SELECT m.store_id AS "storeId", s.name AS "storeName", s.status AS "storeStatus",
              m.membership_role AS "membershipRole"
       FROM merchant.memberships m JOIN merchant.stores s ON s.id = m.store_id
       WHERE m.user_id = $1 AND m.is_active ORDER BY s.name, s.id`, [userId],
    );
    const courier = await db.query('SELECT user_id FROM delivery.courier_profiles WHERE user_id = $1', [userId]);
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      roles: row.roles,
      createdAt: row.created_at.toISOString(),
      memberships: memberships.rows,
      courierId: courier.rows.length ? userId : null,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfileDto> {
    return this.db.withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE identity.users SET full_name = COALESCE($2, full_name),
         email = COALESCE($3, email), phone = COALESCE($4, phone), updated_at = now()
         WHERE id = $1 AND status = 'active' RETURNING id`,
        [userId, dto.fullName, dto.email, dto.phone],
      );
      if (!result.rowCount) throw new UnauthorizedException('La cuenta no está activa');
      return this.getProfile(userId, client);
    });
  }
}
