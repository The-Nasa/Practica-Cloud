import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
export enum BrandingKind { logo = 'logo', banner = 'banner' }
export class ImageContentDto {
  @ApiProperty({ description: 'PNG RGB/RGBA base64 sin prefijo data URL; hasta 2 MB y 1600 × 1600.' })
  @IsString() @MaxLength(2796204) content: string;
}
export class AvatarDto {
  @ApiProperty({ type: String, nullable: true }) url: string | null;
}
export class StoreBrandingDto {
  @ApiProperty({ type: String, nullable: true }) logoUrl: string | null;
  @ApiProperty({ type: String, nullable: true }) bannerUrl: string | null;
}
