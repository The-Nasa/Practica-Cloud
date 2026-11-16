import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseUUIDPipe, Put, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthGuard } from '../../../../platform/guards/auth.guard';
import { mutationActor, MutationRequest } from '../../../platform/public';
import { ProfileMediaService } from '../../application/profile-media.service';
import { AvatarDto, BrandingKind, ImageContentDto, StoreBrandingDto } from '../dto/media.dto';

const png = (response: Response, bytes: Buffer) => response.set({ 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }).send(bytes);
@ApiTags('Archivos de perfil y comercio') @Controller('api/v1')
export class ProfileMediaController {
  constructor(private readonly media: ProfileMediaService) {}
  @Get('me/avatar') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiOkResponse({type:AvatarDto})
  avatar(@Req() req: MutationRequest) { return this.media.avatar(mutationActor(req)); }
  @Put('me/avatar') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiOkResponse({type:AvatarDto})
  setAvatar(@Body() dto: ImageContentDto, @Req() req: MutationRequest) { return this.media.setAvatar(mutationActor(req),dto.content); }
  @Delete('me/avatar') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiOkResponse({type:AvatarDto})
  removeAvatar(@Req() req: MutationRequest) { return this.media.setAvatar(mutationActor(req)); }
  @Get('me/avatar/:key') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiProduces('image/png') @ApiOkResponse({schema:{type:'string',format:'binary'}})
  async avatarImage(@Param('key') key: string, @Req() req: MutationRequest, @Res() response: Response) { return png(response,await this.media.avatarBytes(mutationActor(req),key)); }
  @Get('merchant/stores/:id/branding') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiOkResponse({type:StoreBrandingDto})
  branding(@Param('id',ParseUUIDPipe) id: string, @Req() req: MutationRequest) { return this.media.branding(id,mutationActor(req)); }
  @Put('merchant/stores/:id/branding/:kind') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiOkResponse({type:StoreBrandingDto}) @ApiParam({name:'kind',enum:BrandingKind})
  setBranding(@Param('id',ParseUUIDPipe) id: string, @Param('kind',new ParseEnumPipe(BrandingKind)) kind: BrandingKind, @Body() dto: ImageContentDto, @Req() req: MutationRequest) { return this.media.setBranding(id,kind,mutationActor(req),dto.content); }
  @Delete('merchant/stores/:id/branding/:kind') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiOkResponse({type:StoreBrandingDto}) @ApiParam({name:'kind',enum:BrandingKind})
  removeBranding(@Param('id',ParseUUIDPipe) id: string, @Param('kind',new ParseEnumPipe(BrandingKind)) kind: BrandingKind, @Req() req: MutationRequest) { return this.media.setBranding(id,kind,mutationActor(req)); }
  @Get('merchant/stores/:id/branding/:kind/:key') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiProduces('image/png') @ApiOkResponse({schema:{type:'string',format:'binary'}}) @ApiParam({name:'kind',enum:BrandingKind})
  async ownBrandImage(@Param('id',ParseUUIDPipe) id: string, @Param('kind',new ParseEnumPipe(BrandingKind)) kind: BrandingKind, @Param('key') key: string, @Req() req: MutationRequest, @Res() response: Response) { return png(response,await this.media.brandingBytes(id,kind,key,mutationActor(req))); }
  @Get('stores/:id/branding') @ApiOkResponse({type:StoreBrandingDto})
  publicBranding(@Param('id',ParseUUIDPipe) id: string) { return this.media.branding(id); }
  @Get('stores/:id/branding/:kind/:key') @ApiProduces('image/png') @ApiOkResponse({schema:{type:'string',format:'binary'}}) @ApiParam({name:'kind',enum:BrandingKind})
  async brandImage(@Param('id',ParseUUIDPipe) id: string, @Param('kind',new ParseEnumPipe(BrandingKind)) kind: BrandingKind, @Param('key') key: string, @Res() response: Response) { return png(response,await this.media.brandingBytes(id,kind,key)); }
}
