import { Inject, Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export const DATABASE_POOL = Symbol('DATABASE_POOL');

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    // Do not log raw driver errors: they can contain connection details or SQL values.
    this.pool.on('error', () => this.logger.error('Idle database connection failed'));
  }

  async onModuleInit(): Promise<void> {
    try {
      const result = await this.pool.query<{ database: string; version: string }>(
        "SELECT current_database() AS database, current_setting('server_version_num') AS version",
      );
      const server = result.rows[0];
      if (!server?.database || !/^\d+$/.test(server.version)) throw new Error('Unexpected database response');
      const majorVersion = Math.floor(Number(server.version) / 10000);
      this.logger.log(`Connected to ${server.database} on PostgreSQL ${majorVersion}`);
    } catch {
      await this.pool.end();
      throw new Error('Database check failed: verify the connection URL or database credentials');
    }
  }

  query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, values);
  }

  // All work inside this callback must use this client, never pool.query().
  // This preserves row locks held by reserve_listing_stock() until commit.
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); }
      catch { broken = true; }
      throw error;
    } finally {
      client.release(broken);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
