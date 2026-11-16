import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, IsOptional, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty({ message: 'El nombre completo es obligatorio' })
  @Length(3, 120)
  fullName: string;

  @ApiProperty({ example: 'juan.perez@example.com' })
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string;

  @ApiProperty({ example: '+51962123456', description: 'Número en formato E.164 (+51...)' })
  @Matches(/^\+[1-9][0-9]{7,14}$/, { message: 'El teléfono debe tener formato internacional E.164 (+51999999999)' })
  phone: string;

  @ApiProperty({ example: 'Password123!', minLength: 6 })
  @IsString()
  @Length(6, 100, { message: 'La contraseña debe tener entre 6 y 100 caracteres' })
  password: string;

  @ApiPropertyOptional({ example: '123456', description: 'Código de verificación de 6 dígitos enviado al correo' })
  @IsOptional()
  @IsString()
  @Length(6, 6, { message: 'El código de verificación debe tener 6 dígitos' })
  verificationCode?: string;
}

export class SendVerificationCodeDto {
  @ApiProperty({ example: 'juan.perez@example.com' })
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string;
}

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID Token (credential JWT)' })
  @IsString()
  @IsNotEmpty({ message: 'El token de Google es obligatorio' })
  idToken: string;

  @ApiPropertyOptional({ example: '+51962123456', description: 'Teléfono opcional si el usuario es nuevo' })
  @IsOptional()
  @Matches(/^\+[1-9][0-9]{7,14}$/, { message: 'El teléfono debe tener formato internacional (+51999999999)' })
  phone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'juan.perez@example.com' })
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  password: string;
}

export class MembershipDto {
  @ApiProperty({ format: 'uuid' }) storeId: string;
  @ApiProperty() storeName: string;
  @ApiProperty({ enum: ['pending', 'active', 'rejected', 'suspended'] }) storeStatus: string;
  @ApiProperty({ enum: ['owner', 'manager', 'operator'] }) membershipRole: string;
}

export class UserProfileDto {
  @ApiProperty({ format: 'uuid' }) id: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ type: [String], enum: ['customer', 'merchant', 'courier', 'admin'], isArray: true })
  roles: string[];

  @ApiProperty({ enum: ['active', 'pending', 'suspended'] }) status: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: [MembershipDto] }) memberships: MembershipDto[];
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) courierId: string | null;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserProfileDto }) user: UserProfileDto;
  @ApiProperty({ description: 'Protección CSRF; conservar solo en memoria' }) csrfToken: string;
  @ApiPropertyOptional({ description: 'Token de sesión Bearer para clientes móviles y cross-origin' }) token?: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Transform(trim) @Length(3, 120)
  fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\+[1-9][0-9]{7,14}$/)
  phone?: string;
}
