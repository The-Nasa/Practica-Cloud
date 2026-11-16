import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../../../platform/guards/auth.guard';
import { Roles, RolesGuard } from '../../../../platform/guards/roles.guard';
import { MutationRequest, mutationActor } from '../../../platform/public';
import { AdminUsersService } from '../../application/admin-users.service';
import { AdminOverviewDto, AdminUserListDto, AdminUserQueryDto, UserStatusDto } from '../dto/admin-users.dto';

@ApiTags('Administración de cuentas') @ApiCookieAuth('cookie') @UseGuards(AuthGuard, RolesGuard) @Roles('admin') @Controller('api/v1/admin')
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}
  @Get('overview') @ApiResponse({ status: 200, type: AdminOverviewDto }) overview() { return this.service.overview(); }
  @Get('users') @ApiResponse({ status: 200, type: AdminUserListDto }) list(@Query() query: AdminUserQueryDto) { return this.service.list(query); }
  @Patch('users/:id/status') @HttpCode(204)
  change(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UserStatusDto) { return this.service.changeStatus(mutationActor(req), id, dto); }
}
