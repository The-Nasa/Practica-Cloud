import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 25;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID()
  cursor?: string;
}
export function pageOf<T extends { id: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
}
