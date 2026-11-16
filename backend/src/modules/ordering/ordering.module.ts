import { Module } from '@nestjs/common';
import { OrderingService } from './application/ordering.service';
import { OrderingController } from './infrastructure/controllers/ordering.controller';
import { OrderExpirationService } from './application/order-expiration.service';
import { OrderFlowService } from './application/order-flow.service';
import { OrderFlowController } from './infrastructure/controllers/order-flow.controller';
import { GroupCheckoutService } from './application/group-checkout.service';
import { GroupCheckoutController } from './infrastructure/controllers/group-checkout.controller';

@Module({
  controllers: [OrderingController, OrderFlowController, GroupCheckoutController],
  providers: [OrderingService, OrderExpirationService, OrderFlowService, GroupCheckoutService],
  exports: [OrderingService, OrderExpirationService],
})
export class OrderingModule {}
