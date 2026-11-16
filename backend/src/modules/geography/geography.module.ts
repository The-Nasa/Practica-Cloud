import { Module } from '@nestjs/common';
import { GeographyService } from './application/geography.service';
import { GeographyController, AdminZonesController } from './infrastructure/controllers/geography.controller';

@Module({
  controllers: [GeographyController, AdminZonesController],
  providers: [GeographyService],
  exports: [GeographyService],
})
export class GeographyModule {}
