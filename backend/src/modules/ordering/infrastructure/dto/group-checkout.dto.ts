import { ApiProperty } from '@nestjs/swagger';
import { QuoteDto } from './flow.dto';

export class GroupQuoteDto {
  @ApiProperty({ type: [QuoteDto] }) stores: QuoteDto[];
  @ApiProperty() subtotalCents: number;
  @ApiProperty() deliveryFeeCents: number;
  @ApiProperty() totalCents: number;
}
export class GroupOrderDto {
  @ApiProperty() orderId: string;
  @ApiProperty() purchaseId: string;
  @ApiProperty() storeId: string;
  @ApiProperty() storeName: string;
  @ApiProperty() code: string;
  @ApiProperty() status: string;
  @ApiProperty() paymentStatus: string;
  @ApiProperty() totalCents: number;
  @ApiProperty() subtotalCents: number;
  @ApiProperty() deliveryFeeCents: number;
}
export class GroupCheckoutDto {
  @ApiProperty() id: string;
  @ApiProperty() createdAt: string;
  @ApiProperty() totalCents: number;
  @ApiProperty() deliveryFeeCents: number;
  @ApiProperty() subtotalCents: number;
  @ApiProperty({ type: [GroupOrderDto] }) orders: GroupOrderDto[];
}
