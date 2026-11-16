import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { ListQueryDto } from './list-query.dto';

export class OperationalDecisionDto {
  @ApiProperty({ enum: ['approve', 'reject', 'suspend', 'reactivate'] }) @IsIn(['approve', 'reject', 'suspend', 'reactivate'])
  decision: 'approve' | 'reject' | 'suspend' | 'reactivate';
  @ApiProperty() @IsString() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @Length(3, 500) reason: string;
}
export class OperationalListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'active', 'rejected', 'suspended'] }) @IsOptional() @IsIn(['pending', 'active', 'rejected', 'suspended']) status?: string;
}
