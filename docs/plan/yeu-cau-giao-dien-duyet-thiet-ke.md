# Thiết kế lại giao diện duyệt Yêu cầu cấp tài khoản (Quản trị viên)

**Trạng thái: ĐÃ DUYỆT (17/11/2026: a, b, c, d, e) và ĐÃ LÀM XONG, chờ PR (mục 7).** Xuất phát từ ba nhận xét của chủ dự án khi thử trên production: (1) chi tiết tài khoản bị khớp hiển thị quá dài ngay trong danh sách; (2) nên mở bằng hộp thoại chi tiết; (3) việc "duyệt" và "khôi phục" trên giao diện khá nhập nhằng.

Căn cứ: các quy tắc của skill UX/UI đã tra: `primary-action` (mỗi màn hình một nút chính, nút phụ yếu hơn), `progressive-disclosure` (chi tiết hiện dần, không dồn lên trước), `confirmation-dialogs` và `destructive-emphasis` (việc không hoàn tác được phải có xác nhận và tách khỏi nút chính), `color-not-only` (trạng thái luôn kèm chữ hoặc biểu tượng), `modal-escape` (hộp thoại luôn có cách đóng), `truncation-strategy` (ưu tiên xuống dòng, chi tiết đầy đủ ở nơi mở rộng), `success-feedback`.

## 1. Những chỗ nhập nhằng hiện nay (đo trên ảnh chụp thật)

| # | Vấn đề | Hệ quả |
|---|---|---|
| 1 | **Hai nút duyệt cùng lúc** ("Duyệt các dòng hợp lệ (N)" và "Duyệt dòng đã chọn (N)") cộng "Từ chối yêu cầu" nằm trong cùng thanh dính | người duyệt không biết nút nào làm gì; dòng khôi phục bị bỏ qua lặng lẽ ở nút đầu |
| 2 | **Ô tick trên mọi dòng** vừa là "chọn để duyệt" vừa phải bật cho dòng khôi phục | quy tắc ngầm: dòng thường duyệt hàng loạt, dòng đặc biệt phải tick |
| 3 | **Bảng đối chiếu mở sẵn trong từng dòng** (4 trường, trạng thái, khớp theo, vai trò) | mỗi dòng cao hơn một màn hình điện thoại; khó lướt cả danh sách |
| 4 | Sau lần duyệt đầu, trạng thái Yêu cầu vẫn là "Chờ duyệt" | người duyệt không biết còn việc gì |
| 5 | Một đoạn chú thích dài ("Có N dòng khôi phục… KHÔNG nằm trong…") phải đọc mới hiểu | giải thích bằng chữ thay vì bố cục |

## 2. Đề xuất: ba nhóm việc, mỗi nhóm một cách quyết định

Bỏ cách "tick rồi chọn nút". Các dòng được chia theo **việc cần làm**, dùng đúng thuật ngữ: **Sẵn sàng duyệt** (Người mới, Khớp tài khoản có sẵn), **Cần xác nhận** (Khôi phục tài khoản đã Xóa, Khớp nhưng khác họ tên), **Không duyệt được**.

```text
┌ khoi-phuc.csv   [Chờ duyệt: còn 2 dòng cần xác nhận] ───────────────┐
│ Gửi bởi Giảng viên A · 17/11 09:16 · 5 dòng                          │
│                                                                      │
│ ┌ Sẵn sàng duyệt ┐ ┌ Cần xác nhận ┐ ┌ Không duyệt được ┐             │
│ │   3 dòng       │ │   2 dòng     │ │      0 dòng      │  ← bấm để lọc│
│ └────────────────┘ └──────────────┘ └──────────────────┘             │
│                                                                      │
│ Dòng | Họ tên | Mã · Email | Lớp | Kết quả                           │
│  2   | Phạm A | …          | K21 | ● Người mới                       │
│  3   | Sinh V | …          | K22 | ↺ Khôi phục · khác: email, lớp [Xem đối chiếu] │
│  4   | Lê C   | …          | K21 | ⚠ Khác họ tên                [Xem đối chiếu] │
│                                                       [⋯ Từ chối dòng]│
│                                                                      │
│ ───────── thanh dưới (một nút chính) ─────────────────────────────── │
│ [ Duyệt 3 dòng sẵn sàng ]                      [⋯ Từ chối yêu cầu]   │
└──────────────────────────────────────────────────────────────────────┘
```

1. **Một nút chính duy nhất** ở thanh dưới: "Duyệt N dòng sẵn sàng". Nó chỉ làm đúng một việc, tên nút nêu số dòng. "Từ chối yêu cầu" xuống menu phụ (⋯), tách khỏi nút chính.
2. **Dòng "Cần xác nhận" quyết định ngay trong hộp thoại** (mục 3), không dùng ô tick, nên không còn quy tắc ngầm. Dòng chưa quyết hiện nút **[Xem đối chiếu]**; quyết xong thì thành "Đã khôi phục" hoặc "Bị từ chối".
3. **Mỗi dòng đang chờ có menu ⋯ "Từ chối dòng"** (thay cho việc bỏ tick): muốn loại một dòng trong nhóm sẵn sàng thì từ chối dòng đó trước khi bấm nút chính.
4. **Danh sách gọn:** mỗi dòng chỉ có huy hiệu (chữ và biểu tượng, không chỉ màu) và **một dòng phụ ngắn** (ví dụ "khác: email, lớp"). Chi tiết dài chuyển hết vào hộp thoại.
5. **Trạng thái Yêu cầu nói rõ việc còn lại:** "Chờ duyệt: còn 2 dòng cần xác nhận" thay cho "Chờ duyệt" chung chung.
6. **Bỏ đoạn chú thích dài**; ba thẻ tóm tắt ở trên thay cho nó (bấm thẻ để lọc, thay hàng chip).

## 3. Hộp thoại "Đối chiếu dòng N" (chi tiết người dùng)

```text
┌ Đối chiếu dòng 3: Sinh Viên Khôi Phục ─────────────────[Đóng ✕]┐
│ ↺ Khớp tài khoản đã Xóa                                        │
│ Đã Xóa lúc 13/11/2026 bởi Quản trị Khôi phục · khớp theo: mã   │
│ Vai trò hiện có: Người dự thi                                  │
│                                                                │
│            Trong file             Tài khoản có sẵn             │
│ Họ tên     Sinh Viên Khôi Phục    Sinh Viên Khôi Phục    ✓     │
│ Mã         KP-001                 KP-001                 ✓     │
│ Email      moi@x.vn               cu@x.vn            ⚠ Khác    │
│ Lớp        K22                    K21                ⚠ Khác    │
│                                                                │
│ Nếu khôi phục:                                                 │
│  • giữ nguyên lịch sử và điểm cũ (cùng tài khoản)              │
│  • về Chờ kích hoạt, mật khẩu cũ bị xóa                        │
│  • gửi thư kích hoạt tới moi@x.vn                              │
│                                                                │
│ [Mở trang tài khoản]                                           │
│ ─────────────────────────────────────────────────────────────  │
│ [ Khôi phục tài khoản ]   [ Từ chối dòng ]        [ Để sau ]   │
└────────────────────────────────────────────────────────────────┘
```

- Dùng `Dialog` hiện có (hộp thoại gốc của trình duyệt: bẫy focus, Esc, và **bottom sheet trên điện thoại**), nên có cách đóng rõ ràng.
- **Nút bấm trong hộp thoại chính là bước xác nhận** (nêu rõ hậu quả ngay phía trên), không thêm hộp thoại thứ hai.
- Dòng "Khác họ tên" dùng cùng hộp thoại, nhãn nút đổi thành **"Đúng là người này"**; dòng Người mới, Khớp có sẵn và Không duyệt được mở được hộp thoại chỉ để xem (không có nút quyết định, trừ "Từ chối dòng").
- Bảng so sánh ở máy tính có hai cột (hộp thoại rộng nên không bị ngắt chữ như bản hiện tại); ở điện thoại xếp dọc từng trường.
- Phản hồi: thông báo ngắn sau khi quyết ("Đã khôi phục Sinh Viên Khôi Phục; thư kích hoạt sẽ gửi tới moi@x.vn"), rồi tự mở dòng cần xác nhận kế tiếp nếu còn (có nút "Để sau" và đóng bất cứ lúc nào).

## 4. Người ra đề

Không đổi quyền xem: chỉ thấy "Đang chờ Quản trị viên xác nhận" ở dòng cần xác nhận, không thấy chi tiết tài khoản bị khớp. Ba thẻ tóm tắt dùng cùng tên gọi nhưng chỉ để đọc.

## 5. Điều cần chủ dự án quyết

| # | Câu hỏi | Đề nghị |
|---|---|---|
| a | Bỏ ô tick, thay bằng "Duyệt N dòng sẵn sàng" + quyết từng dòng trong hộp thoại + menu "Từ chối dòng"? | **Có.** Lựa chọn khác (giữ ô tick): ít thay đổi nhưng vẫn giữ quy tắc ngầm khiến nhập nhằng |
| b | Có thêm nút "Khôi phục tất cả N dòng" cho trường hợp nhiều dòng khôi phục đã đọc kỹ? | **Chưa.** Khôi phục là hiếm; mỗi dòng nên được nhìn. Thêm sau nếu cần |
| c | Ba thẻ tóm tắt thay hàng chip lọc? | **Có** (cùng chức năng lọc, ít ồn hơn, đúng thuật ngữ nhóm việc) |
| d | Hộp thoại tự chuyển sang dòng cần xác nhận kế tiếp? | **Có**, kèm "Để sau" và đóng bất cứ lúc nào |

## 6. Kiểm thử dự kiến (khi được duyệt)

Làm theo TDD: E2E (máy tính và điện thoại) viết trước và thấy đỏ: (1) chỉ một nút chính ở thanh dưới; (2) dòng cần xác nhận không có ô tick, có "Xem đối chiếu" mở hộp thoại; (3) khôi phục trong hộp thoại, kết quả "Đã khôi phục" và trạng thái Yêu cầu đổi; (4) từ chối dòng qua menu; (5) danh sách không có bảng chi tiết nhúng, không cuộn ngang, không bị che; (6) Người ra đề không thấy chi tiết. API giữ nguyên (đã có R-01 đến R-11); thêm bài API nếu cần trường mới (ví dụ danh sách "khác ở trường nào" để hiện dòng phụ).

## 7. Kết quả triển khai (17/11/2026)

- **API:** chi tiết Yêu cầu có `groups` (`ready`, `confirm`, `blocked`; tổng và còn chờ) và danh sách dòng lọc được theo `group` (R-21 đến R-23, đỏ rồi xanh).
- **Giao diện:** ba thẻ nhóm việc (bấm để lọc) thay hàng chip; "Chờ duyệt: còn N dòng cần xác nhận" ở tiêu đề; **một nút chính** "Duyệt N dòng sẵn sàng" ở thanh dưới, "Từ chối yêu cầu" trong menu "⋯"; bỏ ô tick; mỗi dòng chỉ một huy hiệu và một dòng phụ ngắn ("So với tài khoản có sẵn, khác: email, lớp"); nút "Xem và xác nhận" (dòng cần quyết) hoặc "Xem đối chiếu" mở **hộp thoại "Đối chiếu dòng N"**: trạng thái và ai Xóa lúc nào, khớp theo gì, vai trò, từng trường (trường giống chỉ một dòng kèm "Giống"; trường khác mở rộng hai giá trị kèm "Khác"), hậu quả của việc duyệt, nút **Khôi phục tài khoản / Đúng là người này**, **Từ chối dòng**, **Để sau** (hàng nút dính đáy hộp thoại); quyết xong tự chuyển sang dòng cần xác nhận kế tiếp. Menu "⋯" từ chối từng dòng. Người ra đề chỉ thấy thẻ nhóm, huy hiệu và "Đang chờ Quản trị viên xác nhận".
- **E2E (đỏ trước, xanh sau, máy tính và điện thoại):** `account-request-restore.spec.ts` (thẻ nhóm, không ô tick, chi tiết không nằm trong danh sách, hộp thoại đối chiếu và khôi phục; từ chối dòng và "Để sau"), `account-requests.spec.ts`, `activation-tracking.spec.ts` cập nhật theo nhãn mới.
- **Lỗi thật phát hiện nhờ E2E:** menu "⋯" của thanh dưới trên điện thoại bị **thanh tab che** (không bấm được): menu `fixed z-50` nằm trong thanh dính `z-10` nên kẹt lớp xếp chồng. Sửa ở `RowMenu`: dựng menu qua portal, gắn vào `<dialog>` cha nếu có (để vẫn hiện trên hộp thoại), không thì vào `<body>`. Các bài dùng menu trong hộp thoại (Danh sách dự thi) vẫn xanh.
- **Phát hiện khi chụp ảnh thật và đã sửa:** bảng đối chiếu bản đầu dài (mỗi trường 4 dòng kể cả trường giống), hàng nút cuối hộp thoại bị cắt khi hộp thoại cuộn, tên bị ngắt giữa chữ, hai nút chính cùng hiện (nút ở dòng và nút ở thanh dưới; nút ở dòng chuyển sang kiểu phụ).
