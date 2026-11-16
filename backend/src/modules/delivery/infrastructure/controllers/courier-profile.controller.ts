import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../../../platform/guards/auth.guard';
import { Roles, RolesGuard } from '../../../../platform/guards/roles.guard';
import { OperationalDecisionDto, OperationalListQueryDto } from '../../../../platform/http/operational.dto';
import { MutationRequest, mutationActor } from '../../../platform/public';
import { CourierProfileService } from '../../application/courier-profile.service';
import { ApplyCourierDto, CourierAvailabilityDto, CourierListDto, CourierProfileDto } from '../dto/courier-profile.dto';

@ApiTags('Perfil operativo de reparto') @ApiCookieAuth('cookie') @UseGuards(AuthGuard) @Controller('api/v1/courier/profile')
export class CourierProfileController {
  constructor(private readonly service: CourierProfileService) {}
  @Get() @ApiResponse({ status: 200, type: CourierProfileDto })
  own(@Req() req: MutationRequest) { return this.service.own(req.user.id); }
  @Put() @ApiResponse({ status: 200, type: CourierProfileDto })
  apply(@Req() req: MutationRequest, @Body() dto: ApplyCourierDto) { return this.service.apply(mutationActor(req), dto); }
  @Patch('availability') @ApiResponse({ status: 200, type: CourierProfileDto })
  availability(@Req() req: MutationRequest, @Body() dto: CourierAvailabilityDto) { return this.service.availability(mutationActor(req), dto.isOnline); }
}

@ApiTags('Administración de reparto') @ApiCookieAuth('cookie') @UseGuards(AuthGuard, RolesGuard) @Roles('admin') @Controller('api/v1/admin/couriers')
export class AdminCouriersController {
  constructor(private readonly service: CourierProfileService) {}
  @Get() @ApiResponse({ status: 200, type: CourierListDto })
  list(@Query() query: OperationalListQueryDto) { return this.service.list(query); }
  @Get(':id') @ApiResponse({ status: 200, type: CourierProfileDto })
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.service.own(id); }
  @Post(':id/decisions') @ApiResponse({ status: 201, type: CourierProfileDto })
  decide(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: OperationalDecisionDto) { return this.service.decide(mutationActor(req), id, dto); }
}
