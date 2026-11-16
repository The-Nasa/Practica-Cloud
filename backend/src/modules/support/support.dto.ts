import {ApiProperty,ApiPropertyOptional} from '@nestjs/swagger';
import {IsIn,IsInt,IsOptional,IsString,IsUUID,MaxLength,Min,MinLength} from 'class-validator';
import {Transform} from 'class-transformer';
export class MessageInput {
 @ApiProperty({maxLength:3000}) @IsString() @Transform(({value})=>typeof value==='string'?value.trim():value) @MinLength(1) @MaxLength(3000) body!:string;
}
export class TicketInput extends MessageInput {
 @ApiProperty({maxLength:150}) @IsString() @Transform(({value})=>typeof value==='string'?value.trim():value) @MinLength(1) @MaxLength(150) subject!:string;
 @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() orderId?:string;
}
export class TicketDecision extends MessageInput {
 @ApiProperty() @IsInt() @Min(0) expectedVersion!:number;
 @ApiProperty({enum:['open','in_review','resolved']}) @IsIn(['open','in_review','resolved']) status!:string;
 @ApiProperty({enum:['low','normal','high']}) @IsIn(['low','normal','high']) priority!:string;
}
export class TicketItem {
 @ApiProperty() id!:string;
 @ApiProperty() subject!:string;
 @ApiProperty() status!:string;
 @ApiProperty() priority!:string;
 @ApiProperty() version!:number;
 @ApiProperty() createdAt!:string;
 @ApiProperty({type:String,nullable:true}) resolvedAt!:string|null;
 @ApiProperty({type:String,nullable:true}) orderId!:string|null;
}
export class TicketPage {
 @ApiProperty({type:[TicketItem]}) items!:TicketItem[];
 @ApiProperty({type:String,nullable:true}) nextCursor!:string|null;
}
export class TicketMessage {
 @ApiProperty() id!:string;
 @ApiProperty() authorUserId!:string;
 @ApiProperty() body!:string;
 @ApiProperty() createdAt!:string;
}
export class TicketDetail extends TicketItem {
 @ApiProperty({type:[TicketMessage]}) messages!:TicketMessage[];
}
