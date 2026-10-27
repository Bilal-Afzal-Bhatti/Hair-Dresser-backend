import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { I18nService } from '../i18n/i18n.service';

/**
 * Sends transactional emails in the user's language.
 * Without SMTP_HOST (development) the email is printed to the console instead.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;
  private readonly from: string;

  constructor(
    config: ConfigService,
    private readonly i18n: I18nService,
  ) {
   this.from = config.get('MAIL_FROM') ?? 'MT <no-reply@mt-salon.com>';
    const host = config.get<string>('SMTP_HOST');
    if (host) {
      const port = Number(config.get('SMTP_PORT') ?? 587);
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASS') },
      });
    }
  }

  async sendCode(opts: {
    to: string;
    name: string;
    lang: string;
    kind: 'verify' | 'reset';
    code: string;
    minutes: number;
  }) {
    const { to, name, lang, kind, code, minutes } = opts;
    const subject = this.i18n.t(lang, `email.${kind}.subject`);
    const lines = [
      this.i18n.t(lang, 'email.greeting', { name }),
      '',
      this.i18n.t(lang, `email.${kind}.body`, { code, minutes }),
      '',
      this.i18n.t(lang, 'email.footer'),
    ];
    const text = lines.join('\n');
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1c1b29">
      <p>${this.escape(lines[0])}</p>
      <p>${this.escape(lines[2])}</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#6C4CF1">${code}</p>
      <p style="color:#8a8a99;font-size:13px">${this.escape(lines[4])}</p></div>`;

    if (!this.transporter) {
      this.logger.warn(`[DEV EMAIL] to=${to} lang=${lang} subject="${subject}" CODE=${code}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text, html });
  }

  private escape(s: string) {
    return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }
}
