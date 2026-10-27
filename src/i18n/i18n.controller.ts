import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { I18nService } from './i18n.service';

@ApiTags('languages')
@Controller('languages')
export class I18nController {
  constructor(private readonly i18n: I18nService) {}

  /** Languages the server can send emails/notifications in. */
  @Public()
  @Get()
  list() {
    return { default: this.i18n.defaultLanguage, languages: this.i18n.listLanguages() };
  }
}
