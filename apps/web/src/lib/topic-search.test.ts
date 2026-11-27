import { describe, expect, it } from 'vitest';
import { rememberTopic, searchTopics, suggestTopics } from './topic-search';

const topic = (name: string, questionCount = 0) => ({ id: name, name, questionCount });
const names = (hits: { topic: { name: string } }[]) => hits.map((hit) => hit.topic.name);
/** Các đoạn chữ được tô đậm trong tên, đúng theo chữ gốc. */
const marked = (hit: { topic: { name: string }; marks: [number, number][] }) =>
  hit.marks.map(([from, to]) => hit.topic.name.slice(from, to));

const TOPICS = [
  'Cấu trúc dữ liệu',
  'Cơ sở dữ liệu',
  'Dữ liệu lớn',
  'Khai phá dữ liệu',
  'Mạng máy tính',
  'Lập trình căn bản',
].map((name) => topic(name));

describe('searchTopics', () => {
  it('khớp không dấu, mọi từ, không cần đúng thứ tự', () => {
    expect(names(searchTopics(TOPICS, 'lieu cau').hits)).toEqual(['Cấu trúc dữ liệu']);
  });

  it('khớp chữ cái đầu: ctdl ra Cấu trúc dữ liệu', () => {
    const { hits } = searchTopics(TOPICS, 'ctdl');
    expect(names(hits)).toEqual(['Cấu trúc dữ liệu']);
    expect(marked(hits[0] as (typeof hits)[number])).toEqual(['C', 't', 'd', 'l']);
  });

  it('xếp hạng: tên bắt đầu bằng từ khóa, khớp đầu từ, khớp giữa từ, khớp chữ cái đầu', () => {
    const list = ['Ôn tập lieu', 'Liệu pháp', 'Vật liệu', 'Tinhlieu', 'Lập trình mạng'].map((n) =>
      topic(n),
    );
    expect(names(searchTopics(list, 'lieu').hits)).toEqual([
      'Liệu pháp',
      'Ôn tập lieu',
      'Vật liệu',
      'Tinhlieu',
    ]);
    // "ltm" chỉ khớp chữ cái đầu.
    expect(names(searchTopics(list, 'ltm').hits)).toEqual(['Lập trình mạng']);
  });

  it('tô đậm đúng chữ gốc có dấu', () => {
    const [hit] = searchTopics([topic('Cơ sở dữ liệu')], 'du lieu').hits;
    expect(hit && marked(hit)).toEqual(['dữ', 'liệu']);
  });

  it('trả tối đa 20 kết quả kèm tổng số khớp', () => {
    const many = Array.from({ length: 25 }, (_, k) => topic(`Chuyên đề ${k + 1}`));
    const result = searchTopics(many, 'chuyen');
    expect(result.hits).toHaveLength(20);
    expect(result.total).toBe(25);
    expect(names(result.hits).slice(0, 3)).toEqual(['Chuyên đề 1', 'Chuyên đề 2', 'Chuyên đề 3']);
  });

  it('từ khóa trống hoặc không khớp thì không có kết quả', () => {
    expect(searchTopics(TOPICS, '  ')).toEqual({ hits: [], total: 0 });
    expect(searchTopics(TOPICS, 'hoa hoc')).toEqual({ hits: [], total: 0 });
  });
});

describe('suggestTopics', () => {
  it('Chủ đề dùng gần đây đứng trước, thêm theo tên cho đủ 6, nêu số còn lại', () => {
    const list = [...TOPICS, topic('An toàn thông tin'), topic('Bảo mật web')];
    const result = suggestTopics(list, ['Mạng máy tính', 'đã xóa', 'Dữ liệu lớn']);
    expect(result.recent.map((t) => t.name)).toEqual(['Mạng máy tính', 'Dữ liệu lớn']);
    expect(result.others.map((t) => t.name)).toEqual([
      'An toàn thông tin',
      'Bảo mật web',
      'Cấu trúc dữ liệu',
      'Cơ sở dữ liệu',
    ]);
    expect(result.hidden).toBe(2);
  });

  it('ít Chủ đề thì hiện hết', () => {
    const result = suggestTopics(TOPICS.slice(0, 2), []);
    expect(result.others).toHaveLength(2);
    expect(result.hidden).toBe(0);
  });
});

describe('rememberTopic', () => {
  it('mới nhất đứng đầu, không trùng, giữ tối đa 3', () => {
    expect(rememberTopic(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(rememberTopic(['a', 'b', 'c'], 'd')).toEqual(['d', 'a', 'b']);
  });
});
