import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
      maxmem: MAX_MEMORY,
    }, (error, key) => error ? reject(error) : resolve(key));
  });
}

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await derive(password, salt);
    return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString('base64url')}$${key.toString('base64url')}`;
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const parts = encoded.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt' || Number(parts[1]) !== COST ||
        Number(parts[2]) !== BLOCK_SIZE || Number(parts[3]) !== PARALLELIZATION) return false;
    try {
      const salt = Buffer.from(parts[4]!, 'base64url');
      const expected = Buffer.from(parts[5]!, 'base64url');
      if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
      const actual = await derive(password, salt);
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  // Performs the same expensive operation when an account is absent.
  async consumeEquivalentWork(password: string): Promise<void> {
    await derive(password, Buffer.alloc(16, 0));
  }
}
