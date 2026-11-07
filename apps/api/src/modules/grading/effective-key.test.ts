import { describe, expect, it } from 'vitest';
import type { ContentItem } from '../../common/exam-content';
import { keyOf, keyProblem, withKey } from './effective-key';

const item = (
  type: ContentItem['snapshot']['type'],
  payload: Record<string, unknown>,
): ContentItem => ({
  itemId: 'i1',
  sectionId: 's1',
  points: 1,
  snapshot: { questionId: 'q1', type, stem: {}, payload, illustrations: [] },
});

const single = item('single_choice', {
  options: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }],
  key: ['o1'],
});
const multiple = item('multiple_choice', {
  options: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }],
  key: ['o1', 'o3'],
});
const cluster = item('true_false_cluster', {
  statements: [
    { id: 's1', key: true },
    { id: 's2', key: false },
  ],
});
const essay = item('essay', { maxLength: 100 });

describe('keyOf', () => {
  it('đọc đáp án của từng loại câu', () => {
    expect(keyOf(single.snapshot)).toEqual(['o1']);
    expect(keyOf(multiple.snapshot)).toEqual(['o1', 'o3']);
    expect(keyOf(cluster.snapshot)).toEqual({ s1: true, s2: false });
    expect(keyOf(essay.snapshot)).toBeNull();
  });
});

describe('keyProblem: đáp án mới có hợp lệ với câu không', () => {
  it('chọn một cần đúng một Phương án có thật', () => {
    expect(keyProblem(single.snapshot, ['o2'])).toBeNull();
    expect(keyProblem(single.snapshot, ['o2', 'o3'])).toBe('key_single_needs_one');
    expect(keyProblem(single.snapshot, ['o9'])).toBe('key_unknown_option');
    expect(keyProblem(single.snapshot, { s1: true })).toBe('key_wrong_shape');
  });

  it('chọn nhiều: một hay nhiều Phương án có thật, không trùng', () => {
    expect(keyProblem(multiple.snapshot, ['o2'])).toBeNull();
    expect(keyProblem(multiple.snapshot, ['o1', 'o2', 'o3'])).toBeNull();
    expect(keyProblem(multiple.snapshot, ['o1', 'o1'])).toBe('key_unknown_option');
  });

  it('chùm cần đủ và chỉ gồm các Mệnh đề của chùm', () => {
    expect(keyProblem(cluster.snapshot, { s1: false, s2: false })).toBeNull();
    expect(keyProblem(cluster.snapshot, { s1: true })).toBe('key_statements');
    expect(keyProblem(cluster.snapshot, { s1: true, s2: true, s3: true })).toBe('key_statements');
    expect(keyProblem(cluster.snapshot, ['s1'])).toBe('key_wrong_shape');
  });

  it('câu tự luận không có đáp án', () => {
    expect(keyProblem(essay.snapshot, ['o1'])).toBe('essay_has_no_key');
  });
});

describe('withKey: chồng đáp án mới lên bản chụp mà không sửa bản gốc', () => {
  it('chọn một và chọn nhiều', () => {
    const next = withKey(single, ['o2']);
    expect(next.snapshot.payload.key).toEqual(['o2']);
    expect(single.snapshot.payload.key).toEqual(['o1']);
    expect(withKey(multiple, ['o2']).snapshot.payload.key).toEqual(['o2']);
  });

  it('chùm giữ nội dung Mệnh đề, đổi giá trị đúng/sai', () => {
    const next = withKey(cluster, { s1: false, s2: true });
    expect(keyOf(next.snapshot)).toEqual({ s1: false, s2: true });
    expect(keyOf(cluster.snapshot)).toEqual({ s1: true, s2: false });
  });
});
