import net from 'node:net';
import { type ParsedMail, simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import { afterEach, describe, expect, it } from 'vitest';
import { MailSendError } from './mail.ports';
import { SmtpTransport } from './smtp-transport';

// Lát 10 (S4): bộ vận chuyển SMTP thật nói chuyện với một máy chủ SMTP giả chạy cục bộ (cổng ngẫu nhiên).

const USER = 'gui@example.org';
const PASSWORD = 'mat-khau-ung-dung';
const MAIL = {
  to: 'nhan@example.com',
  subject: 'Kích hoạt tài khoản Hệ thống kiểm tra đánh giá',
  text: 'Chào An, hãy mở liên kết https://exam.example.edu.vn/x',
  html: '<p>Chào An, hãy mở liên kết <a href="https://exam.example.edu.vn/x">https://exam.example.edu.vn/x</a></p>',
};

interface FakeServer {
  port: number;
  mailFrom: string[];
  rcptTo: string[];
  messages: Buffer[];
  authAttempts: number;
  close: () => Promise<void>;
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((close) => close()));
});

/** Dựng máy chủ SMTP giả. `fail`: trả lỗi với mã này ở bước RCPT TO. */
async function startServer(
  options: { hideStartTls?: boolean; rcptError?: { code: number; text: string } } = {},
): Promise<FakeServer> {
  const state: FakeServer = {
    port: 0,
    mailFrom: [],
    rcptTo: [],
    messages: [],
    authAttempts: 0,
    close: async () => {},
  };
  const server = new SMTPServer({
    hideSTARTTLS: options.hideStartTls,
    // Không chỉ giấu lời quảng cáo mà thật sự từ chối lệnh STARTTLS, như một máy chủ không hỗ trợ TLS.
    disabledCommands: options.hideStartTls ? ['STARTTLS'] : [],
    allowInsecureAuth: options.hideStartTls === true, // cho phép đăng nhập qua kết nối thường để bài V-02 thử được
    authMethods: ['PLAIN', 'LOGIN'],
    onAuth(auth, _session, done) {
      state.authAttempts++;
      if (auth.username === USER && auth.password === PASSWORD) return done(null, { user: USER });
      done(new Error('535 5.7.8 Tên đăng nhập hoặc mật khẩu không đúng'));
    },
    onMailFrom(address, _session, done) {
      state.mailFrom.push(address.address);
      done();
    },
    onRcptTo(address, _session, done) {
      state.rcptTo.push(address.address);
      if (options.rcptError) {
        return done(
          Object.assign(new Error(options.rcptError.text), {
            responseCode: options.rcptError.code,
          }),
        );
      }
      done();
    },
    onData(stream, _session, done) {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        state.messages.push(Buffer.concat(chunks));
        done();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  state.port = (server.server.address() as net.AddressInfo).port;
  state.close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  cleanups.push(state.close);
  return state;
}

const transportFor = (port: number, extra: { timeoutMs?: number } = {}) =>
  new SmtpTransport(
    {
      host: '127.0.0.1',
      port,
      username: USER,
      password: PASSWORD,
      timeoutMs: extra.timeoutMs ?? 5000,
      sender: {
        fromName: 'Hệ thống kiểm tra đánh giá',
        fromEmail: USER,
        replyTo: 'hotro@example.org',
      },
      // Máy chủ giả dùng chứng chỉ tự ký; production luôn kiểm chứng chỉ (mặc định).
      tlsRejectUnauthorized: false,
    },
    () => new Date('2026-11-12T08:00:00Z'),
  );

const failureOf = async (action: Promise<void>): Promise<MailSendError> => {
  try {
    await action;
  } catch (error) {
    expect(error).toBeInstanceOf(MailSendError);
    return error as MailSendError;
  }
  throw new Error('mong đợi gửi thất bại nhưng thành công');
};

describe('SmtpTransport', () => {
  it('V-01: gửi một thư: máy chủ nhận đúng người gửi, người nhận, đầu mục và cả hai phần nội dung', async () => {
    const server = await startServer();
    await transportFor(server.port).send(MAIL);

    expect(server.authAttempts).toBe(1);
    expect(server.mailFrom).toEqual([USER]);
    expect(server.rcptTo).toEqual(['nhan@example.com']);
    expect(server.messages).toHaveLength(1);
    const parsed: ParsedMail = await simpleParser(server.messages[0] as Buffer);
    expect(parsed.subject).toBe(MAIL.subject);
    expect(parsed.from?.value[0]?.address).toBe(USER);
    expect(parsed.text).toContain('Chào An');
    expect(parsed.html).toContain('<a href="https://exam.example.edu.vn/x">');
    expect(parsed.headers.get('auto-submitted')).toBe('auto-generated');
  });

  it('V-02: máy chủ không hỗ trợ STARTTLS thì từ chối gửi và KHÔNG gửi thông tin đăng nhập (lỗi cấu hình, ngắt mạch)', async () => {
    const server = await startServer({ hideStartTls: true });
    const failure = await failureOf(transportFor(server.port).send(MAIL));
    expect(failure.kind).toBe('auth');
    expect(server.authAttempts).toBe(0);
    expect(server.messages).toEqual([]);
  });

  it.each([
    [421, 'temporary'],
    [451, 'temporary'],
    [452, 'temporary'],
    [550, 'permanent'],
    [553, 'permanent'],
  ] as const)('V-03: mã %i từ máy chủ được phân loại %s', async (code, kind) => {
    const server = await startServer({
      rcptError: { code, text: `${code} lỗi giả lập của máy chủ` },
    });
    const failure = await failureOf(transportFor(server.port).send(MAIL));
    expect(failure.kind).toBe(kind);
    expect(failure.message).toContain(String(code));
  });

  it('V-03: 535 (sai tên đăng nhập hoặc mật khẩu ứng dụng) là lỗi cấu hình, không phải lỗi người nhận', async () => {
    const server = await startServer();
    const wrong = new SmtpTransport(
      {
        host: '127.0.0.1',
        port: server.port,
        username: USER,
        password: 'sai-mat-khau',
        timeoutMs: 5000,
        sender: { fromName: 'X', fromEmail: USER, replyTo: USER },
        tlsRejectUnauthorized: false,
      },
      () => new Date(),
    );
    const failure = await failureOf(wrong.send(MAIL));
    expect(failure.kind).toBe('auth');
    expect(failure.message).not.toContain('sai-mat-khau');
  });

  it('V-03: Gmail báo quá hạn mức ngày bằng mã 550 5.4.5: không được coi là địa chỉ nhận bị từ chối (chỉ tạm dừng gửi)', async () => {
    const server = await startServer({
      rcptError: { code: 550, text: '550 5.4.5 Daily user sending quota exceeded' },
    });
    const failure = await failureOf(transportFor(server.port).send(MAIL));
    expect(failure.kind).toBe('auth');
  });

  it('V-04: máy chủ không trả lời: kết thúc đúng trong hạn chờ và phân loại tạm thời', async () => {
    const silent = net.createServer(() => {
      // nhận kết nối nhưng không bao giờ chào
    });
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => new Promise<void>((resolve) => silent.close(() => resolve())));
    const port = (silent.address() as net.AddressInfo).port;

    const started = performance.now();
    const failure = await failureOf(transportFor(port, { timeoutMs: 400 }).send(MAIL));
    expect(performance.now() - started).toBeLessThan(2000);
    expect(failure.kind).toBe('temporary');
  });

  it('không kết nối được (máy chủ tắt) là lỗi tạm thời', async () => {
    const server = await startServer();
    const port = server.port;
    await server.close();
    const failure = await failureOf(transportFor(port).send(MAIL));
    expect(failure.kind).toBe('temporary');
  });
});
