import { ApiProperty } from '@nestjs/swagger';
export class HealthLiveDto {
 @ApiProperty({ enum: ['ok'] }) status: 'ok';
 @ApiProperty() service: string;
}
export class HealthReadyDto extends HealthLiveDto {
 @ApiProperty({ format: 'date-time' }) timestamp: string;
 @ApiProperty({ enum: ['connected'] }) database: 'connected';
 @ApiProperty() version: string;
}
