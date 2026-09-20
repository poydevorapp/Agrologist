import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DatabaseService, DATABASE_POOL } from './database.service.js';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Pool => {
        const connectionString = config.get<string>('DATABASE_URL');
        const connection = connectionString
          ? { connectionString }
          : {
              host: config.getOrThrow<string>('DB_HOST'),
              port: config.getOrThrow<number>('DB_PORT'),
              database: config.getOrThrow<string>('DB_NAME'),
              user: config.getOrThrow<string>('DB_USER'),
              password: config.getOrThrow<string>('DB_PASSWORD'),
            };
        return new Pool({
          ...connection,
          ssl: config.getOrThrow<boolean>('DB_SSL')
            ? { rejectUnauthorized: config.getOrThrow<boolean>('DB_SSL_REJECT_UNAUTHORIZED') }
            : false,
          max: config.getOrThrow<number>('DB_POOL_MAX'),
          connectionTimeoutMillis: config.getOrThrow<number>('DB_CONNECT_TIMEOUT_MS'),
          statement_timeout: config.getOrThrow<number>('DB_QUERY_TIMEOUT_MS'),
          idle_in_transaction_session_timeout: 30000,
          application_name: 'agrologistik-backend',
          options: '-c search_path=public -c timezone=UTC',
        });
      },
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
