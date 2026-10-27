import { Module } from '@nestjs/common';
import { AvatarStorage } from './avatar.storage';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AvatarStorage],
  exports: [UsersService],
})
export class UsersModule {}