import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AppException, ErrorCode } from '../common/errors/error-codes';
import { hashPassword, verifyPassword } from '../common/utils/crypto.util';
import { I18nService } from '../i18n/i18n.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicUser } from '../users/user.mapper';
import { LoginDto, RegisterDto, ResendCodeDto, ResetPasswordDto, VerifyCodeDto } from './dto/auth.dto';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = 'scrypt$00000000000000000000000000000000$' + '0'.repeat(128);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Creates the account (unverified) and emails a code.
   * Re-registering with an email that was never verified updates the details and sends a new code.
   */
  async register(dto: RegisterDto, requestLang: string) {
    const language = this.i18n.isSupported(dto.language) ? dto.language : requestLang;
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing?.emailVerifiedAt) {
      throw new AppException(ErrorCode.EMAIL_ALREADY_EXISTS, HttpStatus.CONFLICT, 'Email already registered');
    }

    const phoneOwner = await this.prisma.user.findUnique({
      where: { phoneCountryCode_phone: { phoneCountryCode: dto.phoneCountryCode, phone: dto.phone } },
    });
    if (phoneOwner && phoneOwner.id !== existing?.id) {
      throw new AppException(ErrorCode.PHONE_ALREADY_EXISTS, HttpStatus.CONFLICT, 'Phone already registered');
    }

    const data = {
      name: dto.name,
      phoneCountryCode: dto.phoneCountryCode,
      phone: dto.phone,
      passwordHash: await hashPassword(dto.password),
      language,
    };

    let user;
    try {
      user = existing
        ? await this.prisma.user.update({ where: { id: existing.id }, data })
        : await this.prisma.user.create({ data: { ...data, email: dto.email } });
    } catch (e) {
      // Two sign-ups racing for the same email/phone
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new AppException(ErrorCode.EMAIL_ALREADY_EXISTS, HttpStatus.CONFLICT, 'Email or phone already registered');
      }
      throw e;
    }

    await this.sendCode(user, 'EMAIL_VERIFICATION', { enforceCooldown: !!existing });
    return { email: user.email, codeLength: this.otp.length, expiresInMinutes: this.otp.ttlMinutes };
  }

  /** Confirms the email with the code, then logs the user in. */
  async verifyEmail(dto: VerifyCodeDto, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new AppException(ErrorCode.OTP_INVALID, HttpStatus.BAD_REQUEST, 'Invalid code');
    if (user.emailVerifiedAt) {
      throw new AppException(ErrorCode.EMAIL_ALREADY_VERIFIED, HttpStatus.CONFLICT, 'Email already verified, please log in');
    }

    await this.otp.verify(user.id, 'EMAIL_VERIFICATION', dto.code);
    const verified = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
    return { user: toPublicUser(verified), tokens: await this.tokens.issue(verified, userAgent) };
  }

  async resendCode(dto: ResendCodeDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Same response whether or not the account exists, so emails can't be probed.
    if (user) {
      if (dto.purpose === 'EMAIL_VERIFICATION' && user.emailVerifiedAt) {
        throw new AppException(ErrorCode.EMAIL_ALREADY_VERIFIED, HttpStatus.CONFLICT, 'Email already verified, please log in');
      }
      await this.sendCode(user, dto.purpose);
    }
    return { sent: true, codeLength: this.otp.length, expiresInMinutes: this.otp.ttlMinutes };
  }

  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const ok = await verifyPassword(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      throw new AppException(ErrorCode.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED, 'Wrong email or password');
    }

    if (!user.emailVerifiedAt) {
      // Send a fresh code so the app can go straight to the code screen.
      await this.sendCode(user, 'EMAIL_VERIFICATION').catch(() => undefined);
      throw new AppException(ErrorCode.EMAIL_NOT_VERIFIED, HttpStatus.FORBIDDEN, 'Please verify your email', {
        email: user.email,
      });
    }

    return { user: toPublicUser(user), tokens: await this.tokens.issue(user, userAgent) };
  }

  async refresh(refreshToken: string, userAgent?: string) {
    const { userId, ...tokens } = await this.tokens.rotate(refreshToken, userAgent);
    return { tokens, userId };
  }

  async logout(refreshToken: string) {
    await this.tokens.revoke(refreshToken);
    return { success: true };
  }

  /** Step 1 of password reset. Always answers the same way (no account probing). */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) await this.sendCode(user, 'PASSWORD_RESET');
    return { sent: true, codeLength: this.otp.length, expiresInMinutes: this.otp.ttlMinutes };
  }

  /** Step 2: checks the code and returns a short-lived reset token. */
  async verifyResetCode(dto: VerifyCodeDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new AppException(ErrorCode.OTP_INVALID, HttpStatus.BAD_REQUEST, 'Invalid code');
    const otpId = await this.otp.verify(user.id, 'PASSWORD_RESET', dto.code, { consume: false });
    return { resetToken: await this.tokens.signResetToken(user.id, otpId) };
  }

  /** Step 3: sets the new password and signs out every device. */
  async resetPassword(dto: ResetPasswordDto) {
    const { userId, otpId } = await this.tokens.verifyResetToken(dto.resetToken);
    const fresh = await this.otp.consume(otpId);
    if (!fresh) throw new AppException(ErrorCode.RESET_TOKEN_INVALID, HttpStatus.BAD_REQUEST, 'Reset link already used');

    await this.prisma.user.update({
      where: { id: userId },
      // Proving access to the inbox also proves the email.
      data: { passwordHash: await hashPassword(dto.newPassword), emailVerifiedAt: new Date() },
    });
    await this.tokens.revokeAll(userId);
    return { success: true };
  }

  private async sendCode(
    user: { id: string; email: string; name: string; language: string },
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
    opts?: { enforceCooldown?: boolean },
  ) {
    const code = await this.otp.create(user.id, purpose, opts);
    await this.mail.sendCode({
      to: user.email,
      name: user.name,
      lang: this.i18n.isSupported(user.language) ? user.language : this.i18n.defaultLanguage,
      kind: purpose === 'EMAIL_VERIFICATION' ? 'verify' : 'reset',
      code,
      minutes: this.otp.ttlMinutes,
    });
  }
}
