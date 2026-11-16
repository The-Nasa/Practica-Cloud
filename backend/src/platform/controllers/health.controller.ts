import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthLiveDto, HealthReadyDto } from './health.dto';
import { DatabaseService } from '../database/database.service';

@ApiTags('Monitoreo y Salud')
@Controller('api/v1')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get('health/live')
  @ApiOkResponse({ type: HealthLiveDto })
  live(): HealthLiveDto { return { status: 'ok', service: 'quickly-backend' }; }

  @Get('health/ready')
  @ApiOkResponse({ type: HealthReadyDto })
  ready(): Promise<HealthReadyDto> { return this.getHealth(); }

  @Get('health')
  @ApiOperation({ summary: 'Verificar estado de salud del backend y base de datos' })
  @ApiOkResponse({ type: HealthReadyDto })
  async getHealth(): Promise<HealthReadyDto> {
    try {
      await this.db.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'Base de datos no disponible' });
    }

    return {
      status: 'ok',
      service: 'quickly-backend',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: '1.0.0',
    };
  }
}
