/**
 * Danh sách lớn (Câu hỏi, Người dùng, Lịch sử đăng nhập, Nhật ký thao tác) chỉ đếm tới mức này và không lật quá chừng ấy kết quả
 * đầu (docs/plan/quy-mo-lon-thiet-ke.md mục 6.1, Q481). Quá mức thì api trả `total` bằng mức này kèm `totalCapped: true`.
 */
export const LIST_TOTAL_CAP = 10_000;
