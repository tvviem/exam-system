# Thiết kế giao diện

> Trạng thái: **accepted** (29/10/2026, Q71–Q75 theo khuyến nghị). Bổ sung cho [architecture.md](architecture.md) mục 7 (trải nghiệm làm bài trên điện thoại), không thay đổi các quyết định ở đó. Các quyết định nằm ở [mục cuối](#quyết-định-q71q75).

Các quy tắc dưới đây áp dụng cho mọi trang, từ PR 1b trở đi. Nguồn tham khảo: skill UI UX Pro Max (bộ quy tắc UX và kiểm tra trước khi giao), [WCAG 2.2](https://www.w3.org/TR/WCAG22/) mức AA và tài liệu dark mode của Tailwind CSS v4.

## 1. Nguyên tắc

1. **Yên tĩnh khi làm bài.** Người dự thi đang chịu áp lực thời gian, nên giao diện chỉ làm nổi những thứ cần cho việc làm bài: câu hỏi, lựa chọn, đồng hồ, trạng thái lưu. Không dùng hiệu ứng trang trí, ảnh nền, gradient hay hoạt ảnh khi cuộn trang.
2. **Không chỉ dựa vào màu.** Mọi trạng thái (đã chọn, đánh dấu xem lại, chưa lưu, lỗi, sắp hết giờ) đều có thêm biểu tượng hoặc chữ. Người mù màu và người dùng màn hình kém vẫn phân biệt được.
3. **Điện thoại trước.** Thiết kế ở bề rộng 360 px trước rồi mới mở rộng. Vùng chạm tối thiểu 48 px, cách nhau ít nhất 8 px. Không có thanh cuộn ngang. Không chặn phóng to.
4. **Phản hồi ngay.** Bấm là thấy thay đổi trong 100 ms. Thao tác chờ server thì nút hiện trạng thái đang xử lý và bị vô hiệu cho tới khi xong.
5. **Phong cách:** tối giản, kiểu Swiss: lưới rõ ràng, nhiều khoảng trắng, chữ không chân, độ tương phản cao. Tránh gradient tím/hồng kiểu "AI", emoji làm biểu tượng, và giao diện "vui nhộn" không hợp với việc thi cử.

## 2. Chữ

| Mục | Quy định |
|---|---|
| Font | **Be Vietnam Pro**, thiết kế riêng cho tiếng Việt nên dấu chồng (ặ, ổ, ữ) không bị dính dòng. Tự host bằng gói `@fontsource/be-vietnam-pro`, chỉ lấy bộ ký tự `latin` + `vietnamese`, các độ đậm 400/500/600/700, `font-display: swap`. Không gọi Google Fonts. Giấy phép SIL Open Font License 1.1, miễn phí, được phép tự host và đóng gói (Q72) |
| Font dự phòng | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| Cỡ chữ | Chữ thường 16 px, dòng 1,5. Phần dẫn và Phương án khi làm bài 17 px, dòng 1,6. Không dùng chữ nhỏ hơn 14 px, trừ chú thích phụ (13 px) |
| Số | Đồng hồ, điểm, số câu dùng `tabular-nums` để chữ số không nhảy khi đổi giá trị |
| Độ dài dòng | Tối đa khoảng 70 ký tự (`max-w-prose`) ở trang làm bài trên màn hình rộng |

## 3. Màu và token

Component chỉ dùng **token ngữ nghĩa** (`bg-surface`, `text-fg-muted`, `border-border-strong`...), không dùng thẳng màu của bảng màu (`bg-slate-50`) hay mã hex. Nhờ vậy mỗi token chỉ cần định nghĩa hai giá trị, một cho sáng và một cho tối, và component không phải viết tiền tố `dark:`.

| Token | Dùng cho | Sáng | Tối |
|---|---|---|---|
| `bg` | Nền trang | slate-50 | slate-950 |
| `surface` | Thẻ, thanh trên cùng, bottom sheet | white | slate-900 |
| `surface-raised` | Hộp thoại, menu nổi | white | slate-800 |
| `fg` | Chữ chính | slate-900 | slate-100 |
| `fg-muted` | Chữ phụ, nhãn | slate-600 | slate-400 |
| `border` | Đường kẻ, viền thẻ (trang trí) | slate-200 | slate-800 |
| `border-strong` | Viền ô nhập, Phương án chưa chọn | slate-500 | slate-500 |
| `primary` | Nút chính, liên kết, Phương án đã chọn | blue-700 | blue-400 |
| `on-primary` | Chữ trên nền `primary` | white | slate-950 |
| `primary-soft` / `on-primary-soft` | Nền và chữ của Phương án đã chọn, mục đang chọn | blue-50 / blue-800 | blue-950 / blue-200 |
| `danger` | Lỗi, Khóa đăng nhập, Xóa, còn 1 phút | red-700 | red-400 |
| `warning` | Đánh dấu xem lại, còn 5 phút | amber-800 trên amber-50 | amber-300 |
| `success` | "Đã lưu", thao tác thành công | green-700 | green-400 |
| `ring` | Viền focus khi dùng bàn phím | blue-600 | blue-300 |

Độ tương phản đã đo (WCAG 2.2): chữ thường đều ≥ 4,5:1 ở cả hai chế độ. Thấp nhất là `fg-muted` trên `surface-raised` ở chế độ tối: 5,71:1. `border-strong` đạt 4,76:1 (sáng) và 3,75:1 (tối), trên mức 3:1 mà WCAG 1.4.11 yêu cầu cho viền thành phần nhập liệu. `border` chỉ dùng để trang trí, không dùng làm ranh giới duy nhất của một thành phần bấm được.

**Trạng thái câu hỏi** trong lưới số câu (lát cắt 4), mỗi trạng thái có hình riêng chứ không chỉ khác màu:

| Trạng thái | Hiển thị |
|---|---|
| Đã làm | Nền `primary`, chữ `on-primary` |
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

:root { color-scheme: light; --c-bg: var(--color-slate-50); /* ... */ }
[data-theme="dark"] { color-scheme: dark; --c-bg: var(--color-slate-950); /* ... */ }

@theme inline {
  --color-bg: var(--c-bg);
  /* ... mọi token ở mục 3 */
}
```

- `<html data-theme="light|dark">` là nguồn duy nhất. Lựa chọn "Theo hệ thống" được quy về `light` hoặc `dark` qua `matchMedia('(prefers-color-scheme: dark)')`, và đổi theo ngay khi hệ điều hành đổi chế độ.
- **Không nháy trắng khi mở trang:** file tĩnh `public/theme-init.js` được tải đồng bộ trong `<head>` của `index.html` và đặt `data-theme` trước khi trang hiển thị. Vì là file riêng chứ không phải script nội tuyến, Content-Security-Policy sau này chỉ cần `script-src 'self'`, không phải bật `unsafe-inline` hay duy trì mã băm.
- `color-scheme` giúp thanh cuộn, ô chọn ngày và các control gốc của trình duyệt đổi theo chế độ. Thẻ `<meta name="theme-color">` được cập nhật theo chế độ, để thanh địa chỉ trên điện thoại cùng màu với thanh trên cùng.
- Chế độ tối không dùng đen tuyệt đối (`#000`), vì chữ trắng trên nền đen dễ bị lóa trên màn hình OLED. Thứ bậc của các lớp nền được thể hiện bằng độ sáng: lớp càng nổi càng sáng (slate-950 → 900 → 800), không dựa vào bóng đổ.
- Hình minh họa trong câu hỏi giữ nguyên màu, đặt trên nền `white` có viền, vì hình vẽ nét đen trên nền trong suốt sẽ biến mất khi nền tối.
- **Kiểm tra:** E2E chụp ảnh các trang chính ở cả hai chế độ. Trước khi giao, kiểm tra độ tương phản riêng cho từng chế độ, không suy từ chế độ sáng.

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

## 8. Kiểm tra trước khi giao mỗi PR có giao diện

- [ ] Chụp ảnh ở 360 px và 1280 px, cả chế độ sáng và tối (Playwright)
- [ ] Không có thanh cuộn ngang ở 360 px
- [ ] Vùng chạm ≥ 48 px; viền focus nhìn thấy được khi dùng Tab
- [ ] Không có màu hoặc mã hex viết thẳng trong component, chỉ dùng token
- [ ] Mọi chuỗi giao diện nằm trong `vi.json`
- [ ] Trạng thái đang tải, lỗi và danh sách trống đều đã có thiết kế

## Quyết định (Q71–Q75)

| Câu | Câu hỏi | Quyết định |
|---|---|---|
| Q71 | Lưu lựa chọn sáng/tối ở đâu? | Trên từng thiết bị (`localStorage`), mặc định theo hệ thống. Không cần cột mới trong DB |
| Q72 | Font? | Be Vietnam Pro tự host, chỉ lấy bộ ký tự latin + vietnamese (woff2, khoảng 33 KB mỗi độ đậm: latin 21 KB + vietnamese 12 KB; trình duyệt chỉ tải bộ nào trang cần) |
| Q73 | Bộ biểu tượng? | `lucide-react` |
| Q74 | Có dùng thư viện component không? | Chưa. Tự viết component nhỏ trên phần tử HTML gốc; xem lại khi làm trình soạn câu hỏi (lát cắt 2) |
| Q75 | Làm phần giao diện nền (token, sáng/tối, font, biểu tượng) ở đâu? | Ở commit đầu của PR 1b, rồi chuyển các trang đã có của PR 1a (đăng nhập, đổi mật khẩu, Phiên đăng nhập) sang dùng token |
