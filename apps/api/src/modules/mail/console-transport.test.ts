import { describe, expect, it } from 'vitest';
import { ConsoleTransport } from './console-transport';

describe('ConsoleTransport (chỉ dev và test)', () => {
  it('in thư ra qua hàm ghi: người nhận, tiêu đề và nội dung văn bản thuần, để thử luồng bằng tay mà thấy liên kết', async () => {
    const lines: string[] = [];
    const transport = new ConsoleTransport((text) => lines.push(text));
    await transport.send({
      to: 'sv@example.com',
      subject: 'Kích hoạt tài khoản',
      text: 'Mở liên kết: http://localhost:5173/activate#ma-thu',
      html: '<p>không in HTML</p>',
    });
    const printed = lines.join('\n');
    expect(printed).toContain('sv@example.com');
    expect(printed).toContain('Kích hoạt tài khoản');
    expect(printed).toContain('http://localhost:5173/activate#ma-thu');
    expect(printed).not.toContain('<p>');
  });
});
