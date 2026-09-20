import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

type TokenType = 'access' | 'refresh';
export type TokenPayload = {
  sub: string;
  type: TokenType;
  sid?: string;
  iat: number;
  exp: number;
  iss: 'agrologistik-backend';
  aud: 'agrologistik-marketplace';
};

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

@Injectable()
export class TokenService {
  constructor(private readonly config: ConfigService) {}

  signAccess(userId: string): string {
    return this.sign(userId, 'access', this.config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS'));
  }

  signRefresh(userId: string, sessionId: string): string {
    return this.sign(userId, 'refresh', this.config.getOrThrow<number>('JWT_REFRESH_TTL_SECONDS'), sessionId);
  }

  verifyRefresh(token: string): TokenPayload {
    return this.verify(token, 'refresh');
  }

  verifyAccess(token: string): TokenPayload {
    return this.verify(token, 'access');
  }

  private sign(userId: string, type: TokenType, ttl: number, sessionId?: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = {
      sub: userId,
      type,
      ...(sessionId ? { sid: sessionId } : {}),
      iat: now,
      exp: now + ttl,
      iss: 'agrologistik-backend',
      aud: 'agrologistik-marketplace',
    };
    const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`;
    return `${unsigned}.${this.signature(unsigned, type)}`;
  }

  private verify(token: string, type: TokenType): TokenPayload {
    const parts = token.split('.');
    if (parts.length !== 3 || token.length > 4096) throw new UnauthorizedException('Invalid credentials');
    const unsigned = `${parts[0]}.${parts[1]}`;
    const actual = Buffer.from(parts[2]!, 'base64url');
    const expected = Buffer.from(this.signature(unsigned, type), 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    try {
      const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as Record<string, unknown>;
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as TokenPayload;
      const now = Math.floor(Date.now() / 1000);
      if (header.alg !== 'HS256' || header.typ !== 'JWT' || payload.type !== type ||
          payload.iss !== 'agrologistik-backend' || payload.aud !== 'agrologistik-marketplace' ||
          typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || payload.exp <= now ||
          (type === 'refresh' && typeof payload.sid !== 'string')) {
        throw new Error('invalid');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  private signature(unsigned: string, type: TokenType): string {
    const key = type === 'access' ? 'JWT_ACCESS_SECRET' : 'JWT_REFRESH_SECRET';
    return createHmac('sha256', this.config.getOrThrow<string>(key)).update(unsigned).digest('base64url');
  }
}
