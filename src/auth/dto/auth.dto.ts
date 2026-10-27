import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const digitsOnly = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value);

/** At least 8 characters with a letter and a number. */
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

export class RegisterDto {
  @ApiProperty({ example: 'Joe Samanta' })
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name: string;

  @ApiProperty({ example: 'joe@example.com' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: '+33' })
  @Transform(trim)
  @Matches(/^\+\d{1,4}$/)
  phoneCountryCode: string;

  @ApiProperty({ example: '612345678' })
  @Transform(digitsOnly)
  @Length(6, 15)
  phone: string;

  @ApiProperty({ example: 'Password123' })
  @IsString()
  @Matches(PASSWORD_RULE, { message: 'weakPassword' })
  password: string;

  @ApiPropertyOptional({ example: 'en', description: 'App language at sign-up; emails use it' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

export class EmailDto {
  @ApiProperty({ example: 'joe@example.com' })
  @Transform(lower)
  @IsEmail()
  email: string;
}

export class VerifyCodeDto extends EmailDto {
  @ApiProperty({ example: '1234' })
  @Matches(/^\d{4,8}$/)
  code: string;
}

export class ResendCodeDto extends EmailDto {
  @ApiProperty({ enum: ['EMAIL_VERIFICATION', 'PASSWORD_RESET'] })
  @IsIn(['EMAIL_VERIFICATION', 'PASSWORD_RESET'])
  purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
}

export class LoginDto extends EmailDto {
  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  refreshToken: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token returned by /auth/password/verify-code' })
  @IsString()
  resetToken: string;

  @ApiProperty({ example: 'NewPassword123' })
  @IsString()
  @Matches(PASSWORD_RULE, { message: 'weakPassword' })
  newPassword: string;
}
