import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class ApplyCourierDto {
  @ApiProperty({ enum: ['motorcycle', 'bicycle', 'mototaxi'] }) @IsIn(['motorcycle', 'bicycle', 'mototaxi']) vehicleType: string;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @IsString() @Length(3, 20)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) plate?: string | null;
  @ApiProperty({ format: 'uuid' }) @IsUUID() zoneId: string;
}
export class CourierAvailabilityDto {
  @ApiProperty() @IsBoolean() isOnline: boolean;
}
export class CourierProfileDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
  @ApiProperty() phone: string;
  @ApiProperty({ enum: ['motorcycle', 'bicycle', 'mototaxi'] }) vehicleType: string;
  @ApiProperty({ type: String, nullable: true }) plate: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) zoneId: string | null;
  @ApiProperty({ type: String, nullable: true }) zoneName: string | null;
  @ApiProperty({ enum: ['pending', 'active', 'rejected', 'suspended'] }) status: string;
  @ApiProperty({ type: String, nullable: true }) statusReason: string | null;
  @ApiProperty() isOnline: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
export class CourierListDto {
  @ApiProperty({ type: [CourierProfileDto] }) items: CourierProfileDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}

export class AssociateCourierDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  courierUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
