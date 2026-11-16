import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateAddressDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() zoneId: string;
  @ApiProperty() @IsString() @Transform(trim) @Length(1, 60) label: string;
  @ApiProperty() @IsString() @Transform(trim) @Length(3, 120) recipientName: string;
  @ApiProperty() @Matches(/^\+[1-9][0-9]{7,14}$/) phone: string;
  @ApiProperty() @IsString() @Transform(trim) @Length(1, 180) street: string;
  @ApiProperty() @IsString() @Transform(trim) @Length(1, 30) streetNumber: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Transform(trim) @Length(0, 500) reference?: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}
export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
export class AddressDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) zoneId: string;
  @ApiProperty() zoneName: string;
  @ApiProperty() zoneActive: boolean;
  @ApiProperty() label: string;
  @ApiProperty() recipientName: string;
  @ApiProperty() phone: string;
  @ApiProperty() street: string;
  @ApiProperty() streetNumber: string;
  @ApiProperty() reference: string;
  @ApiProperty() isDefault: boolean;
  @ApiProperty({ type: Number, nullable: true }) latitude: number | null;
  @ApiProperty({ type: Number, nullable: true }) longitude: number | null;
}
export class CreateZoneDto {
  @ApiProperty() @Matches(/^[a-z0-9][a-z0-9_-]{1,39}$/) code: string;
  @ApiProperty() @IsString() @Transform(trim) @Length(3, 100) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Transform(trim) @Length(0, 500) description?: string;
  @ApiProperty({ minimum: 0, maximum: 100000000 }) @IsInt() @Min(0) @Max(100000000) baseFeeCents: number;
  @ApiProperty({ minimum: 1, maximum: 1440 }) @IsInt() @Min(1) @Max(1440) estimatedMinutes: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateZoneDto extends PartialType(CreateZoneDto) {
  @ApiProperty() @IsString() @Transform(trim) @Length(3, 500) reason: string;
}
export class ZoneDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() description: string;
  @ApiProperty() baseFeeCents: number;
  @ApiProperty() estimatedMinutes: number;
  @ApiProperty() isActive: boolean;
}
export class ZoneListDto {
  @ApiProperty({ type: [ZoneDto] }) items: ZoneDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
