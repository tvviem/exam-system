// Hướng dẫn đặt tag cho Người ra đề: một nguồn cho sheet "Hướng dẫn" của file Excel mẫu và màn soạn Câu hỏi.
// Phải khớp cách xếp loại ở tag-filter.ts (tag-guide.test.ts giữ).

export const TAG_GUIDE_TITLE = 'Cách đặt tag để dễ tìm';

/** Một ô Tags điền đúng cách: chương, mức độ, nội dung. */
export const TAG_GUIDE_EXAMPLE = 'chương 2, vận dụng, ngăn xếp';

export const TAG_GUIDE: readonly { title: string; text: string }[] = [
  {
    title: 'Mỗi câu nên có',
    text: '1 tag chương (chương 2), 1 tag mức độ (nhận biết, thông hiểu, vận dụng hoặc vận dụng cao) và 1 đến 3 tag nội dung (ngăn xếp).',
  },
  {
    title: 'Viết thống nhất',
    text: 'Cùng một ý chỉ viết một cách: chương 2, không viết c2, Chương II hay chuong 2. Có dấu và không dấu là hai tag khác nhau; chữ hoa tự đổi thành chữ thường.',
  },
  {
    title: 'Loại riêng',
    text: 'Muốn thêm một loại để lọc thì viết theo dạng "loại: giá trị", ví dụ chuẩn: clo1.',
  },
  {
    title: 'Không cần gắn',
    text: 'Tên học phần (đã có Chủ đề) và Loại câu hỏi (đã lọc riêng được).',
  },
  {
    title: 'Khi lọc',
    text: 'Tag cùng loại nghĩa là "hoặc", khác loại là "và": chọn chương 1, chương 2, vận dụng sẽ ra các câu (chương 1 hoặc chương 2) và vận dụng.',
  },
];
