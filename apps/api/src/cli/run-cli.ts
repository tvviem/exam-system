import { NestFactory } from '@nestjs/core';
import type { Clock } from '../common/clock';
import {
  AdminAccountError,
  AdminAccountsService,
} from '../modules/identity/admin-accounts.service';
import { MailService } from '../modules/mail/mail.service';
import { CliModule } from './cli.module';

export interface CliResult {
  exitCode: number;
  output: string;
}

type CliEnv = Record<string, string | undefined>;

const USAGE = `Cách dùng: pnpm cli <lệnh>
  bootstrap-admin                 Tạo Quản trị viên đầu tiên từ biến BOOTSTRAP_ADMIN_*
  recover-admin --username <tên>  Khôi phục một tài khoản Quản trị viên
  mail-test <địa chỉ email>       Gửi thư thử để kiểm cấu hình gửi thư (SMTP_*)`;

/** Chạy một lệnh CLI. `env` chứa tham số của lệnh; kết nối DB và Redis lấy từ process.env. */
export async function runCli(
  argv: string[],
  env: CliEnv,
  options: { clock?: Clock } = {},
): Promise<CliResult> {
  const lines: string[] = [];
  const print = (line: string) => lines.push(line);
  const [command] = argv;

  if (command !== 'bootstrap-admin' && command !== 'recover-admin' && command !== 'mail-test') {
    print(USAGE);
    return { exitCode: command ? 1 : 0, output: lines.join('\n') };
  }

  const app = await NestFactory.createApplicationContext(CliModule.create(options.clock), {
    logger: false,
  });
  try {
    if (command === 'mail-test') return await mailTest(app.get(MailService), argv[1]);
    const accounts = app.get(AdminAccountsService);
    if (command === 'bootstrap-admin') {
      const input = requireVars(env, [
        'BOOTSTRAP_ADMIN_USERNAME',
        'BOOTSTRAP_ADMIN_FULL_NAME',
        'BOOTSTRAP_ADMIN_PASSWORD',
      ]);
      await accounts.bootstrapAdmin({
        username: input.BOOTSTRAP_ADMIN_USERNAME,
        email: env.BOOTSTRAP_ADMIN_EMAIL || null,
        fullName: input.BOOTSTRAP_ADMIN_FULL_NAME,
        password: input.BOOTSTRAP_ADMIN_PASSWORD,
      });
      print(
        `Đã tạo Quản trị viên "${input.BOOTSTRAP_ADMIN_USERNAME}". Đổi mật khẩu ở lần đăng nhập đầu tiên.`,
      );
    } else {
      const username = optionValue(argv, '--username');
      if (!username) throw new AdminAccountError('Thiếu tham số --username <tên đăng nhập>.');
      const { temporaryPassword } = await accounts.recoverAdmin(username);
      print(`Đã khôi phục Quản trị viên "${username}" và thu hồi mọi phiên đăng nhập.`);
      print(`Mật khẩu tạm: ${temporaryPassword}`);
      print('Mật khẩu tạm chỉ hiển thị một lần, hết hạn sau 7 ngày và phải đổi khi đăng nhập.');
    }
    return { exitCode: 0, output: lines.join('\n') };
  } catch (error) {
    if (error instanceof AdminAccountError) {
      print(error.message);
      return { exitCode: 1, output: lines.join('\n') };
    }
    throw error;
  } finally {
    await app.close();
  }
}

function requireVars<K extends string>(env: CliEnv, names: K[]): Record<K, string> {
  const missing = names.filter((name) => !env[name]);
  if (missing.length > 0)
    throw new AdminAccountError(`Thiếu biến môi trường: ${missing.join(', ')}`);
  return Object.fromEntries(names.map((name) => [name, env[name]])) as Record<K, string>;
}

function optionValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function mailTest(mail: MailService, address: string | undefined): Promise<CliResult> {
  if (!address) return { exitCode: 1, output: 'Cách dùng: pnpm cli mail-test <địa chỉ email>' };
  const result = await mail.sendTest(address);
  switch (result.status) {
    case 'sent':
      return {
        exitCode: 0,
        output: [
          `Đã gửi thư thử tới ${address}.`,
          'Hãy kiểm hộp thư (cả Spam), mở "Hiện thư gốc" để xem SPF, DKIM, DMARC đều PASS.',
        ].join('\n'),
      };
    case 'not_configured':
      return {
        exitCode: 1,
        output:
          'Chưa cấu hình gửi thư: đặt SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, EMAIL_FROM trong api.env.',
      };
    case 'invalid_address':
      return { exitCode: 1, output: `Địa chỉ email không hợp lệ: ${address}` };
    case 'failed':
      return { exitCode: 1, output: `Gửi thư thử thất bại (${result.kind}): ${result.message}` };
  }
}
