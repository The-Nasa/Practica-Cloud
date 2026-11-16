import {ApiProperty} from '@nestjs/swagger';
export class NotificationItem {
 @ApiProperty() id!:string;
 @ApiProperty() title!:string;
 @ApiProperty() message!:string;
 @ApiProperty() kind!:string;
 @ApiProperty({type:String,nullable:true}) relativeUrl!:string|null;
 @ApiProperty({type:String,nullable:true}) readAt!:string|null;
 @ApiProperty() createdAt!:string;
}
export class NotificationPage {
 @ApiProperty({type:[NotificationItem]}) items!:NotificationItem[];
 @ApiProperty({type:String,nullable:true}) nextCursor!:string|null;
 @ApiProperty() unreadCount!:number;
}
