import { ApiOkResponse } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ErrorResponseDto } from '../../../../platform/filters/error-response.dto';
import { readSessionToken, csrfForSession, SESSION_COOKIE_NAME, sessionCookieOptions } from '../../../../platform/security/web-session';
import { AuthGuard, AuthenticatedUser } from '../../../../platform/guards/auth.guard';
import { IdentityService } from '../../application/identity.service';
import {
  AuthResponseDto,
  GoogleAuthDto,
  LoginDto,
  RegisterDto,
  SendVerificationCodeDto,
  UserProfileDto,
  UpdateProfileDto,
} from '../dto/auth.dto';

interface SessionRequest extends Request { user: AuthenticatedUser; sessionId: string; sessionExpiresAt: Date }

@ApiTags('Autenticación e Identidad')
@ApiResponse({ status: 400, type: ErrorResponseDto })
@ApiResponse({ status: 401, type: ErrorResponseDto })
@ApiResponse({ status: 403, type: ErrorResponseDto })
@ApiResponse({ status: 409, type: ErrorResponseDto })
@ApiResponse({ status: 429, type: ErrorResponseDto })
@Controller('api/v1')
export class AuthController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('auth/verification-code/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar código de verificación de 6 dígitos al correo' })
  @ApiOkResponse({ schema: { type: 'object', required: ['success','message'], properties: { success: { type: 'boolean' }, message: { type: 'string' }, devCode: { type: 'string', description: 'Solo transporte de prueba explícito; nunca en producción' } } } })
  async sendVerificationCode(@Body() dto: SendVerificationCodeDto) {
    return this.identityService.sendVerificationCode(dto.email);
  }

  @Post('auth/register')
  @ApiOperation({ summary: 'Registrar nueva cuenta de cliente con validación de código' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponseDto> {
    const result = await this.identityService.register(dto, readSessionToken(req));
    res.cookie(SESSION_COOKIE_NAME, result.rawToken, { ...sessionCookieOptions(), expires: new Date(result.expiresAt) });
    return { user: result.user, token: result.rawToken, csrfToken: csrfForSession(result.rawToken), expiresAt: result.expiresAt };
  }

  @Post('auth/google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión o registrarse con Google' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async google(
    @Body() dto: GoogleAuthDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.identityService.googleLogin(dto, readSessionToken(req));
    res.cookie(SESSION_COOKIE_NAME, result.rawToken, { ...sessionCookieOptions(), expires: new Date(result.expiresAt) });
    return { user: result.user, token: result.rawToken, csrfToken: csrfForSession(result.rawToken), expiresAt: result.expiresAt };
  }

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión con correo y contraseña' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponseDto> {
    const result = await this.identityService.login(dto, readSessionToken(req));
    res.cookie(SESSION_COOKIE_NAME, result.rawToken, { ...sessionCookieOptions(), expires: new Date(result.expiresAt) });
    return { user: result.user, token: result.rawToken, csrfToken: csrfForSession(result.rawToken), expiresAt: result.expiresAt };
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  @ApiCookieAuth('cookie')
  @ApiOperation({ summary: 'Cerrar y revocar sesión actual' })
  async logout(@Req() req: SessionRequest, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.identityService.logout(req.sessionId);
    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
  }

  @Get('auth/session')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('cookie')
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiOperation({ summary: 'Restaurar sesión web y protección CSRF' })
  async session(@Req() req: SessionRequest): Promise<AuthResponseDto> {
    return { user: await this.identityService.getProfile(req.user.id), csrfToken: csrfForSession(readSessionToken(req)!),
      expiresAt: req.sessionExpiresAt.toISOString() };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('cookie')
  @ApiResponse({ status: 200, type: UserProfileDto })
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  async getProfile(@Req() req: { user: AuthenticatedUser }) {
    return this.identityService.getProfile(req.user.id);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('cookie')
  @ApiResponse({ status: 200, type: UserProfileDto })
  @ApiOperation({ summary: 'Actualizar datos propios sin modificar roles, estado o membresías' })
  async updateProfile(@Req() req: SessionRequest, @Body() dto: UpdateProfileDto): Promise<UserProfileDto> {
    return this.identityService.updateProfile(req.user.id, dto);
  }
}
