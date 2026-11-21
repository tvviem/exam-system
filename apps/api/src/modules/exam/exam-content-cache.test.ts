import { describe, expect, it } from 'vitest';
import { ExamContentCache } from './exam-content-cache';

// Bộ nhớ đệm nội dung Bộ đề đã Phát hành (bất biến, ADR-0005): đọc cơ sở dữ liệu một lần cho nhiều Lượt.

const content = (examId: string) =>
  ({
    examId,
    title: examId,
    instructions: { type: 'doc', content: [] },
    sections: [{ id: `${examId}-s`, title: null, instructions: null, drawPercent: 100, items: [] }],
  }) as never;

describe('ExamContentCache', () => {
  it('lần đầu gọi hàm nạp, những lần sau trả bản đã nhớ, không nạp lại', async () => {
    const cache = new ExamContentCache(8);
    let loads = 0;
    const load = async () => {
      loads++;
      return content('a');
    };
    const first = await cache.getOrLoad('a', load);
    const second = await cache.getOrLoad('a', load);
    expect(loads).toBe(1);
    expect(second).toBe(first);
  });

  it('không nhớ kết quả null (Bộ đề nháp có thể được Phát hành sau đó)', async () => {
    const cache = new ExamContentCache(8);
    let loads = 0;
    const missing = async () => {
      loads++;
      return null;
    };
    expect(await cache.getOrLoad('a', missing)).toBeNull();
    expect(await cache.getOrLoad('a', missing)).toBeNull();
    expect(loads).toBe(2);
    expect(await cache.getOrLoad('a', async () => content('a'))).not.toBeNull();
  });

  it('nhiều yêu cầu cùng lúc cho một Bộ đề chưa nhớ chỉ nạp một lần', async () => {
    const cache = new ExamContentCache(8);
    let loads = 0;
    const load = async () => {
      loads++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return content('a');
    };
    const results = await Promise.all(Array.from({ length: 50 }, () => cache.getOrLoad('a', load)));
    expect(loads).toBe(1);
    expect(new Set(results).size).toBe(1);
  });

  it('nạp lỗi thì không nhớ lỗi: lần sau nạp lại', async () => {
    const cache = new ExamContentCache(8);
    await expect(
      cache.getOrLoad('a', async () => {
        throw new Error('hỏng');
      }),
    ).rejects.toThrow('hỏng');
    expect(await cache.getOrLoad('a', async () => content('a'))).not.toBeNull();
  });

  it('giới hạn số Bộ đề: quá giới hạn thì bỏ Bộ đề lâu không dùng nhất, dùng gần đây thì được giữ', async () => {
    const cache = new ExamContentCache(2);
    const loads: string[] = [];
    const load = (id: string) => async () => {
      loads.push(id);
      return content(id);
    };
    await cache.getOrLoad('a', load('a'));
    await cache.getOrLoad('b', load('b'));
    await cache.getOrLoad('a', load('a')); // dùng lại a: b thành lâu nhất
    await cache.getOrLoad('c', load('c')); // đầy: bỏ b
    await cache.getOrLoad('a', load('a'));
    await cache.getOrLoad('b', load('b'));
    expect(loads).toEqual(['a', 'b', 'c', 'b']);
    expect(cache.size).toBe(2);
  });

  it('nội dung đã nhớ bị đóng băng: nơi dùng lỡ sửa thì báo lỗi thay vì làm hỏng bản dùng chung', async () => {
    const cache = new ExamContentCache(8);
    const got = (await cache.getOrLoad('a', async () => content('a'))) as unknown as {
      title: string;
      sections: { items: unknown[] }[];
    };
    expect(() => {
      got.title = 'đã sửa';
    }).toThrow();
    expect(() => got.sections[0]?.items.push(1)).toThrow();
  });
});
