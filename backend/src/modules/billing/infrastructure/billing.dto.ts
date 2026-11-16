import { ApiProperty } from '@nestjs/swagger';

export class PaymentMethodDto {
  @ApiProperty() code: string;
  @ApiProperty() label: string;
  @ApiProperty() available: boolean;
  @ApiProperty({ type: String, nullable: true }) unavailableReason: string | null;
}

export class RefundSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() orderId: string;
  @ApiProperty() amountCents: number;
  @ApiProperty({ enum: ['pending', 'processing', 'succeeded', 'failed'] }) status: string;
  @ApiProperty() createdAt: string;
  @ApiProperty({ type: String, nullable: true }) succeededAt: string | null;
}

export class PaymentAttemptDto {
  @ApiProperty() id: string;
  @ApiProperty() methodCode: string;
  @ApiProperty({ enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled'] }) status: string;
  @ApiProperty() amountCents: number;
  @ApiProperty() createdAt: string;
  @ApiProperty({ type: String, nullable: true }) succeededAt: string | null;
  @ApiProperty({ type: [RefundSummaryDto] }) refunds: RefundSummaryDto[];
}

export class PaymentHistoryDto {
  @ApiProperty({ type: [PaymentAttemptDto] }) items: PaymentAttemptDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
