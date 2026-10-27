import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException, ErrorCode } from '../errors/error-codes';

/**
 * Validation errors become { code: "VALIDATION_ERROR", details: { fields: { email: ["isEmail"] } } }
 * The app can highlight fields by name; constraint names are stable, not English sentences.
 */
export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors: ValidationError[]) => {
      const fields: Record<string, string[]> = {};
      const walk = (list: ValidationError[], prefix = '') => {
        for (const e of list) {
          const path = prefix ? `${prefix}.${e.property}` : e.property;
          if (e.constraints) fields[path] = Object.keys(e.constraints);
          if (e.children?.length) walk(e.children, path);
        }
      };
      walk(errors);
      return new AppException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Invalid input', {
        fields,
      });
    },
  });
}
