import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AuthResponseDto, UserProfileDto } from '../modules/identity/infrastructure/dto/auth.dto';
import { ErrorResponseDto } from './filters/error-response.dto';

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Quickly API').setVersion('1.1')
    .setDescription('Sesión web HttpOnly. Las mutaciones exigen Origin autorizado y X-CSRF-Token de /auth/session. Los contratos tipados de identidad se integran en F1; los demás módulos se completan por fases.')
    .addCookieAuth('quickly_session', { type: 'apiKey', in: 'cookie' }, 'cookie')
    .build();
  return SwaggerModule.createDocument(app, config, { extraModels: [AuthResponseDto, UserProfileDto, ErrorResponseDto] });
}
