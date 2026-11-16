import { Module } from '@nestjs/common';
import { BillingQueryService } from './application/billing-query.service';
import { BillingQueryController } from './infrastructure/billing.controller';

@Module({ providers: [BillingQueryService], controllers: [BillingQueryController] })
export class BillingModule {}
