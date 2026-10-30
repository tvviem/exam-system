const HEADER = [
  'Nội dung',
  'Phương án A',
  'Phương án B',
  'Phương án C',
  'Phương án D',
  'Phương án E',
  'Phương án F',
  'Đáp án',
  'Điểm',
  'Quy tắc chấm',
  'Tags',
];

const csvLine = (cells: string[]) => cells.map((c) => `"${c.replaceAll('"', '""')}"`).join(',');

/** Dòng dữ liệu: nội dung, các Phương án (từ A), đáp án, và các cột tùy chọn. */
export const importRow = (
  stem: string,
  options: string[],
  answer: string,
  extra: { points?: string; rule?: string; tags?: string } = {},
): string[] => [
  stem,
  ...Array.from({ length: 6 }, (_, i) => options[i] ?? ''),
  answer,
  extra.points ?? '',
  extra.rule ?? '',
  extra.tags ?? '',
];

/** File CSV nhập Câu hỏi (UTF-8) với dòng tiêu đề của mẫu. */
export const importCsv = (...rows: string[][]) => ({
  filename: 'cau-hoi.csv',
  content: Buffer.from([csvLine(HEADER), ...rows.map(csvLine)].join('\n'), 'utf8'),
  contentType: 'text/csv',
});
