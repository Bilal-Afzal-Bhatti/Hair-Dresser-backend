import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AppException, ErrorCode } from '../common/errors/error-codes';
import { I18nService } from '../i18n/i18n.service';
import { PrismaService } from '../prisma/prisma.service';
import { AvatarStorage } from './avatar.storage';
import { UpdateMeDto } from './dto/update-me.dto';
import { toPublicUser } from './user.mapper';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly avatars: AvatarStorage,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED, 'Account no longer exists');
    return toPublicUser(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    if (dto.language !== undefined && !this.i18n.isSupported(dto.language)) {
      throw new AppException(ErrorCode.LANGUAGE_NOT_SUPPORTED, HttpStatus.BAD_REQUEST, 'Language not supported', {
        supported: this.i18n.supportedLanguages,
      });
    }
    try {
      const user = await this.prisma.user.update({ where: { id: userId }, data: dto });
      return toPublicUser(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new AppException(ErrorCode.PHONE_ALREADY_EXISTS, HttpStatus.CONFLICT, 'Phone already registered');
      }
      throw e;
    }
  }

  /** Saves the new photo, then deletes the old one. */
  async setAvatar(userId: string, data: Buffer) {
    const before = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    const url = await this.avatars.save(data);
    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: url } });
    await this.avatars.remove(before?.avatarUrl);
    return toPublicUser(user);
  }

  async removeAvatar(userId: string) {
    const before = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    const user = await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
    await this.avatars.remove(before?.avatarUrl);
    return toPublicUser(user);
  }
}