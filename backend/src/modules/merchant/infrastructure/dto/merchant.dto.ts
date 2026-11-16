import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
import { ListQueryDto } from '../../../../platform/http/list-query.dto';
export { OperationalDecisionDto, OperationalListQueryDto } from '../../../../platform/http/operational.dto';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class CreateStoreDto {
  @ApiProperty() @IsString() @Length(1, 60) categoryCode: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() zoneId: string;
  @ApiProperty() @IsString() @Transform(trim) @Length(3, 120) name: string;
  @ApiProperty() @IsString() @Transform(trim) @Length(3, 250) addressText: string;
  @ApiProperty() @Matches(/^\+[1-9][0-9]{7,14}$/) phone: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Transform(trim) @Length(0, 1000) description?: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() @Transform(trim) @Length(3, 180) legalBusinessName?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @Matches(/^[0-9]{11}$/) taxId?: string | null;
  @ApiPropertyOptional({ minimum: 0, maximum: 100000000 }) @IsOptional() @IsInt() @Min(0) @Max(100000000) minimumOrderCents?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 1440 }) @IsOptional() @IsInt() @Min(1) @Max(1440) preparationMinutes?: number;
}
export class UpdateStoreDto extends PartialType(CreateStoreDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() acceptingOrders?: boolean;
}
export class OpeningIntervalDto {
  @ApiProperty({ minimum: 1, maximum: 7 }) @IsInt() @Min(1) @Max(7) weekday: number;
  @ApiProperty({ example: '09:00' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) opensAt: string;
  @ApiProperty({ example: '22:00' }) @Matches(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/) closesAt: string;
}
export class ReplaceHoursDto {
  @ApiProperty({ type: [OpeningIntervalDto] }) @IsArray() @ArrayMaxSize(28) @ValidateNested({ each: true }) @Type(() => OpeningIntervalDto)
  intervals: OpeningIntervalDto[];
}
export class StoreCategoryDto { @ApiProperty() code: string; @ApiProperty() label: string }
export class StoreDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() categoryCode: string;
  @ApiProperty({ format: 'uuid' }) zoneId: string;
  @ApiProperty() zoneName: string;
  @ApiProperty() description: string;
  @ApiProperty() addressText: string;
  @ApiProperty() phone: string;
  @ApiProperty({ type: String, nullable: true }) legalBusinessName: string | null;
  @ApiProperty({ type: String, nullable: true }) taxId: string | null;
  @ApiProperty({ enum: ['pending', 'active', 'rejected', 'suspended'] }) status: string;
  @ApiProperty({ type: String, nullable: true }) statusReason: string | null;
  @ApiProperty() acceptingOrders: boolean;
  @ApiProperty() isOpen: boolean;
  @ApiProperty() minimumOrderCents: number;
  @ApiProperty() preparationMinutes: number;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ enum: ['owner', 'manager', 'operator', 'admin'] }) membershipRole: string;
}
export class StoreListDto {
  @ApiProperty({ type: [StoreDto] }) items: StoreDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
export class StoreDetailDto extends StoreDto { @ApiProperty({ type: [OpeningIntervalDto] }) openingIntervals: OpeningIntervalDto[] }
export class StoreMemberDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: ['owner', 'manager', 'operator'] }) membershipRole: string;
  @ApiProperty() isActive: boolean;
}
export class SetStoreMemberDto {
  @ApiProperty() @IsEmail() @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) email: string;
  @ApiProperty({ enum: ['manager', 'operator'] }) @IsIn(['manager', 'operator']) membershipRole: 'manager' | 'operator';
}
