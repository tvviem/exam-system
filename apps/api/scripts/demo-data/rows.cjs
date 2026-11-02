// Dựng một dòng của file Nhập Excel Câu hỏi; khóa là tiêu đề cột của mẫu (question-import-template.ts).
const LETTERS = 'ABCDEFGH';
const SMALL = 'abcdefgh';

const withItems = (kind, letters, items) =>
  Object.fromEntries(items.map((text, i) => [`${kind} ${letters[i]}`, text]));

const single = (content, options, answer, points, tags) => ({
  'Nội dung': content,
  ...withItems('Phương án', LETTERS, options),
  'Đáp án': answer,
  Điểm: points,
  Tags: tags,
});

const multiple = (content, options, answer, points, rule, tags) => ({
  'Nội dung': content,
  ...withItems('Phương án', LETTERS, options),
  'Đáp án': answer,
  Điểm: points,
  'Quy tắc chấm': rule,
  Tags: tags,
});

const cluster = (content, statements, answer, points, rule, ladder, tags) => ({
  'Nội dung': content,
  ...withItems('Mệnh đề', SMALL, statements),
  'Đáp án': answer,
  Điểm: points,
  'Quy tắc chấm': rule,
  'Bậc thang': ladder,
  Tags: tags,
});

const essay = (content, maxLength, rubric, points, tags) => ({
  'Nội dung': content,
  'Độ dài tối đa': maxLength,
  'Hướng dẫn chấm': rubric,
  Điểm: points,
  Tags: tags,
});

module.exports = { single, multiple, cluster, essay };
