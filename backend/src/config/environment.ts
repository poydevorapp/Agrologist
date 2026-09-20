export function validateEnvironment(input: Record<string, unknown>): Record<string, unknown> {
  const text = (key: string, fallback?: string): string => {
    const value = input[key] ?? fallback;
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Missing or invalid configuration: ${key}`);
    }
    return value;
  };
  const integer = (key: string, fallback: number, max: number): number => {
    const raw = input[key] ?? fallback;
    if (!/^\d+$/.test(String(raw))) throw new Error(`Invalid integer configuration: ${key}`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) {
      throw new Error(`Configuration out of range: ${key}`);
    }
    return value;
  };
  const nodeEnv = text('NODE_ENV', 'development');
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('Invalid configuration: NODE_ENV');
  }
  const ssl = input.DB_SSL ?? 'false';
  if (ssl !== 'true' && ssl !== 'false') throw new Error('DB_SSL must be true or false');
  const sslRejectUnauthorized = input.DB_SSL_REJECT_UNAUTHORIZED ?? 'true';
  if (sslRejectUnauthorized !== 'true' && sslRejectUnauthorized !== 'false') {
    throw new Error('DB_SSL_REJECT_UNAUTHORIZED must be true or false');
  }
  const databaseUrl = typeof input.DATABASE_URL === 'string' && input.DATABASE_URL.trim() !== ''
    ? input.DATABASE_URL.trim()
    : undefined;
  if (databaseUrl) {
    let parsed: URL;
    try { parsed = new URL(databaseUrl); }
    catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL'); }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      throw new Error('DATABASE_URL must use postgres:// or postgresql://');
    }
  }
  const dbName = databaseUrl ? undefined : text('DB_NAME', 'agro_marketplace');
  const dbUser = databaseUrl ? undefined : text('DB_USER');
  const password = databaseUrl ? undefined : text('DB_PASSWORD');
  if (password === 'replace_with_local_password') throw new Error('Set a real local DB_PASSWORD');
  const corsOrigins = text('CORS_ORIGIN', 'http://localhost:3001')
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (corsOrigins.length === 0 || corsOrigins.some(origin => {
    try { return !['http:', 'https:'].includes(new URL(origin).protocol); }
    catch { return true; }
  })) throw new Error('CORS_ORIGIN must contain valid comma-separated HTTP(S) origins');
  const accessSecret = text('JWT_ACCESS_SECRET');
  const refreshSecret = text('JWT_REFRESH_SECRET');
  if (accessSecret.length < 32 || refreshSecret.length < 32 ||
      accessSecret.startsWith('replace_with_') || refreshSecret.startsWith('replace_with_')) {
    throw new Error('Set distinct JWT secrets with at least 32 characters');
  }
  if (accessSecret === refreshSecret) throw new Error('JWT access and refresh secrets must differ');
  return {
    ...input,
    NODE_ENV: nodeEnv,
    HOST: text('HOST', '127.0.0.1'),
    PORT: integer('PORT', 3000, 65535),
    CORS_ORIGINS: corsOrigins,
    DATABASE_URL: databaseUrl,
    DB_HOST: text('DB_HOST', 'localhost'),
    DB_PORT: integer('DB_PORT', 5432, 65535),
    DB_NAME: dbName,
    DB_USER: dbUser,
    DB_PASSWORD: password,
    DB_SSL: ssl === 'true',
    DB_SSL_REJECT_UNAUTHORIZED: sslRejectUnauthorized === 'true',
    DB_POOL_MAX: integer('DB_POOL_MAX', 10, 100),
    DB_CONNECT_TIMEOUT_MS: integer('DB_CONNECT_TIMEOUT_MS', 5000, 60000),
    DB_QUERY_TIMEOUT_MS: integer('DB_QUERY_TIMEOUT_MS', 10000, 300000),
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
    JWT_ACCESS_TTL_SECONDS: integer('JWT_ACCESS_TTL_SECONDS', 900, 86400),
    JWT_REFRESH_TTL_SECONDS: integer('JWT_REFRESH_TTL_SECONDS', 604800, 31536000),
  };
}
