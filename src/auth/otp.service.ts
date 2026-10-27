import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '../generated/prisma/client';
import { AppException, ErrorCode } from '../common/errors/error-codes';
import { generateNumericCode, safeEqualHex, sha256 } from '../common/utils/crypto.util';
import { num } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

/**
 * One-time codes sent by email (sign-up verification, password reset).
 * - Only the hash is stored.
 * - A new code invalidates older unused codes of the same purpose.
 * - Limited lifetime, limited attempts, and a resend cooldown.
 */
@Injectable()
export class OtpService {
  readonly length: number;
  readonly ttlMinutes: number;
  private readonly maxAttempts: number;
  private readonly cooldownSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.length = num(config.get('OTP_LENGTH'), 4);
    this.ttlMinutes = num(config.get('OTP_TTL_MINUTES'), 10);
    this.maxAttempts = num(config.get('OTP_MAX_ATTEMPTS'), 5);
    this.cooldownSeconds = num(config.get('OTP_RESEND_COOLDOWN_SECONDS'), 60);
  }

  /** Creates a code and returns it in plain text (to be emailed). */
  async create(userId: string, purpose: OtpPurpose, { enforceCooldown = true } = {}): Promise<string> {
    if (enforceCooldown) {
      const last = await this.prisma.otpCode.findFirst({
        where: { userId, purpose },
        orderBy: { createdAt: 'desc' },
      });
      if (last) {
        const waitSeconds = Math.ceil(this.cooldownSeconds - (Date.now() - last.createdAt.getTime()) / 1000);
        if (waitSeconds > 0) {
          throw new AppException(ErrorCode.OTP_RESEND_TOO_SOON, HttpStatus.TOO_MANY_REQUESTS, 'Please wait before requesting a new code', { retryAfterSeconds: waitSeconds });
        }
      }
    }

    const code = generateNumericCode(this.length);
    await this.prisma.$transaction([
      this.prisma.otpCode.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.otpCode.create({
        data: {
          userId,
          purpose,
          codeHash: sha256(code),
          expiresAt: new Date(Date.now() + this.ttlMinutes * 60_000),
        },
      }),
    ]);
    return code;
  }

  /**
   * Checks a code. Returns the OTP row id on success.
   * `consume: false` keeps the code usable once more (used by the reset flow, consumed at the final step).
   */
  async verify(userId: string, purpose: OtpPurpose, code: string, { consume = true } = {}): Promise<string> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { userId, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new AppException(ErrorCode.OTP_INVALID, HttpStatus.BAD_REQUEST, 'Invalid code');
    if (otp.expiresAt < new Date()) throw new AppException(ErrorCode.OTP_EXPIRED, HttpStatus.BAD_REQUEST, 'Code expired');
    if (otp.attempts >= this.maxAttempts) {
      throw new AppException(ErrorCode.OTP_TOO_MANY_ATTEMPTS, HttpStatus.TOO_MANY_REQUESTS, 'Too many attempts, request a new code');
    }

    if (!safeEqualHex(sha256(code), otp.codeHash)) {
      const attempts = otp.attempts + 1;
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts } });
      throw new AppException(ErrorCode.OTP_INVALID, HttpStatus.BAD_REQUEST, 'Invalid code', {
        attemptsLeft: Math.max(0, this.maxAttempts - attempts),
      });
    }

    if (consume) await this.consume(otp.id);
    return otp.id;
  }

  /** Marks a code used. Returns false if it was already used (protects against double submission). */
  async consume(otpId: string): Promise<boolean> {
    const res = await this.prisma.otpCode.updateMany({
      where: { id: otpId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return res.count === 1;
  }
}
