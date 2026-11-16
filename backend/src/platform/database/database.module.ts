import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { HealthController } from '../controllers/health.controller';

@Global()
@Module({
  controllers: [HealthController],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
