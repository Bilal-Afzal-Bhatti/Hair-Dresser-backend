import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Lang } from '../common/decorators/lang.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import {
  EmailDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResendCodeDto,
  ResetPasswordDto,
  VerifyCodeDto,
} from './dto/auth.dto';

/** Stricter rate limit for endpoints that send emails or check secrets. */
const SENSITIVE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle(SENSITIVE)
  register(@Body() dto: RegisterDto, @Lang() lang: string) {
    return this.auth.register(dto, lang);
  }

  @Post('verify-email')
  @HttpCode(200)
  @Throttle(SENSITIVE)
  verifyEmail(@Body() dto: VerifyCodeDto, @Headers('user-agent') ua?: string) {
    return this.auth.verifyEmail(dto, ua);
  }

  @Post('resend-code')
  @HttpCode(200)
  @Throttle(SENSITIVE)
  resendCode(@Body() dto: ResendCodeDto) {
    return this.auth.resendCode(dto);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Headers('user-agent') ua?: string) {
    return this.auth.login(dto, ua);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Headers('user-agent') ua?: string) {
    return this.auth.refresh(dto.refreshToken, ua);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Post('password/forgot')
  @HttpCode(200)
  @Throttle(SENSITIVE)
  forgotPassword(@Body() dto: EmailDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('password/verify-code')
  @HttpCode(200)
  @Throttle(SENSITIVE)
  verifyResetCode(@Body() dto: VerifyCodeDto) {
    return this.auth.verifyResetCode(dto);
  }

  @Post('password/reset')
  @HttpCode(200)
  @Throttle(SENSITIVE)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }
}
