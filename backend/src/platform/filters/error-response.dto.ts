import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty() statusCode: number;
  @ApiProperty() error: string;
  @ApiProperty() code: string;
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }) message: string | string[];
  @ApiProperty({ format: 'uuid' }) requestId: string;
  @ApiProperty({ format: 'date-time' }) timestamp: string;
  @ApiProperty() path: string;
}
