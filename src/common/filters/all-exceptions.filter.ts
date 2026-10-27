import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { ErrorCode } from '../errors/error-codes';

/**
 * Single error shape for the whole API:
 * { statusCode, code, message, details? }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL_ERROR;
    let message = 'Something went wrong';
    let details: unknown;

    if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = ErrorCode.TOO_MANY_REQUESTS;
      message = 'Too many requests, slow down';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;
      if (body && typeof body === 'object' && body.code) {
        code = body.code;
        message = body.message ?? body.code;
        details = body.details;
      } else {
        code = this.codeForStatus(status);
        message = typeof body === 'string' ? body : (body?.message ?? exception.message);
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({ statusCode: status, code, message, ...(details ? { details } : {}) });
  }

  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case 400:
        return ErrorCode.VALIDATION_ERROR;
      case 401:
        return ErrorCode.UNAUTHORIZED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 429:
        return ErrorCode.TOO_MANY_REQUESTS;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 413:
        return ErrorCode.FILE_TOO_LARGE;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
