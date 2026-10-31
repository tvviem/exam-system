import { describe, expect, it } from 'vitest';
import { rewriteIllustrationIds } from './rewrite-illustration-ids';

const A = '0198a000-0000-7000-8000-00000000000a';
const B = '0198a000-0000-7000-8000-00000000000b';
const C = '0198a000-0000-7000-8000-00000000000c';

const image = (id: string, alt = 'hình') => ({ type: 'image', attrs: { illustrationId: id, alt } });
const doc = (...blocks: unknown[]) => ({ type: 'doc', content: blocks });

describe('viết lại illustrationId trong nội dung (Q149)', () => {
  it('đổi id theo bảng ánh xạ, giữ nguyên alt và phần còn lại', () => {
    const stem = doc({ type: 'paragraph' }, image(A, 'đồ thị'));
    const { value, changed } = rewriteIllustrationIds(stem, new Map([[A, B]]));
    expect(changed).toBe(true);
    expect(value).toEqual(doc({ type: 'paragraph' }, image(B, 'đồ thị')));
  });

  it('đổi cả trong Phương án của payload và nhiều ảnh cùng lúc', () => {
    const payload = {
      options: [
        { id: 'o1', content: doc(image(A)) },
        { id: 'o2', content: doc(image(C)) },
      ],
      key: ['o1'],
    };
    const { value } = rewriteIllustrationIds(payload, new Map([[A, B]]));
    expect(value).toEqual({
      options: [
        { id: 'o1', content: doc(image(B)) },
        { id: 'o2', content: doc(image(C)) },
      ],
      key: ['o1'],
    });
  });

  it('không có ảnh nào trong bảng ánh xạ thì không đổi gì và báo changed=false', () => {
    const stem = doc(image(C));
    const { value, changed } = rewriteIllustrationIds(stem, new Map([[A, B]]));
    expect(changed).toBe(false);
    expect(value).toEqual(stem);
  });

  it('không đổi đối tượng gốc (trả bản mới)', () => {
    const stem = doc(image(A));
    const { value } = rewriteIllustrationIds(stem, new Map([[A, B]]));
    expect(stem).toEqual(doc(image(A)));
    expect(value).not.toBe(stem);
  });

  it('chỉ đổi nút image: chuỗi giống id ở chỗ khác (như văn bản) giữ nguyên', () => {
    const stem = doc({ type: 'paragraph', content: [{ type: 'text', text: A }] });
    const { value, changed } = rewriteIllustrationIds(stem, new Map([[A, B]]));
    expect(changed).toBe(false);
    expect(value).toEqual(stem);
  });
});
