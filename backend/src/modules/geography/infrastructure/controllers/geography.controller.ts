import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../../../platform/guards/auth.guard';
import { Roles, RolesGuard } from '../../../../platform/guards/roles.guard';
import { ListQueryDto } from '../../../../platform/http/list-query.dto';
import { MutationRequest, mutationActor } from '../../../platform/public';
import { GeographyService } from '../../application/geography.service';
import { AddressDto, CreateAddressDto, UpdateAddressDto, CreateZoneDto, UpdateZoneDto, ZoneDto, ZoneListDto } from '../dto/geography.dto';

@ApiTags('Direcciones y cobertura') @Controller('api/v1')
export class GeographyController {
  constructor(private readonly service: GeographyService) {}
  @Get('geography/zones') @ApiResponse({ status: 200, type: [ZoneDto] })
  zones() { return this.service.listActiveZones(); }
  @Get('me/addresses') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiResponse({ status: 200, type: [AddressDto] })
  addresses(@Req() req: MutationRequest) { return this.service.getUserAddresses(req.user.id); }
  @Post('me/addresses') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiResponse({ status: 201, type: AddressDto })
  create(@Req() req: MutationRequest, @Body() dto: CreateAddressDto) { return this.service.createAddress(mutationActor(req), dto); }
  @Patch('me/addresses/:id') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiResponse({ status: 200, type: AddressDto })
  update(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAddressDto) { return this.service.updateAddress(mutationActor(req), id, dto); }
  @Put('me/addresses/:id/default') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiResponse({ status: 200, type: AddressDto })
  default(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.setDefault(mutationActor(req), id); }
  @Delete('me/addresses/:id') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @HttpCode(204)
  remove(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.deleteAddress(mutationActor(req), id); }
}

@ApiTags('Administración de cobertura') @ApiCookieAuth('cookie') @UseGuards(AuthGuard, RolesGuard) @Roles('admin') @Controller('api/v1/admin/zones')
export class AdminZonesController {
  constructor(private readonly service: GeographyService) {}
  @Get() @ApiResponse({ status: 200, type: ZoneListDto })
  list(@Query() query: ListQueryDto) { return this.service.listZones(query); }
  @Post() @ApiResponse({ status: 201, type: ZoneDto })
  create(@Req() req: MutationRequest, @Body() dto: CreateZoneDto) { return this.service.saveZone(mutationActor(req), dto); }
  @Patch(':id') @ApiResponse({ status: 200, type: ZoneDto })
  update(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateZoneDto) { return this.service.saveZone(mutationActor(req), dto, id); }
}
