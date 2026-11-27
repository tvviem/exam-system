import { describe, expect, it } from 'vitest';
import {
  compareTopicNames,
  filterTopicTree,
  groupTopics,
  sortTopics,
  splitTopicName,
} from './topic-tree';

// Gom Chủ đề theo phần đầu của tên, chỉ ở giao diện (docs/plan/chu-de-ux-thiet-ke.md mục 4.1, bài U-01 đến U-05).

const topics = (...names: string[]) =>
  names.map((name, i) => ({ id: `t${i}`, name, questionCount: i + 1 }));
const shape = (tree: ReturnType<typeof groupTopics<ReturnType<typeof topics>[number]>>) => ({
  groups: tree.groups.map((g) => [g.name, g.items.map((item) => item.label)]),
  singles: tree.singles.map((t) => t.name),
});

describe('splitTopicName (U-01)', () => {
  it('tách ở dấu " - " đầu tiên', () => {
    expect(splitTopicName('NLS và ứng dụng AI - Chương 4: NLS - phần 2')).toEqual({
      prefix: 'NLS và ứng dụng AI',
      rest: 'Chương 4: NLS - phần 2',
    });
  });

  it.each(['Toán rời rạc', 'C-Sharp nâng cao', 'Mạng – Chương 1', ' - Chương 1', 'Mạng - '])(
    'không tách "%s"',
    (name) => {
      expect(splitTopicName(name)).toBeNull();
    },
  );
});

describe('sắp xếp tự nhiên tiếng Việt (U-03)', () => {
  it('số trong tên so theo giá trị; Đ đứng sau D', () => {
    const names = ['Chương 10', 'Chương 2', 'Chương 1', 'Đồ thị', 'Dãy số', 'Em'];
    expect([...names].sort(compareTopicNames)).toEqual([
      'Chương 1',
      'Chương 2',
      'Chương 10',
      'Dãy số',
      'Đồ thị',
      'Em',
    ]);
  });

  it('sortTopics không đổi mảng gốc', () => {
    const list = topics('B 10', 'B 9');
    expect(sortTopics(list).map((t) => t.name)).toEqual(['B 9', 'B 10']);
    expect(list.map((t) => t.name)).toEqual(['B 10', 'B 9']);
  });
});

describe('gom nhóm (U-02, U-05)', () => {
  it('từ hai Chủ đề cùng phần đầu mới thành nhóm; không phân biệt hoa thường và dấu; còn lại đứng riêng', () => {
    const tree = groupTopics(
      topics(
        'Cơ sở dữ liệu - Chương 10',
        'co so du lieu - Chương 2',
        'Mạng - Chương 1',
        'Toán rời rạc',
      ),
    );
    expect(shape(tree)).toEqual({
      groups: [['co so du lieu', ['Chương 2', 'Chương 10']]],
      singles: ['Mạng - Chương 1', 'Toán rời rạc'],
    });
    expect(tree.groups[0]?.questionCount).toBe(3);
  });

  it('phần đầu chỉ khác số cuối ("CTDL 1", "CTDL 2") gom theo phần chữ, nhãn giữ số', () => {
    const tree = groupTopics(
      topics('CTDL 2 - Danh sách', 'CTDL 10 - Ôn tập', 'CTDL 1 - Mở đầu', 'CTDL - Đề cương'),
    );
    expect(shape(tree)).toEqual({
      groups: [['CTDL', ['1 - Mở đầu', '2 - Danh sách', '10 - Ôn tập', 'Đề cương']]],
      singles: [],
    });
  });

  it('phần đầu có số lặp lại (học phần "Toán 1") giữ nguyên là một nhóm, không gộp với "Toán 2"', () => {
    const tree = groupTopics(
      topics('Toán 1 - Giới hạn', 'Toán 1 - Đạo hàm', 'Toán 2 - Tích phân', 'Toán 2 - Chuỗi'),
    );
    expect(shape(tree).groups.map(([name]) => name)).toEqual(['Toán 1', 'Toán 2']);
  });

  it('Chủ đề tên đúng bằng phần đầu của nhóm vẫn đứng riêng; nhóm xếp theo tên', () => {
    const tree = groupTopics(topics('Web - A', 'Web - B', 'Web', 'AI - A', 'AI - B'));
    expect(shape(tree)).toEqual({
      groups: [
        ['AI', ['A', 'B']],
        ['Web', ['A', 'B']],
      ],
      singles: ['Web'],
    });
  });
});

describe('tìm Chủ đề (U-04)', () => {
  const tree = groupTopics(
    topics(
      'CTDL 4 - Cây',
      'CTDL 6 - Đồ thị',
      'NLS và AI - Chương 6: An toàn',
      'NLS và AI - Chương 4: NLS',
      'Toán rời rạc',
    ),
  );
  const found = (q: string) => {
    const result = filterTopicTree(tree, q);
    return [
      ...result.groups.flatMap((g) => g.items.map((i) => i.topic.name)),
      ...result.singles.map((t) => t.name),
    ];
  };

  it('không dấu, nhiều từ không cần đúng thứ tự, khớp cả tên đầy đủ', () => {
    expect(found('cay ctdl')).toEqual(['CTDL 4 - Cây']);
    expect(found('6 do thi')).toEqual(['CTDL 6 - Đồ thị']);
    expect(found('chuong 6 nls')).toEqual(['NLS và AI - Chương 6: An toàn']);
  });

  it('từ khóa trùng phần đầu giữ cả nhóm và giữ tên nhóm; nhãn trong nhóm không đổi', () => {
    const result = filterTopicTree(tree, 'ctdl');
    expect(result.groups.map((g) => [g.name, g.items.map((i) => i.label)])).toEqual([
      ['CTDL', ['4 - Cây', '6 - Đồ thị']],
    ]);
    expect(result.groups[0]?.questionCount).toBe(3);
    expect(result.singles).toEqual([]);
  });

  it('từ khóa trống giữ nguyên; không khớp thì rỗng', () => {
    expect(filterTopicTree(tree, '   ')).toEqual(tree);
    expect(found('khong co')).toEqual([]);
  });
});
