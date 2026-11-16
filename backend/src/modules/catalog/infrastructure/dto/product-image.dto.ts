import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
export class ProductImageInputDto {
  @ApiProperty({ description: 'PNG RGB/RGBA base64 sin prefijo data URL. Validado y saneado en servidor.' })
  @IsString() @MaxLength(2796204) content: string;
  @ApiProperty() @IsString() @MaxLength(200) altText: string;
  @ApiProperty() @IsInt() @Min(0) @Max(9) position: number;
}
