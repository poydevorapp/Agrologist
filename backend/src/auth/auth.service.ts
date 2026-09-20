import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import { AppRole } from '../authorization/authorization.types.js';
import { LoginDto, RegisterDto } from './auth.dto.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

type UserRow = {
  id: string;
  phone: string;
  email: string | null;
  full_name: string;
  status: string;
};

type CredentialRow = UserRow & { password_hash: string | null };
type PublicUser = { id: string; phone: string; email: string | null; fullName: string; status: string; roles: AppRole[] };
type AuthResponse = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  accessExpiresIn: number;
  refreshExpiresIn: number;
};

const invalidCredentials = (): UnauthorizedException => new UnauthorizedException('Invalid credentials');
const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterDto): Promise<AuthResponse> {
    const phone = input.phone.trim();
    const email = input.email?.trim().toLowerCase() || null;
    const fullName = input.fullName.trim();
    if (!phone || !fullName) throw new ConflictException('Invalid registration data');
    const roles = input.roles;
    if (!Array.isArray(roles) || roles.length === 0 || roles.length > 3 ||
        new Set(roles).size !== roles.length ||
        !roles.every((role) => ['FARMER', 'BUYER', 'TRANSPORTER'].includes(role))) {
      throw new BadRequestException('Choose at least one valid role');
    }
    const region = input.region?.trim() || null;
    const district = input.district?.trim() || null;
    if ((roles.includes('FARMER') || roles.includes('BUYER')) && (!region || !district)) {
      throw new BadRequestException('Region and district are required for farmer or buyer');
    }
    const passwordHash = await this.passwords.hash(input.password);

    try {
      return await this.database.transaction(async (client) => {
        const result = await client.query<UserRow>(
          `INSERT INTO users (phone, email, full_name, status)
           VALUES ($1, $2, $3, 'ACTIVE')
           RETURNING id, phone, email, full_name, status`,
          [phone, email, fullName],
        );
        const user = result.rows[0]!;
        await client.query(
          'INSERT INTO auth_credentials (user_id, password_hash) VALUES ($1, $2)',
          [user.id, passwordHash],
        );
        const assigned = await client.query(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT $1, id FROM roles WHERE name = ANY($2::text[])`,
          [user.id, roles],
        );
        if (assigned.rowCount !== roles.length) throw new Error('Registration roles are not configured');
        if (roles.includes('FARMER')) {
          await client.query(
            'INSERT INTO farmer_profiles (user_id, region, district) VALUES ($1, $2, $3)',
            [user.id, region, district],
          );
        }
        if (roles.includes('BUYER')) {
          await client.query(
            `INSERT INTO buyer_profiles (user_id, buyer_type, region, district)
             VALUES ($1, 'INDIVIDUAL', $2, $3)`,
            [user.id, region, district],
          );
        }
        if (roles.includes('TRANSPORTER')) {
          await client.query(
            `INSERT INTO transporter_profiles (user_id, service_region, availability_status)
             VALUES ($1, $2, 'AVAILABLE')`,
            [user.id, region],
          );
        }
        return this.createAuthResponse(client, user);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Account already exists');
      throw error;
    }
  }

  async login(input: LoginDto): Promise<AuthResponse> {
    const identifier = input.identifier.trim();
    const result = await this.database.query<CredentialRow>(
      `SELECT u.id, u.phone, u.email, u.full_name, u.status, c.password_hash
       FROM users u
       LEFT JOIN auth_credentials c ON c.user_id = u.id
       WHERE u.phone = $1 OR lower(u.email) = lower($1)
       LIMIT 2`,
      [identifier],
    );
    const row = result.rows.length === 1 ? result.rows[0] : undefined;
    if (!row?.password_hash) {
      await this.passwords.consumeEquivalentWork(input.password);
      throw invalidCredentials();
    }
    const valid = await this.passwords.verify(input.password, row.password_hash);
    if (!valid || row.status !== 'ACTIVE') throw invalidCredentials();
    return this.database.transaction((client) => this.createAuthResponse(client, row));
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const payload = this.tokens.verifyRefresh(refreshToken);
    return this.database.transaction(async (client) => {
      const result = await client.query<UserRow>(
        `SELECT u.id, u.phone, u.email, u.full_name, u.status
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.user_id = $2 AND s.token_hash = $3
           AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
           AND u.status = 'ACTIVE'
         FOR UPDATE OF s`,
        [payload.sid, payload.sub, tokenHash(refreshToken)],
      );
      const user = result.rows[0];
      if (!user) throw invalidCredentials();
      await client.query('UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1', [payload.sid]);
      return this.createAuthResponse(client, user);
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.database.query(
      `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash(refreshToken)],
    );
  }

  private async createAuthResponse(client: PoolClient, user: UserRow): Promise<AuthResponse> {
    const sessionId = randomUUID();
    const refreshToken = this.tokens.signRefresh(user.id, sessionId);
    const refreshExpiresIn = this.config.getOrThrow<number>('JWT_REFRESH_TTL_SECONDS');
    await client.query(
      `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, user.id, tokenHash(refreshToken), new Date(Date.now() + refreshExpiresIn * 1000)],
    );
    const roleResult = await client.query<{ name: AppRole }>(
      `SELECT r.name FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 ORDER BY r.name`,
      [user.id],
    );
    return {
      user: this.publicUser(user, roleResult.rows.map((row) => row.name)),
      accessToken: this.tokens.signAccess(user.id),
      refreshToken,
      tokenType: 'Bearer',
      accessExpiresIn: this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS'),
      refreshExpiresIn,
    };
  }

  private publicUser(user: UserRow, roles: AppRole[]): PublicUser {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      fullName: user.full_name,
      status: user.status,
      roles,
    };
  }
}
