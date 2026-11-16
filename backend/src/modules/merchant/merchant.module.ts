import { Module } from '@nestjs/common';
import { MerchantService } from './application/merchant.service';
import { StoresController } from './infrastructure/controllers/stores.controller';
import { StoreManagementService } from './application/store-management.service';
import { StoreManagementController, AdminStoresController } from './infrastructure/controllers/store-management.controller';

@Module({
  controllers: [StoresController, StoreManagementController, AdminStoresController],
  providers: [MerchantService, StoreManagementService],
  exports: [MerchantService],
})
export class MerchantModule {}
