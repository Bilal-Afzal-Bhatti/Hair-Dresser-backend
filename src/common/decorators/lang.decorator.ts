import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Resolved request language (set in main.ts from the Accept-Language header).
 * Always one of the supported languages, falling back to the default.
 */
export const Lang = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest().lang,
);
