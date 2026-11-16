import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { ListQueryDto } from '../../../../platform/http/list-query.dto';

export class AdminUserQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'pending', 'suspended'] }) @IsOptional() @IsIn(['active','pending','suspended']) status?: string;
}
export class UserStatusDto {
  @ApiProperty({ enum: ['active', 'suspended'] }) @IsIn(['active','suspended']) status: 'active' | 'suspended';
  @ApiProperty() @IsString() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @Length(3, 500) reason: string;
}
export class AdminUserDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
  @ApiProperty() phone: string;
  @ApiProperty({ enum: ['active','pending','suspended'] }) status: string;
  @ApiProperty({ type: [String] }) roles: string[];
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, nullable: true }) statusReason: string | null;
}
export class AdminUserListDto {
  @ApiProperty({ type: [AdminUserDto] }) items: AdminUserDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
export class AdminOverviewDto {
  @ApiProperty() pendingStores: number;
  @ApiProperty() pendingCouriers: number;
  @ApiProperty() activeStores: number;
  @ApiProperty() activeCouriers: number;
  @ApiProperty() activeUsers: number;
  @ApiProperty() suspendedUsers: number;
}
