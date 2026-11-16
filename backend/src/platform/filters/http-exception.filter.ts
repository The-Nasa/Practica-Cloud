import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

export interface ErrorResponseEnvelope {
  statusCode: number;
  error: string;
  code: string;
  message: string | string[];
  requestId: string;
  timestamp: string;
  path: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = (request.headers['x-request-id'] as string) || randomUUID();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message: string | string[] = 'Ha ocurrido un error interno en el servidor';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const obj = res as any;
        errorCode = obj.code || (status === 400 ? 'VALIDATION_ERROR' : HttpStatus[status] || 'HTTP_ERROR');
        message = obj.message || exception.message;
      } else {
        message = exception.message;
      }
    } else if (typeof exception === 'object' && exception !== null && 'type' in exception &&
      ['entity.too.large','entity.parse.failed'].includes(String(exception.type))) {
      status = exception.type === 'entity.too.large' ? 413 : 400;
      errorCode = exception.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON';
      message = exception.type === 'entity.too.large' ? 'El archivo o contenido excede el tamaño permitido' : 'El contenido JSON no es válido';
    } else if (typeof exception === 'object' && exception !== null && 'code' in exception) {
      // PostgreSQL Driver Errors
      const pgError = exception as any;
      switch (pgError.code) {
        case '23505': // Unique violation
          status = HttpStatus.CONFLICT;
          errorCode = 'RESOURCE_CONFLICT';
          message = 'El registro ya existe o viola una restricción de unicidad';
          break;
        case '23503': // Foreign key violation
          status = HttpStatus.BAD_REQUEST;
          errorCode = 'FOREIGN_KEY_VIOLATION';
          message = 'Referencia foránea inexistente o inválida';
          break;
        case '23514': // Check constraint violation
          status = HttpStatus.CONFLICT;
          errorCode = 'BUSINESS_RULE_VIOLATION';
          message = 'Operación rechazada por regla de integridad del negocio';
          break;
        case '22P02':
        case '23502':
        case '22003':
          status = HttpStatus.BAD_REQUEST;
          errorCode = 'INVALID_INPUT';
          message = 'Los datos enviados no tienen el formato o rango requerido';
          break;
        case '40001': // Serialization failure
        case '40P01': // Deadlock detected
          status = HttpStatus.CONFLICT;
          errorCode = 'CONCURRENT_CONFLICT_RETRYABLE';
          message = 'Conflicto de concurrencia temporal; por favor reintente';
          break;
        default:
          this.logger.error(JSON.stringify({ event: 'database_error', code: /^[A-Z0-9]{5}$/.test(String(pgError.code)) ? pgError.code : 'UNKNOWN', requestId }));
          break;
      }
    } else if (exception instanceof Error) {
      this.logger.error(JSON.stringify({event:'internal_error',requestId}));
    }

    const envelope: ErrorResponseEnvelope = {
      statusCode: status,
      error: HttpStatus[status] || 'Error',
      code: errorCode,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.setHeader('X-Request-Id', requestId);
    response.status(status).json(envelope);
  }
}
