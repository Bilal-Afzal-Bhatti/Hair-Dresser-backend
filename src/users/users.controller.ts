import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AppException, ErrorCode } from '../common/errors/error-codes';
import { AVATAR_MAX_BYTES } from './avatar.storage';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

/** The part of an uploaded file we use (multer keeps it in memory). */
interface UploadedPhoto {
  buffer: Buffer;
  size: number;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.id);
  }

  /** Used by Settings, e.g. { "language": "de" } so emails follow the app language. */
  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user.id, dto);
  }

  /** Profile → Account → Change photo. Multipart field "file": JPEG, PNG or WebP, max 3 MB. */
  @Post('me/avatar')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0 } }))
  uploadAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file?: UploadedPhoto) {
    if (!file?.buffer?.length) {
      throw new AppException(ErrorCode.AVATAR_INVALID, HttpStatus.BAD_REQUEST, 'No photo received');
    }
    return this.users.setAvatar(user.id, file.buffer);
  }

  @Delete('me/avatar')
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.users.removeAvatar(user.id);
  }
}