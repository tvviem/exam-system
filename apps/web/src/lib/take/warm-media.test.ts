import type { RichText } from '@exam/shared';
import { describe, expect, it } from 'vitest';
import type { AttemptView, TakeItem } from '../take';
import { mediaOf } from './warm-media';

const IMG1 = '0197a6f0-0000-7000-8000-0000000000a1';
const IMG2 = '0197a6f0-0000-7000-8000-0000000000a2';
const doc = (...blocks: unknown[]) => ({ type: 'doc', content: blocks }) as unknown as RichText;
const image = (illustrationId: string) => ({
  type: 'image',
  attrs: { illustrationId, alt: 'hình' },
});
const math = {
  type: 'paragraph',
  content: [{ type: 'math', attrs: { latex: 'x^2', display: false } }],
};
const text = { type: 'paragraph', content: [{ type: 'text', text: 'chữ' }] };

const item = (extra: Partial<TakeItem>): TakeItem => ({
  itemId: 'i',
  no: 1,
  points: 1,
  type: 'single_choice',
  stem: doc(text),
  payload: {},
  response: null,
  ...extra,
});

const viewOf = (items: TakeItem[], instructions: RichText | null = null): AttemptView =>
  ({
    exam: { title: 'Đề', instructions: null },
    sections: [{ id: 's', title: null, instructions, items }],
  }) as unknown as AttemptView;

describe('ảnh và công thức cần có sẵn khi mất mạng', () => {
  it('gom ảnh ở mọi nơi trong đề, mỗi ảnh một lần', () => {
    const result = mediaOf(
      viewOf(
        [
          item({ stem: doc(text, image(IMG1)) }),
          item({
            stem: doc(text),
            payload: {
              options: [
                { id: 'o1', content: doc(image(IMG2)) },
                { id: 'o2', content: doc(image(IMG1)) },
              ],
            },
          }),
          item({ payload: { statements: [{ id: 's1', content: doc(image(IMG2)) }] } }),
        ],
        doc(image('0197a6f0-0000-7000-8000-0000000000a3')),
      ),
    );
    expect(result.imageIds.sort()).toEqual([IMG1, IMG2, '0197a6f0-0000-7000-8000-0000000000a3']);
  });

  it('có công thức ở stem hay phương án thì báo cần KaTeX', () => {
    expect(mediaOf(viewOf([item({ stem: doc(math) })])).hasMath).toBe(true);
    expect(
      mediaOf(viewOf([item({ payload: { options: [{ id: 'o', content: doc(math) }] } })])).hasMath,
    ).toBe(true);
    expect(mediaOf(viewOf([item({})])).hasMath).toBe(false);
  });
});
