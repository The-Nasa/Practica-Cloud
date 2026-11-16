import { ApiResponse } from '@nestjs/swagger';
import { legacyNotificationsResponse } from '../../../../platform/http/operation-response.schemas';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Req,
  UseGuards,
  ParseUUIDPipe,Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags,ApiOkResponse } from '@nestjs/swagger';
import {ListQueryDto} from '../../../../platform/http/list-query.dto';
import {NotificationPage} from '../notification.dto';
import { AuthGuard, AuthenticatedUser } from '../../../../platform/guards/auth.guard';
import { PlatformService } from '../../application/platform.service';

@ApiTags('Plataforma y Notificaciones')
@Controller('api/v1')
@UseGuards(AuthGuard)
@ApiCookieAuth('cookie')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('me/notifications') @ApiOkResponse({type:NotificationPage})
  page(@Req() req:{user:AuthenticatedUser},@Query() q:ListQueryDto){return this.platformService.notificationPage(req.user.id,q);}
  @Patch('me/notifications/read-all') @HttpCode(204)
  readAll(@Req() req:{user:AuthenticatedUser}){return this.platformService.readOwn(req.user.id);}
  @Patch('me/notifications/:id/read') @HttpCode(204)
  read(@Req() req:{user:AuthenticatedUser},@Param('id',ParseUUIDPipe) id:string){return this.platformService.readOwn(req.user.id,id);}

  @Get('notifications')
  @ApiOperation({ summary: 'Obtener notificaciones del usuario autenticado' })
  @ApiResponse({ status: 200, schema: legacyNotificationsResponse })
  async getNotifications(@Req() req: { user: AuthenticatedUser }) {
    return this.platformService.getUserNotifications(req.user.id);
  }

  @Patch('notifications/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Marcar notificación como leída' })
  async markAsRead(
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
  ) {
    await this.platformService.markNotificationRead(id, req.user.id);
  }
}
