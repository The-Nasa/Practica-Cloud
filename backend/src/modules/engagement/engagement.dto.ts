import {ApiProperty,ApiPropertyOptional} from '@nestjs/swagger';
import {IsInt,IsOptional,IsString,Max,MaxLength,Min} from 'class-validator';
import {Transform} from 'class-transformer';
export class ReviewInput {
 @ApiProperty({minimum:1,maximum:5}) @IsInt() @Min(1) @Max(5) rating!:number;
 @ApiPropertyOptional({maxLength:1000}) @IsOptional() @IsString() @Transform(({value})=>typeof value==='string'?value.trim():value) @MaxLength(1000) comment?:string;
}
export class FavoriteItem {
 @ApiProperty() id!:string;
 @ApiProperty({enum:['product','store']}) kind!:string;
 @ApiProperty() name!:string;
 @ApiProperty() available!:boolean;
}
export class FavoritePage {
 @ApiProperty({type:[FavoriteItem]}) items!:FavoriteItem[];
 @ApiProperty({type:String,nullable:true}) nextCursor!:string|null;
}
export class ReviewItem {
 @ApiProperty() id!:string;
 @ApiProperty() rating!:number;
 @ApiProperty({type:String,nullable:true}) comment!:string|null;
 @ApiProperty() createdAt!:string;
}
export class ReviewPage {
 @ApiProperty({type:[ReviewItem]}) items!:ReviewItem[];
 @ApiProperty({type:String,nullable:true}) nextCursor!:string|null;
 @ApiProperty() count!:number;
 @ApiProperty({type:Number,nullable:true}) average!:number|null;
}
