import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './platform/database/database.module';
import { IdentityModule } from './modules/identity/identity.module';
import { GeographyModule } from './modules/geography/geography.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { OrderingModule } from './modules/ordering/ordering.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { PlatformModule } from './modules/platform/platform.module';
import { MediaModule } from './modules/media/media.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { SupportModule } from './modules/support/support.module';
import { BillingModule } from './modules/billing/billing.module';
import { MailModule } from './platform/mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    DatabaseModule,
    MailModule,
    IdentityModule,
    GeographyModule,
    MerchantModule,
    CatalogModule,
    OrderingModule,
    DeliveryModule,
    PlatformModule,
    MediaModule,
    EngagementModule,
    SupportModule,
    BillingModule,
  ],
})
export class AppModule {}
