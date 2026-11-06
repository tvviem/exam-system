---
status: accepted
---

# Điểm nằm ở bảng riêng của module `grading`, không thêm cột vào `attempts` và `responses`

[data-model.md](../data-model.md) mục 4 dự kiến lát cắt 5 thêm cột điểm vào hai bảng của lát cắt 4: `attempts` (`auto_score`, `manual_score`, `raw_score`, `max_score`, trạng thái `graded`) và `responses` (`auto_score`, `manual_score`, `graded_by`, `graded_at`, `feedback`). Đề xuất bỏ hướng này.

## Lý do

- **Hai bảng đó đã bị khóa bằng trigger (Q217).** `attempts_guard` cấm sửa Lượt đã nộp (ngoại lệ duy nhất là Hoàn tác Buộc nộp), `responses_guard` chỉ cho ghi khi Lượt đang làm. Chấm xảy ra *sau* khi nộp, nên thêm cột điểm buộc phải nới hai trigger đó, tức là làm yếu lớp bảo vệ đang giữ bất biến "Câu trả lời đã nộp không bao giờ đổi".
- **Ranh giới module.** `attempt` sở hữu hai bảng; nếu `grading` ghi điểm vào đó thì phải qua một cổng ghi chỉ để vượt trigger. Bảng điểm do `grading` sở hữu thì module nào cũng đọc/ghi đúng chủ của nó, test kiến trúc `architecture.test.ts` không cần ngoại lệ.
- **Chấm lại không đụng bài làm.** Chấm tự động, chấm tự luận, Phúc khảo và Đính chính đáp án đều ghi đi ghi lại điểm; để ở bảng riêng thì bài làm gốc (`responses`) nguyên vẹn và kiểm chứng được.

## Quyết định đề xuất

- `response_grades (attempt_id, item_id, score, source, graded_by, graded_at, feedback)`: một dòng cho **mỗi câu của Bộ đề** trong mỗi Lượt đã chấm (kể cả câu bỏ trống), `source` là `auto | manual | appeal | correction`.
- `attempt_grades (attempt_id, graded_at)`: dấu "đã chấm tự động xong", để job quét tìm Lượt đã nộp mà chưa chấm.
- Tổng điểm một Lượt **tính khi đọc** (tổng `response_grades.score`); không lưu cột `raw_score` để khỏi có hai nguồn sự thật. Trạng thái "Đã chấm" của Lượt suy ra từ `attempt_grades` và số câu tự luận chưa có điểm, không thêm giá trị `graded` vào `attempts.status`.
- Trạng thái Công bố và Chốt của Phiên thi nằm ở `session_gradings` (module `grading`), không thêm cột `released_at`, `finalized_at`, `appeal_period_hours` vào `sessions`; module `session` đọc qua một cổng chỉ-đọc khi cần hiện nhãn "Đã Công bố", "Đã Chốt".

## Hệ quả

- Phải sửa data-model mục 4 và kiến trúc 5.6 (câu "trạng thái `graded`") khi chủ dự án duyệt.
- Truy vấn bảng Kết quả cần nối `response_grades`; với 500 Lượt × ~50 câu (25.000 dòng) một `GROUP BY` mất vài mili giây, không cần bảng tổng hợp.
- Hoàn tác Buộc nộp cần một cổng để `grading` xóa điểm tự động của Lượt được mở lại (xem [plan/slice-5.md](../plan/slice-5.md), Q296).
