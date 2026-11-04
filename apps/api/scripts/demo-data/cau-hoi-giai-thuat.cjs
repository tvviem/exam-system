// Dữ liệu mẫu: Chủ đề "Giải thuật". Nguồn của demo-data/cau-hoi-giai-thuat.xlsx.
const { single } = require('./rows.cjs');

// 10 câu Chọn một, 0,5 điểm mỗi câu (tổng 5 điểm).
module.exports = {
  'Chọn một': [
    single(
      'Tìm kiếm nhị phân chỉ áp dụng đúng trên dữ liệu như thế nào?',
      ['Mảng đã được sắp xếp', 'Mảng bất kỳ', 'Danh sách liên kết chưa sắp xếp', 'Đồ thị liên thông'],
      'A',
      '0,5',
      'giải thuật, tìm kiếm',
    ),
    single(
      'Độ phức tạp thời gian của tìm kiếm nhị phân trên mảng n phần tử là bao nhiêu?',
      ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'],
      'B',
      '0,5',
      'giải thuật, tìm kiếm, độ phức tạp',
    ),
    single(
      'Thuật toán sắp xếp nào sau đây có độ phức tạp thời gian O(n log n) trong mọi trường hợp?',
      ['Bubble sort', 'Insertion sort', 'Merge sort', 'Selection sort'],
      'C',
      '0,5',
      'giải thuật, sắp xếp',
    ),
    single(
      'Độ phức tạp thời gian trong trường hợp xấu nhất của Quick sort là bao nhiêu?',
      ['O(n)', 'O(n log n)', 'O(log n)', 'O(n²)'],
      'D',
      '0,5',
      'giải thuật, sắp xếp, độ phức tạp',
    ),
    single(
      'Duyệt đồ thị theo chiều rộng (BFS) thường dùng cấu trúc dữ liệu nào?',
      ['Ngăn xếp', 'Hàng đợi', 'Heap', 'Bảng băm'],
      'B',
      '0,5',
      'giải thuật, đồ thị',
    ),
    single(
      'Duyệt đồ thị theo chiều sâu (DFS) không đệ quy thường dùng cấu trúc dữ liệu nào?',
      ['Hàng đợi', 'Heap', 'Ngăn xếp', 'Cây AVL'],
      'C',
      '0,5',
      'giải thuật, đồ thị',
    ),
    single(
      'Thuật toán Dijkstra tìm đường đi ngắn nhất yêu cầu trọng số các cạnh như thế nào?',
      ['Không âm', 'Có thể âm', 'Bằng nhau', 'Là số nguyên chẵn'],
      'A',
      '0,5',
      'giải thuật, đồ thị, đường đi ngắn nhất',
    ),
    single(
      'Quy hoạch động phù hợp với bài toán có đặc điểm nào?',
      ['Dữ liệu đã được sắp xếp', 'Bài toán chỉ có một lời giải', 'Đồ thị không có chu trình', 'Các bài toán con gối nhau và có cấu trúc con tối ưu'],
      'D',
      '0,5',
      'giải thuật, quy hoạch động',
    ),
    single(
      'Tính số Fibonacci thứ n bằng đệ quy thuần túy (không ghi nhớ) có độ phức tạp thời gian cỡ bao nhiêu?',
      ['O(n)', 'O(n²)', 'O(2ⁿ)', 'O(log n)'],
      'C',
      '0,5',
      'giải thuật, đệ quy, độ phức tạp',
    ),
    single(
      'Thuật toán tham lam (greedy) có đặc điểm nào?',
      ['Thử tất cả các khả năng rồi chọn kết quả tốt nhất', 'Chọn phương án tốt nhất tại từng bước và không quay lui', 'Chia bài toán thành hai nửa bằng nhau', 'Lưu kết quả các bài toán con vào bảng'],
      'B',
      '0,5',
      'giải thuật, tham lam',
    ),
  ],
};
