import {ApiProperty,ApiPropertyOptional} from '@nestjs/swagger';
import {IsISO8601,IsOptional,IsString,Matches,MaxLength} from 'class-validator';
export class ReportQuery {
 @ApiPropertyOptional({description:'Inicio inclusivo ISO 8601 con zona horaria; predeterminado últimos 30 días'}) @IsOptional() @IsISO8601() @Matches(/(Z|[+-]\d\d:\d\d)$/) from?:string;
 @ApiPropertyOptional({description:'Fin exclusivo ISO 8601 con zona horaria; predeterminado ahora'}) @IsOptional() @IsISO8601() @Matches(/(Z|[+-]\d\d:\d\d)$/) to?:string;
}
export class ReportResult {
 @ApiProperty() from!:string;
 @ApiProperty() to!:string;
 @ApiProperty() currency!:string;
 @ApiProperty() definition!:string;
 @ApiProperty() orders!:number;
 @ApiProperty() delivered!:number;
 @ApiProperty() cancelled!:number;
 @ApiProperty() deliveredSalesCents!:number;
 @ApiProperty() cashCollectedCents!:number;
 @ApiProperty() courierFeesCents!:number;
}
export class AuditQuery {
 @ApiPropertyOptional({description:'Cursor bigint decimal'}) @IsOptional() @Matches(/^\d{1,19}$/) cursor?:string;
 @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) action?:string;
}
export class AuditItem {
 @ApiProperty() id!:string;
 @ApiProperty({type:String,nullable:true}) actorUserId!:string|null;
 @ApiProperty() action!:string;
 @ApiProperty() entityType!:string;
 @ApiProperty() entityId!:string;
 @ApiProperty() requestId!:string;
 @ApiProperty() occurredAt!:string;
}
export class AuditPage {
 @ApiProperty({type:[AuditItem]}) items!:AuditItem[];
 @ApiProperty({type:String,nullable:true}) nextCursor!:string|null;
}
