import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../../../platform/guards/auth.guard';
import { Roles, RolesGuard } from '../../../../platform/guards/roles.guard';
import { ListQueryDto } from '../../../../platform/http/list-query.dto';
import { MutationRequest, mutationActor } from '../../../platform/public';
import { StoreManagementService } from '../../application/store-management.service';
import { CreateStoreDto, OperationalDecisionDto, OperationalListQueryDto, ReplaceHoursDto, SetStoreMemberDto, StoreCategoryDto, StoreDetailDto, StoreListDto, StoreMemberDto, UpdateStoreDto } from '../dto/merchant.dto';

@ApiTags('Gestión de comercios') @ApiCookieAuth('cookie') @UseGuards(AuthGuard) @Controller('api/v1/merchant')
export class StoreManagementController {
  constructor(private readonly service: StoreManagementService) {}
  @Get('categories') @ApiResponse({ status: 200, type: [StoreCategoryDto] })
  categories() { return this.service.categories(); }
  @Get('stores') @ApiResponse({ status: 200, type: StoreListDto })
  list(@Req() req: MutationRequest, @Query() query: ListQueryDto) { return this.service.listOwn(req.user.id, query); }
  @Post('stores') @ApiResponse({ status: 201, type: StoreDetailDto })
  create(@Req() req: MutationRequest, @Body() dto: CreateStoreDto) { return this.service.create(mutationActor(req), dto); }
  @Get('stores/:id') @ApiResponse({ status: 200, type: StoreDetailDto })
  detail(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.detail(req.user.id, id); }
  @Patch('stores/:id') @ApiResponse({ status: 200, type: StoreDetailDto })
  update(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStoreDto) { return this.service.update(mutationActor(req), id, dto); }
  @Put('stores/:id/hours') @ApiResponse({ status: 200, type: StoreDetailDto })
  hours(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceHoursDto) { return this.service.replaceHours(mutationActor(req), id, dto); }
  @Get('stores/:id/members') @ApiResponse({ status: 200, type: [StoreMemberDto] })
  members(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.members(mutationActor(req), id); }
  @Put('stores/:id/members') @HttpCode(204)
  setMember(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetStoreMemberDto) { return this.service.setMember(mutationActor(req), id, dto); }
  @Delete('stores/:id/members/:userId') @HttpCode(204)
  revoke(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) { return this.service.revokeMember(mutationActor(req), id, userId); }
}

@ApiTags('Administración de comercios') @ApiCookieAuth('cookie') @UseGuards(AuthGuard, RolesGuard) @Roles('admin') @Controller('api/v1/admin/stores')
export class AdminStoresController {
  constructor(private readonly service: StoreManagementService) {}
  @Get() @ApiResponse({ status: 200, type: StoreListDto })
  list(@Req() req: MutationRequest, @Query() query: OperationalListQueryDto) { return this.service.listAdmin(req.user.id, query); }
  @Get(':id') @ApiResponse({ status: 200, type: StoreDetailDto })
  detail(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.detail(req.user.id, id); }
  @Post(':id/decisions') @ApiResponse({ status: 201, type: StoreDetailDto })
  decide(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OperationalDecisionDto) { return this.service.decide(mutationActor(req), id, dto); }
  @Post(':id/approve') @ApiResponse({ status: 201, type: StoreDetailDto })
  approve(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.decide(mutationActor(req), id, { decision: 'approve', reason: 'Solicitud aprobada por administración' }); }
}
