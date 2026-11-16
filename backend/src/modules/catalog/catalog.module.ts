import { Module } from '@nestjs/common';
import { CatalogManagementService } from './application/catalog-management.service';
import { CatalogManagementController } from './infrastructure/controllers/catalog-management.controller';
import { ProductMediaService } from './application/product-media.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [MediaModule],
  controllers: [CatalogManagementController],
  providers: [CatalogManagementService, ProductMediaService],
  exports: [CatalogManagementService],
})
export class CatalogModule {}
