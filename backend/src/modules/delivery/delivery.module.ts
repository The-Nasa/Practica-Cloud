import { Module } from '@nestjs/common';
import { DeliveryService } from './application/delivery.service';
import { DeliveryController, AdminDeliveryController, MerchantDeliveryController } from './infrastructure/controllers/delivery.controller';
import { CourierProfileService } from './application/courier-profile.service';
import { CourierProfileController, AdminCouriersController } from './infrastructure/controllers/courier-profile.controller';

@Module({
  controllers: [DeliveryController, AdminDeliveryController, MerchantDeliveryController, CourierProfileController, AdminCouriersController],
  providers: [DeliveryService, CourierProfileService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
