// Dữ liệu mẫu: Chủ đề "Cấu trúc dữ liệu". Nguồn của demo-data/cau-hoi-cau-truc-du-lieu.xlsx.
const { single } = require('./rows.cjs');

// 10 câu Chọn một, 0,5 điểm mỗi câu (tổng 5 điểm).
module.exports = {
  'Chọn một': [
    single(
      'Cấu trúc dữ liệu nào hoạt động theo nguyên tắc vào sau ra trước (LIFO)?',
      ['Hàng đợi (queue)', 'Ngăn xếp (stack)', 'Cây nhị phân', 'Bảng băm'],
      'B',
      '0,5',
      'cấu trúc dữ liệu, ngăn xếp',
    ),
    single(
      'Truy cập một phần tử của mảng theo chỉ số có độ phức tạp thời gian là bao nhiêu?',
      ['O(n)', 'O(log n)', 'O(1)', 'O(n log n)'],
      'C',
      '0,5',
      'cấu trúc dữ liệu, mảng, độ phức tạp',
    ),
    single(
      'Hàng đợi (queue) hoạt động theo nguyên tắc nào?',
      ['Vào sau ra trước', 'Ra ngẫu nhiên', 'Vào trước ra sau', 'Vào trước ra trước'],
      'D',
      '0,5',
      'cấu trúc dữ liệu, hàng đợi',
    ),
    single(
      'Duyệt cây nhị phân tìm kiếm theo thứ tự nào thì thu được dãy khóa tăng dần?',
      ['Duyệt tiền thứ tự', 'Duyệt hậu thứ tự', 'Duyệt theo mức', 'Duyệt trung thứ tự'],
      'D',
      '0,5',
      'cấu trúc dữ liệu, cây nhị phân',
    ),
    single(
      'Chèn một phần tử vào đầu danh sách liên kết đơn (đã có con trỏ đầu) có độ phức tạp thời gian là bao nhiêu?',
      ['O(1)', 'O(n)', 'O(log n)', 'O(n²)'],
      'A',
      '0,5',
      'cấu trúc dữ liệu, danh sách liên kết, độ phức tạp',
    ),
    single(
      'Trong bảng băm, "xung đột" (collision) là gì?',
      ['Hai khóa khác nhau được băm về cùng một vị trí', 'Khóa cần tìm không có trong bảng', 'Bảng băm không còn chỗ trống', 'Hàm băm trả về giá trị âm'],
      'A',
      '0,5',
      'cấu trúc dữ liệu, bảng băm',
    ),
    single(
      'Một cây nhị phân có 7 nút thì có nhiều nhất bao nhiêu nút lá?',
      ['3', '4', '5', '6'],
      'B',
      '0,5',
      'cấu trúc dữ liệu, cây nhị phân',
    ),
    single(
      'Đồ thị có V đỉnh biểu diễn bằng ma trận kề cần bộ nhớ cỡ bao nhiêu?',
      ['O(V)', 'O(V + E)', 'O(V²)', 'O(E)'],
      'C',
      '0,5',
      'cấu trúc dữ liệu, đồ thị',
    ),
    single(
      'Cấu trúc dữ liệu nào thường dùng để cài đặt hàng đợi ưu tiên hiệu quả?',
      ['Mảng chưa sắp xếp', 'Ngăn xếp', 'Danh sách liên kết đơn', 'Heap nhị phân'],
      'D',
      '0,5',
      'cấu trúc dữ liệu, heap',
    ),
    single(
      'Tìm kiếm một khóa trong cây nhị phân tìm kiếm cân bằng gồm n nút có độ phức tạp thời gian là bao nhiêu?',
      ['O(log n)', 'O(n)', 'O(1)', 'O(n²)'],
      'A',
      '0,5',
      'cấu trúc dữ liệu, cây nhị phân, độ phức tạp',
    ),
  ],
};
