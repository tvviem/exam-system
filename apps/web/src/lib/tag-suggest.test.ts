import { describe, expect, it } from 'vitest';
import { splitTagText, suggestTags } from './tag-suggest';

const all = [
  { tag: 'thông hiểu', count: 95 },
  { tag: 'chương 2', count: 80 },
  { tag: 'vận dụng', count: 67 },
  { tag: 'vận dụng cao', count: 4 },
  { tag: 'ngăn xếp', count: 11 },
  { tag: 'sql', count: 50 },
];
const inTopic = new Set(['chương 2', 'vận dụng', 'ngăn xếp']);
const view = (typed: string, selected: string[] = []) =>
  suggestTags(all, inTopic, selected, typed).map((option) =>
    option.kind === 'new' ? `+${option.tag}` : option.tag,
  );

describe('suggestTags', () => {
  it('chưa gõ: tag của Chủ đề đang chọn trước, rồi theo số câu; bỏ tag đã có', () => {
    expect(view('', ['chương 2'])).toEqual([
      'vận dụng',
      'ngăn xếp',
      'thông hiểu',
      'sql',
      'vận dụng cao',
    ]);
  });

  it('gõ không dấu đúng một tag đang có: tag đó đứng đầu, tag mới đứng sau để vẫn chọn được', () => {
    expect(view('van dung')).toEqual(['vận dụng', 'vận dụng cao', '+van dung']);
    expect(view('Chuong  2')).toEqual(['chương 2', '+chuong 2']);
  });

  it('gõ đúng y một tag đang có: không đề nghị tạo mới', () => {
    expect(view('Vận Dụng')).toEqual(['vận dụng', 'vận dụng cao']);
  });

  it('gõ dở hay tag chưa có: "thêm mới" đứng đầu, gợi ý theo sau', () => {
    expect(view('van')).toEqual(['+van', 'vận dụng', 'vận dụng cao']);
    expect(view('cây avl')).toEqual(['+cây avl']);
  });

  it('tag đã gắn thì không gợi ý, cũng không tạo lại; quá 30 ký tự thì không đề nghị', () => {
    expect(view('sql', ['sql'])).toEqual([]);
    expect(view('x'.repeat(31))).toEqual([]);
  });

  it('nhiều nhất 8 gợi ý đang có', () => {
    const many = Array.from({ length: 20 }, (_, k) => ({ tag: `ý ${k}`, count: 20 - k }));
    expect(suggestTags(many, new Set(), [], '')).toHaveLength(8);
  });
});

describe('splitTagText', () => {
  it('phần trước dấu phẩy thành tag, phần sau cùng còn đang gõ', () => {
    expect(splitTagText(' Chương 1 , nhận biết,  thiết ')).toEqual({
      done: ['chương 1', 'nhận biết'],
      rest: '  thiết ',
    });
    expect(splitTagText('một,')).toEqual({ done: ['một'], rest: '' });
    expect(splitTagText('chưa phẩy')).toEqual({ done: [], rest: 'chưa phẩy' });
  });
});
