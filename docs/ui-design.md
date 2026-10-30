# Thiết kế giao diện

> Trạng thái: **accepted** (29/10/2026). Q71–Q75 và Q100–Q110 đều được chủ dự án thống nhất; Q100–Q110 thay các mục cùng tên của Q71–Q75 ở mục 0, 3, 4, 7 và thêm mục 9–12. Đánh giá làm căn cứ ở [ui-review.md](ui-review.md). Bổ sung cho [architecture.md](architecture.md) mục 7 (trải nghiệm làm bài trên điện thoại), không thay đổi các quyết định ở đó. Các quyết định nằm ở [mục cuối](#quyết-định-q100q110).

Các quy tắc dưới đây áp dụng cho mọi trang, từ PR 1b trở đi. Nguồn tham khảo: skill UI UX Pro Max (bộ quy tắc UX và kiểm tra trước khi giao), [WCAG 2.2](https://www.w3.org/TR/WCAG22/) mức AA và tài liệu dark mode của Tailwind CSS v4.

## 0. Vì sao thiết kế lại

Chủ dự án dùng thử lát cắt 1 và nhận xét giao diện chưa chuyên nghiệp, trong khi bảng màu của prototype giao diện Người dự thi (nhánh `prototype/exam-taking-ui`, phương án A "1 câu" và B "Cả đề") đã được chọn và đánh giá tốt ở chế độ tối. Đối chiếu ảnh chụp hai bên cho thấy:

**Màu**
- Giao diện hiện tại dùng bộ màu mặc định của Tailwind (slate + blue-700): không có bản sắc, chế độ tối là nền xanh navy gần đen với liên kết xanh dương chói, lệch hẳn prototype.
- Prototype có bản sắc rõ: **xanh ngọc (teal)** làm màu chủ đạo trên nền trung tính ngả xanh, màu trạng thái (cảnh báo, nguy hiểm, đánh dấu) được chọn riêng, nội dung câu hỏi dùng chữ có chân. Bảng màu này đạt mọi ngưỡng tương phản chữ (≥ 4,5:1) ở cả hai chế độ.
- Hai khu vực của hệ thống (quản trị/Người ra đề và Người dự thi) đang là hai ngôn ngữ thị giác khác nhau.

**Chi tiết giao diện quan sát được trên ảnh chụp** (không chỉ là màu):
1. Thanh điều hướng quản trị xuống 3 hàng trên điện thoại.
2. Dòng đã xử lý vẫn hiện câu gợi ý cũ ("Chưa có tài khoản; sẽ được tạo khi duyệt") cạnh huy hiệu "Đã tạo tài khoản".
3. Huy hiệu "Duyệt một phần" dùng biểu tượng đồng hồ cát (nghĩa "đang chờ").
4. Bộ lọc dòng là năm nút to ngang hàng, chưa có tóm tắt số liệu nhìn nhanh.
5. Trang đăng nhập trống trải: chưa có dấu hiệu thương hiệu.
6. Thao tác chính (Duyệt các dòng hợp lệ) cuộn khuất khỏi màn hình điện thoại khi xem bảng dài.
7. Huy hiệu dùng chữ 12 px, thấp hơn ngưỡng 14 px của chính tài liệu này.

Tài liệu này chưa có phần hợp nhất giao diện Người dự thi (đã chốt A/B ở architecture.md mục 7) với phần còn lại của hệ thống; các quyết định Q100–Q105 ở cuối làm việc đó. Ảnh trước/sau và bản thử nằm ở nhánh `prototype/ui-theme`.

## 1. Nguyên tắc

1. **Yên tĩnh khi làm bài.** Người dự thi đang chịu áp lực thời gian, nên giao diện chỉ làm nổi những thứ cần cho việc làm bài: câu hỏi, lựa chọn, đồng hồ, trạng thái lưu. Không dùng hiệu ứng trang trí, ảnh nền, gradient hay hoạt ảnh khi cuộn trang.
2. **Không chỉ dựa vào màu.** Mọi trạng thái (đã chọn, đánh dấu xem lại, chưa lưu, lỗi, sắp hết giờ) đều có thêm biểu tượng hoặc chữ. Người mù màu và người dùng màn hình kém vẫn phân biệt được.
3. **Điện thoại trước.** Thiết kế ở bề rộng 360 px trước rồi mới mở rộng. Vùng chạm tối thiểu 48 px, cách nhau ít nhất 8 px. Không có thanh cuộn ngang. Không chặn phóng to.
4. **Phản hồi ngay.** Bấm là thấy thay đổi trong 100 ms. Thao tác chờ server thì nút hiện trạng thái đang xử lý và bị vô hiệu cho tới khi xong.
5. **Phong cách:** tối giản, kiểu Swiss: lưới rõ ràng, nhiều khoảng trắng, chữ không chân cho giao diện (chữ có chân chỉ dành cho nội dung đề), độ tương phản cao. Tránh gradient tím/hồng kiểu "AI", emoji làm biểu tượng, và giao diện "vui nhộn" không hợp với việc thi cử.

## 2. Chữ

| Mục | Quy định |
|---|---|
| Font | **Be Vietnam Pro**, thiết kế riêng cho tiếng Việt nên dấu chồng (ặ, ổ, ữ) không bị dính dòng. Tự host bằng gói `@fontsource/be-vietnam-pro`, chỉ lấy bộ ký tự `latin` + `vietnamese`, các độ đậm 400/500/600/700, `font-display: swap`. Không gọi Google Fonts. Giấy phép SIL Open Font License 1.1, miễn phí, được phép tự host và đóng gói (Q72) |
| Font dự phòng | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| Cỡ chữ | Chữ thường 16 px, dòng 1,5. Phần dẫn và Phương án khi làm bài 17 px, dòng 1,6. Không dùng chữ nhỏ hơn 14 px, trừ chú thích phụ (13 px) |
| Số | Đồng hồ, điểm, số câu dùng `tabular-nums` để chữ số không nhảy khi đổi giá trị |
| Độ dài dòng | Tối đa khoảng 70 ký tự (`max-w-prose`) ở trang làm bài trên màn hình rộng |
| Chữ nội dung đề (Q101) | **Noto Serif** (có chân, hợp đọc đoạn dài và công thức) cho phần dẫn, Phương án và Mệnh đề của câu hỏi ở khu làm bài và Xem thử; phần còn lại của giao diện vẫn là Be Vietnam Pro. Tự host `@fontsource/noto-serif`, bộ `latin` + `vietnamese`, độ đậm 400 và 600; **cài cùng lát cắt 4** khi khu làm bài và Xem thử dùng nó lần đầu (chưa màn hình nào hiện có dùng chữ có chân). Người dự thi đổi được sang chữ không chân và đổi cỡ chữ (mục 3.1) |

## 3. Màu và token (Q100)

**Tính cách:** điềm tĩnh, tập trung. Xanh ngọc (teal) là màu chủ đạo duy nhất; nền và chữ là các sắc trung tính ngả xanh (cùng tông với teal) thay vì xám thuần; mỗi trạng thái có một màu riêng, luôn kèm biểu tượng hoặc chữ. Giá trị lấy từ prototype Người dự thi, bổ sung hai token prototype chưa có (`border-strong`, `success`).

Component chỉ dùng **token ngữ nghĩa** (`bg-surface`, `text-fg-muted`, `border-border-strong`...), không dùng thẳng mã hex hay màu của bảng màu. Mỗi token chỉ có hai giá trị (sáng và tối), nên component không viết tiền tố `dark:`.

| Token | Dùng cho | Sáng | Tối |
|---|---|---|---|
| `bg` | Nền trang | `#EDF1F3` | `#0E1519` |
| `surface` | Thẻ, thanh trên cùng, bottom sheet | `#FFFFFF` | `#162027` |
| `surface-raised` | Hộp thoại, menu nổi, vùng nhấn nhẹ | `#FFFFFF` | `#1C2830` |
| `fg` | Chữ chính | `#13212A` | `#E4ECEF` |
| `fg-muted` | Chữ phụ, nhãn | `#566570` | `#97A7B0` |
| `border` | Đường kẻ, viền thẻ (chỉ trang trí) | `#D5DDE2` | `#2A3841` |
| `border-strong` | Viền ô nhập, nút chọn, Phương án chưa chọn | `#7A8B95` | `#6B808B` |
| `primary` | Nút chính, liên kết, Phương án đã chọn, đã làm | `#0E6E5C` | `#41C2A1` |
| `primary-hover` | Nút chính khi rê chuột/nhấn | `#0A5A4B` | `#62D0B4` |
| `on-primary` | Chữ trên nền `primary` | `#FFFFFF` | `#052A21` |
| `primary-soft` / `on-primary-soft` | Nền và chữ của mục đang chọn, huy hiệu "chờ" | `#DCEFEA` / `#0B5546` | `#143A31` / `#A8E6D4` |
| `danger` / `on-danger` / `danger-soft` | Lỗi, Khóa đăng nhập, Xóa, còn 1 phút | `#B42318` / `#FFFFFF` / `#FCE3DF` | `#FF8C7C` / `#2B0905` / `#3D1B17` |
| `warning` / `warning-soft` | Đánh dấu xem lại, còn 5 phút, "một phần" | `#9A5B00` / `#FBEBD0` | `#F2B552` / `#3A2B10` |
| `success` / `success-soft` | "Đã lưu", đã duyệt, thao tác thành công | `#1F6B3A` / `#DDF1E3` | `#6FD18A` / `#173A25` |
| `ring` | Viền focus khi dùng bàn phím | `#0E6E5C` | `#7FDCC3` |

**Độ tương phản đã đo (WCAG 2.2)**, sáng / tối:

| Cặp | Sáng | Tối | Ngưỡng |
|---|---|---|---|
| `fg` trên `bg` / `surface` / `surface-raised` | 14,45 / 16,42 / 16,42 | 15,39 / 13,81 / 12,57 | 4,5 |
| `fg-muted` trên `bg` / `surface` / `surface-raised` | 5,29 / 6,02 / 6,02 | 7,43 / 6,67 / 6,07 | 4,5 |
| `on-primary` trên `primary` / `primary-hover` | 6,17 / 8,15 | 6,96 / 8,24 | 4,5 |
| `primary` làm chữ trên `surface` / `bg` / `primary-soft` | 6,17 / 5,43 / 5,16 | 7,45 / 8,30 / 5,63 | 4,5 |
| `on-primary-soft` trên `primary-soft` | 7,32 | 8,89 | 4,5 |
| `danger` trên `surface` / `danger-soft`; `on-danger` trên `danger` | 6,57 / 5,38; 6,57 | 7,32 / 6,80; 8,12 | 4,5 |
| `warning` trên `surface` / `warning-soft` | 5,43 / 4,62 | 9,06 / 7,51 | 4,5 |
| `success` trên `surface` / `success-soft` | 6,52 / 5,51 | 8,79 / 6,69 | 4,5 |
| `border-strong` trên `surface` / `bg` (viền thành phần) | 3,53 / 3,10 | 4,00 / 4,46 | 3,0 |
| `ring` trên `surface` / `bg` | 6,17 / 5,43 | 10,18 / 11,34 | 3,0 |

`border` (đường kẻ mảnh) chỉ trang trí, không dùng làm ranh giới duy nhất của một thành phần bấm được. Các cặp trên được kiểm tự động trong CI (Q104), nên sửa token làm tụt chuẩn sẽ không qua được.

**Trạng thái câu hỏi** trong lưới số câu (lát cắt 4), mỗi trạng thái có hình riêng chứ không chỉ khác màu:

| Trạng thái | Hiển thị |
|---|---|
| Đã làm | Nền `primary`, chữ `on-primary` (hình tròn ở chế độ "Cả đề", ô vuông bo góc ở lưới số câu) |
| Làm dở (Chùm đúng/sai chưa đủ Mệnh đề) | Nửa ô tô `primary` |
| Chưa làm | Viền `border-strong`, nền trống |
| Đánh dấu xem lại | Thêm biểu tượng cờ, màu `warning` |
| Chưa lưu | Thêm chấm `danger` và biểu tượng mây gạch chéo |

## 4. Chế độ sáng và tối

**Lựa chọn của người dùng:** Theo hệ thống (mặc định), Sáng, Tối. Chọn ở menu tài khoản trên thanh trên cùng, ở trang đăng nhập, và trong menu của trang làm bài (lát cắt 4). Lựa chọn được nhớ trên từng thiết bị (`localStorage`, khóa `exam:theme`), không lưu ở server (Q71).

**Cách làm (Tailwind CSS v4):**

```css
/* apps/web/src/index.css */
@import "tailwindcss";
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

:root { color-scheme: light; --c-bg: #edf1f3; /* ... */ }
[data-theme="dark"] { color-scheme: dark; --c-bg: #0e1519; /* ... */ }

@theme inline {
  --color-bg: var(--c-bg);
  /* ... mọi token ở mục 3 */
}
```

- `<html data-theme="light|dark">` là nguồn duy nhất. Lựa chọn "Theo hệ thống" được quy về `light` hoặc `dark` qua `matchMedia('(prefers-color-scheme: dark)')`, và đổi theo ngay khi hệ điều hành đổi chế độ.
- **Không nháy trắng khi mở trang:** file tĩnh `public/theme-init.js` được tải đồng bộ trong `<head>` của `index.html` và đặt `data-theme` trước khi trang hiển thị. Vì là file riêng chứ không phải script nội tuyến, Content-Security-Policy sau này chỉ cần `script-src 'self'`, không phải bật `unsafe-inline` hay duy trì mã băm.
- `color-scheme` giúp thanh cuộn, ô chọn ngày và các control gốc của trình duyệt đổi theo chế độ. Thẻ `<meta name="theme-color">` được cập nhật theo chế độ, để thanh địa chỉ trên điện thoại cùng màu với thanh trên cùng.
- Chế độ tối không dùng đen tuyệt đối (`#000`), vì chữ trắng trên nền đen dễ bị lóa trên màn hình OLED. Thứ bậc của các lớp nền được thể hiện bằng độ sáng: lớp càng nổi càng sáng (`bg` `#0E1519` → `surface` `#162027` → `surface-raised` `#1C2830`), không dựa vào bóng đổ.
- Hình minh họa trong câu hỏi giữ nguyên màu, đặt trên nền `white` có viền, vì hình vẽ nét đen trên nền trong suốt sẽ biến mất khi nền tối.
- **Kiểm tra:** E2E chụp ảnh các trang chính ở cả hai chế độ. Trước khi giao, kiểm tra độ tương phản riêng cho từng chế độ, không suy từ chế độ sáng.

### 4.1 Tùy chọn hiển thị của Người dự thi (Q102)

Giữ nguyên hai chế độ xem đã chốt ở architecture.md mục 7: **A "1 câu"** và **B "Cả đề"**, chuyển qua lại bất cứ lúc nào bằng nút gạt ở đầu màn hình. Thêm một nút **Aa** cạnh nút gạt mở bảng "Hiển thị" (bottom sheet) để người dự thi tự chọn khi tham gia thi:

| Tùy chọn | Giá trị | Mặc định |
|---|---|---|
| Chế độ xem | 1 câu / Cả đề | Điện thoại: 1 câu; màn hình ≥ 900 px: Cả đề |
| Giao diện | Theo máy / Sáng / Tối | Theo máy |
| Cỡ chữ nội dung | Vừa (100%) / Lớn (115%) / Rất lớn (130%) | Vừa |
| Kiểu chữ nội dung | Có chân (Noto Serif) / Không chân (Be Vietnam Pro) | Có chân |

- Lưu theo thiết bị (`localStorage`, khóa `exam:prefs`), không lưu ở server, không ảnh hưởng bài làm, đồng hồ hay điểm. Đổi được ngay trong lúc thi; bảng có ô xem trước một câu mẫu.
- Cỡ chữ chỉ tác động tới nội dung đề (phần dẫn, Phương án, Mệnh đề, ô tự luận), không phóng to thanh điều khiển, nên đồng hồ và nút Nộp bài giữ vị trí.
- Bảng màu ở mục 3 áp dụng cho cả hai chế độ xem và cả hai giao diện sáng/tối; ảnh chụp bản thử ở nhánh `prototype/ui-theme`.

## 5. Chuyển động

- Đổi trạng thái (chọn Phương án, nhấn nút) dùng hiệu ứng màu và độ mờ trong 150–200 ms, không làm xê dịch bố cục.
- Bottom sheet và hộp thoại trượt hoặc mờ dần trong 200–250 ms.
- Tôn trọng `prefers-reduced-motion`: tắt mọi chuyển động không cần thiết.
- Không dùng thư viện hoạt ảnh (GSAP, Framer Motion). CSS là đủ, và giữ được ngân sách 150 KB JS của trang làm bài.

## 6. Biểu tượng và component

- Biểu tượng SVG từ `lucide-react` (chỉ đóng gói những biểu tượng được import), không dùng emoji (Q73). Nút chỉ có biểu tượng phải có `aria-label`. Biểu tượng nằm cạnh chữ thì `aria-hidden`.
- Component tự viết trong `apps/web/src/lib/ui/`, dùng phần tử HTML gốc: `<dialog>` cho hộp thoại và bottom sheet, `<button>`, `<input>`, `<select>`. Chưa thêm thư viện component như shadcn/ui hay Radix (Q74).
- **Focus:** mọi phần tử bấm được có viền `ring` 2 px khi dùng bàn phím (`focus-visible`). Không bao giờ bỏ viền focus.
- **Biểu mẫu:** nhãn luôn hiển thị, không dùng placeholder thay nhãn. Lỗi hiện ngay dưới trường kèm biểu tượng. Lỗi từ server hiện ở đầu biểu mẫu với `role="alert"`.

## 7. Mẫu dùng cho trang quản trị (PR 1b)

| Tình huống | Cách hiển thị |
|---|---|
| Danh sách (Người dùng, Đơn vị, lịch sử đăng nhập, nhật ký) | Dưới 768 px: danh sách thẻ, mỗi thẻ là một dòng chạm được. Từ 768 px: bảng. Ô tìm kiếm dính ở đầu trang; tìm khi ngừng gõ 300 ms |
| Bộ lọc | Điện thoại: nút "Lọc (n)" mở bottom sheet. Màn hình rộng: hàng bộ lọc phía trên bảng |
| Phân trang | Nút "Trang trước / Trang sau" kèm "1–20 / 134". Trang hiện tại nằm trên URL (`?page=2`), để nút Quay lại hoạt động đúng |
| Thao tác nguy hiểm (Khóa đăng nhập, Xóa người dùng) | Hộp thoại xác nhận nêu rõ hậu quả ("Mọi Phiên đăng nhập của … sẽ bị thu hồi"). Nút xác nhận màu `danger`, ghi đúng tên hành động, không ghi chung chung "OK". Khóa đăng nhập bắt buộc nhập lý do |
| Mật khẩu tạm hiển thị một lần | Hộp thoại hiện mật khẩu bằng font đơn cách cỡ lớn, có nút "Sao chép" và cảnh báo "Mật khẩu chỉ hiển thị lần này". Phải bấm "Tôi đã lưu mật khẩu" mới đóng được |
| Trạng thái người dùng | Huy hiệu có chữ: "Đang hoạt động", "Bị khóa" (biểu tượng ổ khóa, `danger`), "Đã xóa" (gạch ngang, `fg-muted`) |
| Danh sách trống, đang tải | Trống: một dòng giải thích kèm hành động gợi ý. Đang tải: khung xương (skeleton) giữ đúng kích thước, để trang không bị nhảy |

### Bổ sung cho trang quản trị (Q103)

| Tình huống | Cách hiển thị |
|---|---|
| Điều hướng con của khu quản trị / Người ra đề | Một hàng duy nhất, cuộn ngang trên điện thoại (mục đang chọn tự cuộn vào giữa); không bao giờ xuống nhiều hàng |
| Đầu trang danh sách có phân loại (ví dụ dòng của một yêu cầu) | Hàng **chip số liệu** (tên loại + số lượng, bấm để lọc), thay cho các nút to ngang hàng |
| Thao tác chính khi đang chọn dòng | Điện thoại: thanh hành động **dính đáy màn hình** ("Duyệt các dòng hợp lệ (5)", "Duyệt dòng đã chọn (2)"); màn hình rộng: thanh phía trên bảng |
| Dòng đã xử lý | Chỉ hiện kết quả ("Đã tạo tài khoản"), không còn câu gợi ý trạng thái chờ |
| Huy hiệu trạng thái | Chữ ≥ 13 px kèm biểu tượng đúng nghĩa (đã duyệt: dấu tích; một phần: dấu tích nửa/cảnh báo; chờ: đồng hồ cát; lỗi: dấu X) |
| Trang đăng nhập và các trang công khai | Có biểu tượng và tên hệ thống ở đầu thẻ; thẻ đặt cân đối trên nền `bg` |

## 8. Kiểm tra trước khi giao mỗi PR có giao diện

- [ ] Chụp ảnh ở 360 px và 1280 px, cả chế độ sáng và tối (Playwright)
- [ ] Không có thanh cuộn ngang ở 360 px
- [ ] Vùng chạm ≥ 48 px; viền focus nhìn thấy được khi dùng Tab
- [ ] Không có màu hoặc mã hex viết thẳng trong component, chỉ dùng token
- [ ] Test tương phản của bảng token đang xanh (Q104); chữ không nhỏ hơn 13 px (14 px với chữ thường)
- [ ] Mọi chuỗi giao diện nằm trong `vi.json`
- [ ] Trạng thái đang tải, lỗi và danh sách trống đều đã có thiết kế

## 9. Khung ứng dụng (Q106, Q107)

Một khung dùng chung cho Quản trị viên và Người ra đề; Người dự thi dùng khung riêng ở khu làm bài (mục 4.1 và architecture.md mục 7). Bản thử: `prototypes/ui-theme/khung-moi/`.

**Điểm gãy chuẩn:** 360 (điện thoại), 768 (máy tính bảng), 1024 (laptop), 1440 (màn rộng).

| Cỡ màn hình | Điều hướng chính | Thanh trên cùng |
|---|---|---|
| ≥ 1024 px | **Thanh bên** cố định rộng 256 px: thương hiệu, các mục có biểu tượng và nhãn, mục đang chọn tô `primary-soft`. **Ẩn/hiện được** bằng nút biểu tượng ở đầu trang (nhớ theo trình duyệt); ẩn thì thương hiệu chuyển lên thanh trên và nội dung được thêm 256 px | Nút ẩn/hiện thanh bên, chuông thông báo, menu tài khoản |
| < 1024 px | **Thanh tab dưới đáy**, tối đa 5 mục (biểu tượng + nhãn ngắn, cao 64 px, chừa vùng an toàn của máy). Nhiều hơn 5 mục thì 4 mục đầu + "Thêm" mở danh sách còn lại | Thương hiệu, chuông, menu tài khoản |

- **Mục theo vai trò.** Quản trị viên: Người dùng, Yêu cầu cấp tài khoản, Lời mời, Đơn vị, Lịch sử đăng nhập, Nhật ký thao tác (4 đầu + "Thêm" trên điện thoại). Người ra đề (từ lát cắt 2): Ngân hàng câu hỏi, Bộ đề, Phiên thi, Chấm bài, Yêu cầu cấp tài khoản. Thứ tự theo tần suất dùng; nhãn đầy đủ ở thanh bên, nhãn ngắn ở thanh tab (nhãn dài được phép xuống 2 dòng, không bị cắt).
- **Không trộn kiểu điều hướng** ở cùng một cấp: không tab ngang, không thanh bên và thanh tab cùng lúc. Điều hướng trong một mục (ví dụ các tab của một Phiên thi) là tab cuộn ngang trong nội dung trang.
- **Vùng nội dung.** Mặc định rộng tối đa 1152 px (`max-w-6xl`), lề 16/24/32 px theo cỡ màn hình, chừa đáy cho thanh tab. Các màn hình **rộng** (theo dõi phòng thi, chấm bài, soạn câu hỏi, bảng kết quả) được tràn tới 1600 px: route khai báo `staticData: { wide: true }` (kiểu ở `src/lib/static-data.ts`), khung ứng dụng tự nới. Hiện hai route soạn Câu hỏi (`/examiner/questions/new`, `/examiner/questions/$questionId`) dùng cờ này. Kích thước khung (`--app-header-h`, `--app-tabbar-h`) là biến CSS ở `index.css`, dùng chung cho thanh trên, thanh tab, thanh hành động dính đáy và thông báo nổi.
- **Đầu trang:** thành phần `PageHeader`: tiêu đề H1 và hành động chính cùng một hàng; hành động phụ trong menu "…" (xây khi có trang đầu tiên cần). Trang nằm sâu từ 3 cấp trở lên có **đường dẫn** (breadcrumb) ở trên tiêu đề, đã xây ở lát cắt 2 (`src/lib/ui/breadcrumb.tsx`, dùng ở trình soạn: Ngân hàng câu hỏi → Chủ đề → Câu hỏi); các trang khác vẫn chỉ sâu 2 cấp nên dùng liên kết "← Danh sách". Thành phần `Tabs` (`tabs.tsx`, có chế độ `split`: khi vùng nội dung rộng từ 896 px (đo bằng container query, không theo màn hình nên ẩn thanh bên cũng đổi bố cục) thì trải thành hai cột 3:2 cho mẫu Soạn) cũng đã xây; "ngăn bên" chưa tách thành thành phần riêng vì cột Chủ đề của trang Ngân hàng câu hỏi còn là nơi duy nhất dùng, sẽ tách khi có nơi thứ hai.
- **Trạng thái nằm trên URL:** bộ lọc, trang, tab đang mở; nút Quay lại khôi phục đúng vị trí cuộn và bộ lọc.
- Thông báo trên chuông là một vùng `aria-live="polite"` riêng, nói nội dung có ngữ cảnh ("3 thông báo chưa đọc"), không đọc số trần.

## 10. Mẫu trang (Q108)

| Mẫu | Dùng cho | Màn hình ≥ 1024 px | Điện thoại |
|---|---|---|---|
| **Danh sách** | Người dùng, Câu hỏi, Bộ đề, Phiên thi | Thanh tìm và lọc, hàng chip số liệu, bảng (cột ưu tiên, tiêu đề dính), phân trang trên URL | Thẻ; bộ lọc trong bottom sheet; thanh hành động dính đáy khi có dòng được chọn |
| **Chi tiết** | Người dùng, Phiên thi | Đầu trang + tab; cột phụ bên phải | Một cột, tab cuộn ngang |
| **Soạn** | Câu hỏi, Bộ đề | Hai cột: soạn và xem trước đúng như Người dự thi sẽ thấy; trạng thái "Đã lưu" tự động | Hai tab "Soạn" và "Xem trước"; thanh công cụ dính trên bàn phím |
| **Các bước** | Tạo Phiên thi, Phát hành Bộ đề | Chỉ báo bước ở đầu, tóm tắt bên phải | Chỉ báo bước thu gọn "Bước 2/4", nút Tiếp dính đáy |
| **Theo dõi** | Phòng thi thời gian thực | Thanh tóm tắt (đang làm, đã nộp, mất kết nối, vi phạm) + bảng ổn định, hành động trong ngăn kéo bên phải | Thanh tóm tắt dính trên, thẻ lớn, hành động trong bottom sheet; dùng được bằng một tay |
| **Chấm** | Câu tự luận, Phúc khảo | Chia đôi: hàng đợi bài (ẩn tên) và nội dung + ô điểm; phím tắt J/K, nhập điểm bằng bàn phím | Một bài mỗi màn, nút Trước/Sau, tiến độ ở đầu |

Mẫu **Theo dõi** và **Chấm** cần prototype riêng để chủ dự án chọn trước khi lập trình (ghi ở Q110).

## 11. Thành phần dùng chung và mật độ (Q108, Q109)

**Xây trong PR giao diện (Q105):** khung ứng dụng (mục 9), bảng thích ứng `DataList` (thẻ dưới 768 px, bảng từ 768 px, cột ưu tiên ẩn dần ở 768–1023 px, dòng phụ dưới tên thay cho các cột bị ẩn), `FilterBar`, chip số liệu, thanh hành động dính đáy, thông báo nổi (toast), huy hiệu trạng thái đúng nghĩa biểu tượng. **Xây cùng lát cắt cần đến chúng:** ngăn bên/ngăn kéo (2), bước (4), trình soạn (2), kéo thả (3). Chủ đề là danh sách phẳng nên không cần thành phần cây.

- **Thông báo nổi:** nằm phía trên màn hình (dưới thanh trên cùng) để không che thanh tab hay thanh hành động dính đáy; vùng chứa là vùng `aria-live` cố định. Thao tác thành công hiện 4 giây rồi tự mất, không chiếm focus; lỗi cần hành động (`role="alert"`) ở lại cho tới khi bấm đóng. Hộp thoại modal che thông báo nổi, nên phản hồi ngay trong hộp thoại (ví dụ nút Sao chép đổi biểu tượng) không dùng toast.
- **Huy hiệu:** chữ ≥ 13 px, không bị bẻ dòng (`whitespace-nowrap`), luôn có chữ; nhóm chip tự xuống dòng thay vì co nhãn.
- **Mật độ theo thiết bị trỏ (Q109):** thiết bị cảm ứng (`pointer: coarse`) giữ vùng chạm ≥ 48 px; chuột (`pointer: fine`) cho phép hàng bảng cao 40 px và nút 36 px (trên mức tối thiểu 24 px của WCAG 2.2). Không có công tắc mật độ cho người dùng ở giai đoạn này.
- **Cuộn:** tránh vùng cuộn lồng nhau; bảng rộng cuộn ngang trong chính nó và cột đầu (tên) đứng yên. Tiêu đề bảng dính khi cuộn dọc **chưa làm**: danh sách đang phân trang 20 dòng; làm cùng bảng kết quả (lát cắt 5), vì tiêu đề dính cần bảng không nằm trong vùng cuộn ngang.

## 12. Phù hợp theo vai trò

Chi tiết ở [ui-review.md](ui-review.md) mục 3. Tóm lại: Quản trị viên dùng khung thích ứng và các mẫu Danh sách, Chi tiết; Người ra đề dùng thêm Soạn, Các bước, Theo dõi và Chấm; Người dự thi dùng khu làm bài riêng cùng bảng màu (mục 3) và bảng "Hiển thị" (mục 4.1).

## Quyết định (Q71–Q75)

| Câu | Câu hỏi | Quyết định |
|---|---|---|
| Q71 | Lưu lựa chọn sáng/tối ở đâu? | Trên từng thiết bị (`localStorage`), mặc định theo hệ thống. Không cần cột mới trong DB |
| Q72 | Font? | Be Vietnam Pro tự host, chỉ lấy bộ ký tự latin + vietnamese (woff2, khoảng 33 KB mỗi độ đậm: latin 21 KB + vietnamese 12 KB; trình duyệt chỉ tải bộ nào trang cần) |
| Q73 | Bộ biểu tượng? | `lucide-react` |
| Q74 | Có dùng thư viện component không? | Chưa. Tự viết component nhỏ trên phần tử HTML gốc; xem lại khi làm trình soạn câu hỏi (lát cắt 2) |
| Q75 | Làm phần giao diện nền (token, sáng/tối, font, biểu tượng) ở đâu? | Ở commit đầu của PR 1b, rồi chuyển các trang đã có của PR 1a (đăng nhập, đổi mật khẩu, Phiên đăng nhập) sang dùng token |

## Quyết định (Q100–Q110)

| Câu | Câu hỏi | Quyết định | Trạng thái |
|---|---|---|---|
| Q100 | Bảng màu toàn hệ thống? | Dùng **bản sắc prototype Người dự thi** (teal trên nền trung tính ngả xanh) cho mọi khu vực, ở cả sáng và tối; thay bộ slate + blue hiện tại. Giá trị và độ tương phản ở mục 3. Cho `border-strong` đủ 3:1 và thêm `success` xanh lá riêng | accepted |
| Q101 | Font nội dung đề? | Be Vietnam Pro cho giao diện (giữ Q72); **Noto Serif** cho phần dẫn, Phương án, Mệnh đề ở khu làm bài và Xem thử; tự host, `latin` + `vietnamese` | accepted |
| Q102 | Người dự thi tùy chọn gì khi thi? | Giữ hai chế độ A "1 câu" / B "Cả đề"; thêm bảng "Hiển thị" (nút Aa): chế độ xem, giao diện sáng/tối/theo máy, cỡ chữ nội dung 3 mức, kiểu chữ có chân/không chân. Lưu theo thiết bị | accepted |
| Q103 | Mẫu giao diện quản trị v2? | Sửa 7 lỗi ở mục 0, chip số liệu, thanh hành động dính đáy trên điện thoại, trang đăng nhập có dấu hiệu thương hiệu. Điều hướng thay bằng Q106 | accepted |
| Q104 | Giữ bảng màu đạt chuẩn thế nào? | Unit test đọc `index.css`, tính tỉ lệ tương phản các cặp token ở mục 3 cho cả hai chế độ; CI đỏ nếu tụt dưới ngưỡng | accepted |
| Q105 | Làm khi nào? | Một PR giao diện riêng **trước lát cắt 2**; khu làm bài thật dựng ở lát cắt 4 theo prototype và mục 4.1 | accepted |
| Q106 | Khung điều hướng? | Khung thích ứng: thanh bên từ 1024 px, thanh tab dưới đáy (≤ 5 mục, thêm "Thêm") dưới 1024 px; bỏ tab ngang; đường dẫn cho trang từ 3 cấp; Người dự thi có khung riêng | accepted |
| Q107 | Bề rộng nội dung? | Điểm gãy 360/768/1024/1440; mặc định `max-w-6xl`; các màn rộng (theo dõi, chấm, soạn, bảng kết quả) tràn tới 1600 px | accepted |
| Q108 | Mẫu trang và thành phần dùng chung? | Sáu mẫu ở mục 10; PR giao diện chỉ xây phần dùng ngay (khung, `DataList`, `FilterBar`, chip, thanh hành động dính, toast); phần còn lại xây cùng lát cắt cần nó | accepted |
| Q109 | Mật độ? | Cảm ứng ≥ 48 px; chuột cho phép hàng bảng 40 px; chưa có công tắc người dùng | accepted |
| Q110 | Màn hình phức tạp của Người ra đề? | Mẫu Theo dõi (lát cắt 4) và Chấm (lát cắt 5) làm prototype riêng trên nhánh `prototype/*` để chủ dự án chọn trước khi lập trình | accepted |
