import { Module } from '@nestjs/common';
import { PlatformService } from './application/platform.service';
import { PlatformController } from './infrastructure/controllers/platform.controller';
import {NotificationWorker} from './application/notification-worker.service';
import {ReportService} from './application/report.service';
import {ReportController} from './infrastructure/controllers/report.controller';
import {OperationsController} from './infrastructure/controllers/operations.controller';

@Module({
  controllers: [PlatformController,ReportController,OperationsController],
  providers: [PlatformService,NotificationWorker,ReportService],
  exports: [PlatformService],
})
export class PlatformModule {}
