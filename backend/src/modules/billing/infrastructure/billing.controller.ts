import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../../platform/guards/auth.guard';
import { ListQueryDto } from '../../../platform/http/list-query.dto';
import { MutationRequest } from '../../platform/public';
import { BillingQueryService } from '../application/billing-query.service';
import { PaymentHistoryDto, PaymentMethodDto } from './billing.dto';

@ApiTags('Pagos')
@Controller('api/v1')
export class BillingQueryController {
  constructor(private readonly billing: BillingQueryService) {}

  @Get('payment-methods')
  @ApiOkResponse({ type: [PaymentMethodDto] })
  methods() { return this.billing.methods(); }

  @Get('me/purchases/:id/payments')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('cookie')
  @ApiOkResponse({ type: PaymentHistoryDto })
  own(@Req() req: MutationRequest, @Param('id', ParseUUIDPipe) id: string, @Query() query: ListQueryDto) {
    return this.billing.ownPayments(req.user.id, id, query);
  }
}
