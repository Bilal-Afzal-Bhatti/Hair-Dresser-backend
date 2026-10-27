import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppException, ErrorCode } from '../common/errors/error-codes';
import { generateOpaqueToken, sha256 } from '../common/utils/crypto.util';
import { num } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds, so the app can refresh just before expiry. */
  expiresIn: number;
}

/**
 * Access token: short-lived JWT.
 * Refresh token: random opaque string, stored hashed in `sessions`, rotated on every refresh.
 */
@Injectable()
export class TokenService {
  private readonly refreshDays: number;
  private readonly accessTtl: string;
  private readonly resetSecret: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.refreshDays = num(config.get('REFRESH_TOKEN_TTL_DAYS'), 30);
    this.accessTtl = config.get('JWT_ACCESS_TTL') ?? '15m';
    this.resetSecret = config.getOrThrow('JWT_RESET_SECRET');
  }

  async issue(user: { id: string; role: string }, userAgent?: string): Promise<TokenPair> {
    const refreshToken = generateOpaqueToken();
    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        userAgent: userAgent?.slice(0, 255),
        expiresAt: new Date(Date.now() + this.refreshDays * 86_400_000),
      },
    });
    return { accessToken: await this.signAccess(user), refreshToken, expiresIn: this.ttlSeconds() };
  }

  async rotate(refreshToken: string, userAgent?: string): Promise<TokenPair & { userId: string }> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { select: { id: true, role: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      // A revoked token being reused can mean it was stolen: end all of that user's sessions.
      if (session?.revokedAt) await this.revokeAll(session.userId);
      throw new AppException(ErrorCode.REFRESH_TOKEN_INVALID, HttpStatus.UNAUTHORIZED, 'Invalid refresh token');
    }
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const pair = await this.issue(session.user, userAgent);
    return { ...pair, userId: session.user.id };
  }

  async revoke(refreshToken: string) {
    await this.prisma.session.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAll(userId: string) {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Short-lived token proving the user passed the password-reset code step. */
  signResetToken(userId: string, otpId: string) {
    return this.jwt.signAsync({ sub: userId, otp: otpId, typ: 'reset' }, { secret: this.resetSecret, expiresIn: '15m' });
  }

  async verifyResetToken(token: string): Promise<{ userId: string; otpId: string }> {
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; otp: string; typ: string }>(token, { secret: this.resetSecret });
      if (p.typ !== 'reset') throw new Error();
      return { userId: p.sub, otpId: p.otp };
    } catch {
      throw new AppException(ErrorCode.RESET_TOKEN_INVALID, HttpStatus.BAD_REQUEST, 'Reset link expired, start again');
    }
  }

  private signAccess(user: { id: string; role: string }) {
    return this.jwt.signAsync({ sub: user.id, role: user.role, typ: 'access' }, { expiresIn: this.accessTtl as any });
  }

  private ttlSeconds(): number {
    const m = /^(\d+)([smhd])$/.exec(this.accessTtl);
    if (!m) return 900;
    return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
  }
}
