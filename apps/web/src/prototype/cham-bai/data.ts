// PROTOTYPE màn Chấm Câu tự luận (Q110, Q290–Q293): dữ liệu giả, không gọi API. Vứt đi sau khi chủ dự án chọn phương án.

export interface FakeEntry {
  id: string;
  /** Nhãn ẩn tên (Q291). */
  label: string;
  /** Tên hiện khi tắt Chấm ẩn tên. */
  name: string;
  code: string;
  text: string;
}

export const QUESTION = {
  no: 4,
  points: 2,
  stem: 'Trình bày khái niệm biến trong lập trình. Nêu hai ví dụ về cách khai báo biến và giải thích vì sao cần đặt tên biến có ý nghĩa.',
  rubric: [
    'Nêu đúng khái niệm: biến là vùng nhớ có tên dùng để lưu dữ liệu (0,75 điểm)',
    'Hai ví dụ khai báo đúng cú pháp (0,5 điểm mỗi ví dụ, tối đa 1 điểm)',
    'Giải thích lợi ích tên biến có ý nghĩa: dễ đọc, dễ bảo trì (0,25 điểm)',
  ],
};

const NAMES = [
  'Nguyễn Văn An',
  'Trần Thị Bình',
  'Lê Hoàng Chi',
  'Phạm Quốc Dũng',
  'Vũ Thu Hà',
  'Đặng Minh Khoa',
  'Bùi Ngọc Lan',
  'Hoàng Gia Minh',
  'Phan Thanh Nga',
  'Đỗ Anh Quân',
  'Ngô Thùy Linh',
  'Dương Hải Sơn',
];

const SHORT = [
  'Biến là nơi lưu dữ liệu trong bộ nhớ. Ví dụ: int tuoi = 20; string ten = "An"; Tên biến rõ nghĩa giúp người khác đọc code dễ hiểu.',
  'Biến dùng để chứa giá trị. VD: x = 5 và name = "Binh". Đặt tên có nghĩa để đỡ nhầm.',
  'Biến là một cái hộp có tên để cất giá trị, giá trị có thể thay đổi khi chạy chương trình. Ví dụ: let diem = 9.5; const PI = 3.14. Tên như diem, PI nói lên mục đích nên sau này sửa code không bị rối.',
  'Em chưa nhớ rõ khái niệm. Ví dụ: a = 1.',
  'Biến (variable) là vùng nhớ được đặt tên, kiểu dữ liệu quy định loại giá trị nó giữ. Hai ví dụ: int soLuong = 10; (C/C++) và so_luong = 10 (Python). Tên biến có ý nghĩa như soLuong thay vì a giúp code tự mô tả, giảm lỗi và dễ bảo trì khi làm việc nhóm.',
  'Biến là tên gọi của ô nhớ. int a; float b; Nên đặt tên dễ hiểu.',
];

export const ENTRIES: FakeEntry[] = Array.from({ length: 36 }, (_, i) => ({
  id: `b${i + 1}`,
  label: `Bài ${i + 1}`,
  name: NAMES[i % NAMES.length] as string,
  code: `SV${String(i + 1).padStart(3, '0')}`,
  text: SHORT[i % SHORT.length] as string,
}));

export const QUICK = [
  { label: '0', value: 0 },
  { label: '¼', value: 0.5 },
  { label: '½', value: 1 },
  { label: '¾', value: 1.5 },
  { label: 'Tối đa', value: 2 },
];

export const fmt = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
