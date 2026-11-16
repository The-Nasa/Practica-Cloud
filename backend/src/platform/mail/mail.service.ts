import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const port = Number(this.config.get<number>('SMTP_PORT', 587));

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`Servicio de correo SMTP configurado con éxito (${host}:${port})`);
    } else {
      this.logger.warn('Servicio SMTP no configurado en .env (SMTP_HOST, SMTP_USER, SMTP_PASS). Los códigos de verificación se mostrarán en los logs del servidor.');
    }
  }

  async sendVerificationCode(to: string, code: string): Promise<boolean> {
    const from = this.config.get<string>('SMTP_FROM', 'Quickly Delivery <no-reply@quickly.pe>');
    const subject = `Código de verificación Quickly: ${code}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #059669; font-size: 26px; margin: 0; font-weight: bold; letter-spacing: -0.5px;">Quickly Delivery</h1>
          <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Pide y recibe en Tingo María</p>
        </div>
        <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <p style="color: #166534; font-size: 15px; margin: 0 0 12px 0;">Tu código de verificación para crear tu cuenta es:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #047857; padding: 8px 16px; background: #ffffff; display: inline-block; border-radius: 8px; border: 2px dashed #059669;">
            ${code}
          </div>
          <p style="color: #4b5563; font-size: 13px; margin-top: 12px; margin-bottom: 0;">Válido durante 15 minutos.</p>
        </div>
        <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin: 0;">
          Si tú no solicitaste este código, puedes ignorar este mensaje de forma segura. Nadie puede acceder a tu cuenta sin él.
        </p>
        <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0 16px 0;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
          &copy; ${new Date().getFullYear()} Quickly Delivery - Tingo María, Perú
        </p>
      </div>
    `;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to,
          subject,
          text: `Tu código de verificación de Quickly es: ${code}. Válido por 15 minutos.`,
          html,
        });
        this.logger.log(`Correo de verificación enviado a ${to}`);
        return true;
      } catch (error: any) {
        this.logger.error(`Error enviando correo SMTP a ${to}: ${error.message}`);
      }
    }

    // Fallback log for development
    this.logger.log(`\n======================================================\n📨 [CÓDIGO DE VERIFICACIÓN QUICKLY]\nDestinatario: ${to}\nCódigo:       ${code}\n======================================================\n`);
    return true;
  }
}
