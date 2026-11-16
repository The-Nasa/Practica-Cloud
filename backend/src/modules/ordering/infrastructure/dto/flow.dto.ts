import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../../../platform/http/list-query.dto';
export class OrderQueryDto extends ListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() storeId?:string;
  @ApiPropertyOptional({enum:['pending','confirmed','preparing','ready','in_transit','delivered','cancelled','rejected']})
  @IsOptional() @IsIn(['pending','confirmed','preparing','ready','in_transit','delivered','cancelled','rejected']) status?: string;
  @ApiPropertyOptional({enum:['available','active','history']}) @IsOptional() @IsIn(['available','active','history']) scope?: string;
}
export class OrderLineDto {
  @ApiProperty() skuId: string;
  @ApiProperty() productName: string;
  @ApiProperty() variantName: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unitPriceCents: number;
  @ApiProperty() note: string;
}
export class QuoteDto {
  @ApiProperty() storeId: string;
  @ApiProperty() storeName: string;
  @ApiProperty() subtotalCents: number;
  @ApiProperty() deliveryFeeCents: number;
  @ApiProperty() totalCents: number;
  @ApiProperty() cashTenderCents: number;
  @ApiProperty() cashChangeCents: number;
  @ApiProperty({type:[OrderLineDto]}) items: OrderLineDto[];
  @ApiProperty({type:[String]}) paymentMethods: string[];
}
export class AssignmentSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() courierUserId: string;
  @ApiProperty() status: string;
  @ApiProperty() version: number;
  @ApiProperty() agreedFeeCents: number;
}
export class OrderSummaryDto {
  @ApiPropertyOptional({ type: String, nullable: true }) checkoutGroupId?: string | null;
  @ApiProperty() id: string;
  @ApiProperty() purchaseId: string;
  @ApiProperty() code: string;
  @ApiProperty() storeId: string;
  @ApiProperty() storeName: string;
  @ApiProperty() status: string;
  @ApiProperty() version: number;
  @ApiProperty() subtotalCents: number;
  @ApiProperty() deliveryFeeCents: number;
  @ApiProperty() totalCents: number;
  @ApiProperty() paymentStatus: string;
  @ApiProperty({type:Number,nullable:true}) cashTenderCents: number|null;
  @ApiProperty({type:Number,nullable:true}) cashReceivedCents: number|null;
  @ApiProperty({type:String,nullable:true}) collectedByUserId: string|null;
  @ApiProperty() createdAt: string;
  @ApiProperty({type:String,nullable:true}) acceptanceExpiresAt: string|null;
  @ApiProperty({type:AssignmentSummaryDto,nullable:true}) assignment: AssignmentSummaryDto|null;
}
export class OrderPageDto {
  @ApiProperty({type:[OrderSummaryDto]}) items: OrderSummaryDto[];
  @ApiProperty({type:String,nullable:true}) nextCursor: string|null;
}
export class DestinationDto {
  @ApiProperty() recipientName: string;
  @ApiProperty() phone: string;
  @ApiProperty() street: string;
  @ApiProperty() streetNumber: string;
  @ApiProperty() reference: string;
}
export class TimelineEventDto {
  @ApiProperty() status: string;
  @ApiProperty() reason: string;
  @ApiProperty() occurredAt: string;
}
export class IncidentDto {
  @ApiProperty() id:string;
  @ApiProperty() description:string;
  @ApiProperty() createdAt:string;
}
export class OrderDetailDto extends OrderSummaryDto {
  @ApiPropertyOptional({type:[IncidentDto]}) incidents?:IncidentDto[];
  @ApiProperty({type:[OrderLineDto]}) items: OrderLineDto[];
  @ApiProperty({type:DestinationDto,nullable:true}) destination: DestinationDto|null;
  @ApiProperty({type:[TimelineEventDto]}) events: TimelineEventDto[];
}
export class CourierChoiceDto {
  @ApiProperty() userId: string;
  @ApiProperty() fullName: string;
}
