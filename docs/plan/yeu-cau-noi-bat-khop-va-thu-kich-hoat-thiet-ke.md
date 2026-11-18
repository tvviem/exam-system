# Làm nổi bật dòng khớp tài khoản có sẵn và nội dung thư kích hoạt (thiết kế đề xuất)

Trạng thái: **accepted** (chủ dự án đồng ý cả 5 đề xuất ngày 18/11/2026; mục 8 ghi các điều chỉnh khi làm). Ngày đề xuất: 18/11/2026.
Nguồn: góp ý của chủ dự án sau khi thử bản #104–#108 trên production.

## 1. Yêu cầu

1. Khi một Yêu cầu cấp tài khoản vừa có người **đã có tài khoản** vừa có người **mới**, Người ra đề phải thấy ngay những dòng khớp tài khoản có sẵn: nổi bật bằng màu sắc để thu hút sự chú ý.
2. Thư kích hoạt: làm nổi bật **Họ tên** và **mã định danh (tên đăng nhập)**; ghi **tên hệ thống đầy đủ**: "BLUni Exam - Hệ thống thi trực tuyến Trường Đại học Bạc Liêu".

## 2. Hiện trạng (đã đọc mã)

- Huy hiệu ở danh sách: Người mới = màu chính (`primary`, **xanh ngọc** `#0e6e5c`; ứng dụng không có tông xanh dương), **Khớp tài khoản có sẵn = xanh lá (`success`)**, Khớp nhưng khác họ tên và Khôi phục tài khoản đã Xóa = hổ phách (`warning`), Không duyệt được = đỏ.
  Xanh lá thường báo "ổn, không cần xem"; hơn nữa xanh ngọc (Người mới) và xanh lá (khớp có sẵn) là hai màu xanh gần nhau nên khó phân biệt, dòng khớp có sẵn dễ bị lướt qua. Dòng chỉ có huy hiệu và một dòng chữ nhỏ.
- Thư kích hoạt (`mail-templates.ts`): mọi khối là một đoạn chữ thường, không có chỗ nhấn mạnh. Tên hệ thống lấy từ `EMAIL_FROM_NAME` (mặc định "BLUni Exam"), dùng chung làm tên người gửi, nên không thể đặt tên dài ở đó mà không đổi cả tên hiển thị người gửi.

## 3. Phần A: giao diện (Người ra đề và Quản trị viên)

Nguyên tắc (skill UX): không chỉ dùng màu (luôn kèm biểu tượng và chữ), độ tương phản chữ tối thiểu 4,5:1 ở cả giao diện Sáng và Tối, một nhóm màu cho một ý nghĩa.

**A1. Dải tóm tắt phía trên danh sách** (khi có ít nhất một dòng khớp tài khoản có sẵn):

```
┌ ⚠ Có 7 dòng khớp tài khoản có sẵn ───────────────────────┐
│ Những người này đã có tài khoản: họ KHÔNG nhận thư kích   │
│ hoạt mới và thông tin của họ không bị đổi, chỉ được thêm  │
│ vai trò Người dự thi. Hãy kiểm lại mã/email trong file.   │
│ [Chỉ xem 7 dòng này]                                      │
└───────────────────────────────────────────────────────────┘
```

Màu hổ phách, biểu tượng cảnh báo, nút lọc dùng bộ lọc nhóm sẵn có (không thêm API mới nếu lọc theo `matchStatus` đã hỗ trợ; xem mục 5).

**A2. Dòng khớp tài khoản có sẵn nổi bật hẳn so với dòng mới:**

- Dòng của người **đã có tài khoản** (cả ba loại: khớp, khác họ tên, khôi phục): nền hổ phách nhạt và vạch hổ phách đậm ở mép trái; huy hiệu chuyển từ xanh lá sang **hổ phách đậm** có biểu tượng "người đã có".
- Dòng **Người mới**: giữ nền thường, huy hiệu màu chính xanh ngọc như cũ (tương phản có chủ đích: mới = bình thường xanh ngọc, có sẵn = chú ý hổ phách).
- Dòng **Không duyệt được**: giữ đỏ.
- Phân biệt ba loại khớp bằng **chữ của huy hiệu** (Khớp tài khoản có sẵn / Khớp nhưng khác họ tên / Khôi phục tài khoản đã Xóa) và dòng phụ đã có, không bằng ba màu khác nhau.

**A3. Lưu ý.** Người ra đề vẫn không thấy chi tiết tài khoản có sẵn (họ tên, email thật): giữ quyết định đã duyệt ở `yeu-cau-giao-dien-duyet-thiet-ke.md`. Chỉ thêm màu, dải tóm tắt và câu giải thích hậu quả.

## 4. Phần B: thư kích hoạt

**B1. Tên hệ thống đầy đủ.** Thêm biến cấu hình mới `EMAIL_SYSTEM_NAME`, mặc định **"BLUni Exam - Hệ thống thi trực tuyến Trường Đại học Bạc Liêu"**. `EMAIL_FROM_NAME` giữ nguyên (tên người gửi, ngắn). Production không cần đổi `api.env` vì có mặc định; muốn đổi thì đặt biến.

**B2. Bố cục thư (HTML, kiểu thẻ thông tin):**

```
┌──────────────────────────────────────────────────────────┐
│ BLUni Exam                                                │   ← đầu thư, chữ đậm lớn
│ Hệ thống thi trực tuyến Trường Đại học Bạc Liêu           │
├──────────────────────────────────────────────────────────┤
│ Chào Lý Nhật Nam,                                         │
│ Một tài khoản đã được tạo cho bạn trên BLUni Exam - Hệ    │
│ thống thi trực tuyến Trường Đại học Bạc Liêu.             │
│ ┌ Thông tin tài khoản ───────────────────────────────┐   │
│ │ Họ tên:        **Lý Nhật Nam**                      │   │
│ │ Tên đăng nhập: **b2103456**   (mã định danh)        │   │
│ └─────────────────────────────────────────────────────┘   │
│ [   Kích hoạt tài khoản   ]   ← nút màu chính             │
│ Hoặc mở liên kết: https://...                             │
│ Liên kết có hiệu lực đến **14:35 ngày 18/11/2026**. ...   │
└──────────────────────────────────────────────────────────┘
```

- **Họ tên** và **tên đăng nhập** in đậm, trong thẻ có viền (không dựa vào màu nền, vì nhiều ứng dụng thư tự đảo màu ở chế độ tối); tên đăng nhập dùng chữ đơn cách (monospace) để dễ chép và không nhầm `0`/`O`.
- Nút "Kích hoạt tài khoản" là liên kết dạng nút (viền và nền inline-style); **giữ lại đường dẫn dạng chữ** bên dưới để chép khi nút không hiện.
- Giờ hết hạn in đậm.
- Bản **văn bản thuần** có cùng nội dung: dòng "Họ tên: ..." và "Tên đăng nhập (mã định danh): ..." riêng từng dòng.
- Tiêu đề thư giữ ngắn: `Kích hoạt tài khoản BLUni Exam` (tên đầy đủ đặt ở thân thư; tiêu đề dài bị cắt ở điện thoại và dễ bị lọc rác).
- Mọi giá trị người dùng vẫn qua `escapeHtml`; tiêu đề vẫn một dòng.

**B3. Phạm vi.** Tên hệ thống đầy đủ ở **mọi loại thư** (nhất quán). Thẻ thông tin "Họ tên + Tên đăng nhập" ở thư **kích hoạt và lời mời** (hai loại có tên đăng nhập). Các thư đặt lại mật khẩu, đổi email, mật khẩu đã đổi giữ nội dung, chỉ đổi tên hệ thống.

## 5. Kiểm thử đề xuất (TDD: viết trước, thấy đỏ)

| # | Nơi | Kiểm gì |
|---|---|---|
| T-13 | `mail-templates.test.ts` | Thư kích hoạt: HTML chứa tên đầy đủ, Họ tên và tên đăng nhập nằm trong thẻ đậm riêng, có nút với `href` đúng và vẫn có URL dạng chữ; bản thuần có hai dòng nhãn riêng |
| T-14 | cùng file | Giá trị độc hại (họ tên, tên đăng nhập, tên hệ thống) vẫn bị thoát ký tự; tiêu đề không xuống dòng |
| T-15 | cùng file | Thư lời mời có thẻ thông tin; thư đặt lại mật khẩu không có thẻ nhưng có tên hệ thống đầy đủ |
| T-16 | `mail.config.test.ts` | `EMAIL_SYSTEM_NAME` có mặc định đúng; đặt biến thì dùng biến; `EMAIL_FROM_NAME` không bị ảnh hưởng |
| E-xx | E2E + ảnh chụp | Người ra đề thấy dải tóm tắt và dòng nổi bật khi Yêu cầu có cả người mới lẫn người có sẵn; không có dải khi toàn người mới; lọc "chỉ xem" đúng số dòng; không cuộn ngang ở 375 px; bộ quét `ui-layout` vẫn xanh |
| U-xx | web unit | Hàm quyết định "dòng thuộc nhóm có sẵn" đúng với năm giá trị `matchStatus`; độ tương phản hai giao diện đạt 4,5:1 (kiểm bằng số) |
| M | đột biến | Đổi tông huy hiệu về xanh lá, bỏ thoát HTML, bỏ nút/đường dẫn chữ, bỏ tên đầy đủ: mỗi cái phải làm một bài đỏ |

## 6. Câu cần chủ dự án quyết

1. **Tiêu đề thư** giữ ngắn ("Kích hoạt tài khoản BLUni Exam"), tên đầy đủ ở thân thư? *(đề xuất: đồng ý)*
2. **Biến mới** `EMAIL_SYSTEM_NAME` có mặc định đầy đủ, `EMAIL_FROM_NAME` giữ nguyên, production không phải đổi cấu hình? *(đề xuất: đồng ý)*
3. **Nhãn tên đăng nhập** trong thư: "Tên đăng nhập (mã định danh)". Với Người ra đề, tên đăng nhập không phải mã nên nhãn "mã định danh" không đúng; chấp nhận nhãn chung này, hay chỉ ghi "Tên đăng nhập"? *(đề xuất: "Tên đăng nhập", thêm "(mã định danh)" chỉ cho thư kích hoạt; thư lời mời chỉ "Tên đăng nhập")*
4. **Màu cho dòng có sẵn:** cả ba loại khớp dùng chung một màu hổ phách nổi bật, phân biệt bằng chữ huy hiệu; Người mới giữ màu chính xanh ngọc? *(đề xuất: đồng ý)*
5. **Dải tóm tắt** có nút "Chỉ xem N dòng này"? *(đề xuất: có)*

## 7. Ngoài phạm vi

Không đổi logic duyệt/khôi phục, không đổi quyền xem chi tiết của Người ra đề, không gửi lại thư đã gửi (thư mới mang bố cục mới, thư cũ giữ nguyên).

## 8. Điều chỉnh khi làm (sau khi duyệt)

1. **Nhãn tên đăng nhập theo dữ liệu.** Mã cho thấy tên đăng nhập của tài khoản tạo từ Yêu cầu là *mã định danh viết thường nếu có mã, nếu không thì là email* (`account-request-approve.job.ts`), và tài khoản khôi phục giữ tên đăng nhập cũ. Nên thư kích hoạt chỉ ghi "Tên đăng nhập (mã định danh)" khi tên đăng nhập bằng mã của người đó (không phân biệt hoa thường); còn lại chỉ ghi "Tên đăng nhập". Thư lời mời hiện không có tên đăng nhập (người được mời tự chọn khi nhận), nên thẻ chỉ có Họ tên.
2. **Một liên kết duy nhất trong thư.** Quy tắc đã duyệt ở Q382 (bài T-07): đúng một liên kết, chữ hiển thị trùng đích. Vì vậy không có nút nhãn "Kích hoạt tài khoản" kèm URL riêng; thay bằng một liên kết duy nhất hiển thị đúng URL, trình bày dạng khối viền đậm, kèm dòng dẫn in đậm.
3. **Tra cứu skill UX/UI cho phần màu** (18/11/2026): không chỉ dùng màu (luôn kèm biểu tượng và chữ); chữ phải đạt 4,5:1; nhãn huy hiệu không được xuống dòng (nowrap, nhãn dài như "Khôi phục tài khoản đã Xóa" phải nằm một dòng ở 375 px); dải tóm tắt tĩnh dùng `role="note"`. Bảng màu hiện có: chữ cảnh báo trên nền cảnh báo nhạt đạt **4,62:1 (Sáng)** và **7,51:1 (Tối)**. Nền dòng dùng `--c-warning-soft` pha loãng, chữ giữ `--c-fg`; vạch trái dùng `--c-warning`.
