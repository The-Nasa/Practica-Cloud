import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../../../platform/guards/auth.guard';
import { MutationRequest, mutationActor } from '../../../platform/public';
import { GroupCheckoutService } from '../../application/group-checkout.service';
import { CreatePurchaseDto } from '../dto/ordering.dto';
import { GroupCheckoutDto, GroupQuoteDto } from '../dto/group-checkout.dto';

@Controller('api/v1')
@UseGuards(AuthGuard)
@ApiCookieAuth('cookie')
@ApiTags('Compra multitienda')
export class GroupCheckoutController {
  constructor(private readonly groups: GroupCheckoutService) {}
  @Post('checkout/groups/quote') @HttpCode(200) @ApiOkResponse({ type: GroupQuoteDto })
  quote(@Req() req: MutationRequest, @Body() dto: CreatePurchaseDto) { return this.groups.quote(req.user.id, dto); }
  @Post('checkout/groups') @ApiCreatedResponse({ type: GroupCheckoutDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  create(@Req() req: MutationRequest, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreatePurchaseDto) {
    return this.groups.create(mutationActor(req), key, dto);
  }
  @Get('me/checkout-groups/:id') @ApiOkResponse({ type: GroupCheckoutDto })
  detail(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string) { return this.groups.detail(req.user.id, id); }
  @Get('me/group-checkout-attempts/:key') @ApiOkResponse({ type: GroupCheckoutDto })
  attempt(@Req() req: MutationRequest, @Param('key', ParseUUIDPipe) key: string) { return this.groups.attempt(req.user.id, key); }
}
