import { ApiProperty } from '@nestjs/swagger';
export class OperationsDto {
  @ApiProperty() checkedAt: string;
  @ApiProperty() pendingEvents: number;
  @ApiProperty() retryingEvents: number;
  @ApiProperty({ type: Number, nullable: true }) oldestPendingEventSeconds: number | null;
  @ApiProperty() expiredPendingOrders: number;
  @ApiProperty() activeAssignments: number;
  @ApiProperty() openTickets: number;
  @ApiProperty() poolTotal: number;
  @ApiProperty() poolIdle: number;
  @ApiProperty() poolWaiting: number;
  @ApiProperty({ type: [String] }) alerts: string[];
}
