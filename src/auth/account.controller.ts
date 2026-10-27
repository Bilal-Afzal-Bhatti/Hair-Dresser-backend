import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AppException, ErrorCode } from '../common/errors/error-codes';
import { hashPassword, verifyPassword } from '../common/utils/crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from '../users/dto/update-me.dto';
import { TokenService } from './token.service';

/** Profile → Security: change password while logged in. */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me')
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /** Signs out every other device and returns fresh tokens for this one. */
  @Post('password')
  @HttpCode(200)
  async changePassword(@CurrentUser() me: AuthUser, @Body() dto: ChangePasswordDto, @Headers('user-agent') ua?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: me.id } });
    if (!user) throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED, 'Account no longer exists');
    if (!(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new AppException(ErrorCode.WRONG_PASSWORD, HttpStatus.BAD_REQUEST, 'Current password is wrong');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(dto.newPassword) } });
    await this.tokens.revokeAll(user.id);
    return { tokens: await this.tokens.issue(user, ua) };
  }
}
