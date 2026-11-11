import { Logger, Module } from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/clock';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { ConsoleTransport } from './console-transport';
import { MAIL_LIMITS, mailLimitsFromEnv, selectMailTransport } from './mail.config';
import {
  MAIL_BRAND,
  MAIL_PAUSE,
  MAIL_SECRETS,
  MAIL_TRANSPORT,
  type MailTransport,
  MESSAGE_BUILDER,
} from './mail.ports';
import { MailService } from './mail.service';
import { MailDispatchJob } from './mail-dispatch.job';
import { SmtpTransport } from './smtp-transport';

// Bộ dựng thư của `identity` ở PR 7c; tới lúc đó mới thay. Test luôn ghi đè bằng bản giả.
const notConfigured = (what: string) => async () => {
  throw new Error(`Chưa cấu hình ${what}`);
};

function transportFor(env: Env, clock: Clock): MailTransport | null {
  switch (selectMailTransport(env)) {
    case 'none':
      return null;
    case 'console':
      return new ConsoleTransport((text) => new Logger('Thư').log(text));
    case 'smtp': {
      // `loadEnv` đã bảo đảm đủ bốn biến SMTP khi có SMTP_HOST.
      const from = env.EMAIL_FROM as string;
      return new SmtpTransport(
        {
          host: env.SMTP_HOST as string,
          port: env.SMTP_PORT,
          username: env.SMTP_USERNAME as string,
          password: env.SMTP_PASSWORD as string,
          timeoutMs: env.SMTP_TIMEOUT_SECONDS * 1000,
          sender: {
            fromName: env.EMAIL_FROM_NAME,
            fromEmail: from,
            replyTo: env.EMAIL_REPLY_TO ?? from,
          },
        },
        () => clock.now(),
      );
    }
  }
}

@Module({
  providers: [
    MailService,
    MailDispatchJob,
    { provide: MAIL_LIMITS, inject: [ENV], useFactory: (env: Env) => mailLimitsFromEnv(env) },
    {
      provide: MAIL_SECRETS,
      inject: [ENV],
      useFactory: (env: Env) => (env.SMTP_PASSWORD ? [env.SMTP_PASSWORD] : []),
    },
    {
      provide: MAIL_BRAND,
      inject: [ENV],
      useFactory: (env: Env) => ({
        systemName: env.EMAIL_FROM_NAME,
        supportContact: env.EMAIL_SUPPORT_CONTACT,
      }),
    },
    { provide: MAIL_TRANSPORT, inject: [ENV, CLOCK], useFactory: transportFor },
    {
      provide: MAIL_PAUSE,
      useValue: (ms: number) => new Promise<void>((done) => setTimeout(done, ms)),
    },
    { provide: MESSAGE_BUILDER, useValue: { build: notConfigured('bộ dựng thư') } },
  ],
  exports: [MailService],
})
export class MailModule {}
