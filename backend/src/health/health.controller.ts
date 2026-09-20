import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { Public } from '../authorization/authorization.decorators.js';

type HealthResponse = {
  status: 'ok' | 'error';
  application: { status: 'up' };
  database: { status: 'up' | 'down'; version: string | null };
};

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    try {
      const result = await this.database.query<{ version: string }>('SELECT version() AS version');
      return {
        status: 'ok',
        application: { status: 'up' },
        database: { status: 'up', version: result.rows[0]?.version ?? null },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        application: { status: 'up' },
        database: { status: 'down', version: null },
      } satisfies HealthResponse);
    }
  }
}
