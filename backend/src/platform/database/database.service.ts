import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow, types } from 'pg';
import { boundedInteger } from '../runtime-config';

// Parse int8 (bigint) to number if within safe integer range, otherwise string
types.setTypeParser(types.builtins.INT8, (val: string) => {
  const num = Number(val);
  return Number.isSafeInteger(num) ? num : val;
});

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor(private readonly configService: ConfigService) {
    const limits = {
      max: boundedInteger(configService.get('PG_POOL_MAX'), 20, 1, 100, 'PG_POOL_MAX'),
      connectionTimeoutMillis: boundedInteger(configService.get('PG_CONNECT_TIMEOUT_MS'), 5000, 100, 30000, 'PG_CONNECT_TIMEOUT_MS'),
      statement_timeout: boundedInteger(configService.get('PG_STATEMENT_TIMEOUT_MS'), 15000, 100, 120000, 'PG_STATEMENT_TIMEOUT_MS'),
      idle_in_transaction_session_timeout: boundedInteger(configService.get('PG_IDLE_TRANSACTION_TIMEOUT_MS'), 15000, 100, 120000, 'PG_IDLE_TRANSACTION_TIMEOUT_MS'),
      idleTimeoutMillis: 30000,
    };
    const connectionString = this.configService.get<string>('DATABASE_URL');
    const sslMode = this.configService.get<string>('DATABASE_SSL');
    let host = this.configService.get<string>('DATABASE_HOST', 'localhost');
    if (connectionString) {
      try { host = new URL(connectionString).hostname; } catch { throw new Error('INVALID_DATABASE_URL'); }
    }
    // The selected URL is authoritative; stale host settings must not force TLS on a local test DB.
    const useSsl = sslMode === 'true' || (sslMode !== 'false' && host.includes('supabase'));
    const ssl = useSsl ? { rejectUnauthorized: false } : undefined;

    if (connectionString) {
      this.pool = new Pool({ connectionString, ssl, ...limits });
    } else {
      this.pool = new Pool({
        host: this.configService.get<string>('DATABASE_HOST', 'localhost'),
        port: this.configService.get<number>('DATABASE_PORT', 5432),
        user: this.configService.get<string>('DATABASE_USER', 'quickly_user'),
        password: this.configService.get<string>('DATABASE_PASSWORD', 'quickly_secret'),
        database: this.configService.get<string>('DATABASE_NAME', 'quickly_db'),
        ssl,
        ...limits,
      });
    }
  }

  async onModuleInit() {
    try {
      const client = await this.pool.connect();
      client.release();
      this.logger.log('PostgreSQL connection pool initialized successfully');
    } catch (error: any) {
      this.logger.warn(`PostgreSQL unavailable on startup; readiness will reject requests. ${error?.message || error}`);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('PostgreSQL pool closed');
  }

  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    const res = await this.pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      this.logger.warn(JSON.stringify({event:'slow_database_query',durationMs:duration}));
    }
    return res;
  }

  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  getPool(): Pool {
    return this.pool;
  }
}
