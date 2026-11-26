# Mã lệnh trong Câu hỏi (thiết kế đề xuất)

**Trạng thái: `accepted`** (chủ dự án duyệt Q490–Q497 theo đề xuất ngày 26/11/2026, mục 8). Tiến độ: **M0** (mục 3, #177) và **M1** (mục 5, #178) đã lên prod ngày 26/11/2026; **M2** (mục 4.3, 4.4) xong về mã. Còn soạn lại bộ câu hỏi Cấu trúc dữ liệu (Q497).

## 1. Yêu cầu

Câu hỏi của các học phần lập trình (ví dụ Cấu trúc dữ liệu) có **mã lệnh** trong Phần dẫn, Phương án và Mệnh đề: cả một đoạn nhiều dòng, cả một mẩu ngắn xen trong câu. Người dự thi, chủ yếu dùng điện thoại, phải đọc đúng và phân biệt được mã với văn bản thường. Dùng được cho nhiều ngôn ngữ, kể cả ngôn ngữ mà thụt lề mang nghĩa (Python).

## 2. Hiện trạng

Nội dung câu hỏi là JSON theo schema giới hạn (Q114, `packages/shared/src/rich-text.ts`): đoạn văn, danh sách, công thức, Hình minh họa. **Không có khối mã và mã trong dòng**; trình soạn tắt cả hai.

| Lỗi | Nguyên nhân | Đã kiểm |
|---|---|---|
| Mất thụt lề khi hiển thị (dữ liệu vẫn giữ) | đoạn văn dựng bằng `<p>` mặc định, gộp khoảng trắng | dựng thử bằng CSS thật, khung 360 px |
| Dòng dài gãy giữa toán tử (`p-` / `>Next`) | trình duyệt được phép ngắt sau dấu `-` | dựng thử |
| Chữ không đều nét, mã lẫn vào câu văn | không có kiểu chữ riêng | dựng thử |
| Gõ **hoặc dán** `*...*`, `_..._` trong trình soạn thành chữ nghiêng, đậm, mất dấu (`int *p, *q;` còn `int p, q;`) | quy tắc gõ và dán tắt của TipTap | xác nhận trên giao diện bằng E2E |

## 3. Bước 0: sửa nhỏ, không đổi dữ liệu

1. Đoạn văn của nội dung giữ khoảng trắng và vẫn tự xuống dòng (`white-space: pre-wrap`): thụt lề hiện lại ngay, giống những gì Người ra đề thấy trong trình soạn. Nội dung cũ lỡ có hai dấu cách liền sẽ hiện đúng hai.
2. Tắt việc tự đổi `*...*`, `**...**`, `_..._` thành chữ nghiêng, đậm khi gõ và khi dán. Nút trên thanh công cụ và phím tắt giữ nguyên. Gõ `- ` để tạo danh sách vẫn như cũ.

Câu hỏi **đã lưu** mà trước đó bị mất dấu thì không tự khôi phục được: Người ra đề sửa tay.

## 4. Bước 1: khối mã và mã trong dòng

### 4.1. Dữ liệu

Thêm vào schema nội dung, tên theo TipTap:

| Thành phần | Dạng | Ràng buộc |
|---|---|---|
| Khối mã | node khối `codeBlock`, chứa **một** đoạn chữ thuần (xuống dòng là ký tự `\n`) | không định dạng, không công thức; không thuộc tính (chưa ghi tên ngôn ngữ); tối đa 4.000 ký tự **kể cả khoảng trắng** và 200 dòng; không nằm trong mục danh sách |
| Mã trong dòng | mark `code` trên đoạn chữ | không đi cùng mark khác |

Không đổi bảng, không migration: nội dung vẫn là `jsonb`; bản chụp trong `exam_items.snapshot` cũ không đổi. Phần văn bản thuần (tìm kiếm, xem trước, kiểm độ dài, nghi trùng) tính cả chữ trong mã. Giới hạn riêng theo ký tự cần có vì văn bản thuần gộp khoảng trắng, không đếm được thụt lề.

### 4.2. Hiển thị (một chỗ: `rich-text-view.tsx`, mọi màn dùng chung)

- Khối mã: khung nền nhạt có viền, phông đơn cách của máy (không tải thêm phông), cỡ 14 px, tab rộng 2.
- **Trên điện thoại: tự xuống dòng, giữ thụt lề, không cuộn ngang** (Q491). Mỗi dòng mã có **số thứ tự** ở lề trái khi khối có từ 2 dòng: phần bị xuống dòng không có số nên không nhầm với dòng mới, và đề có thể nhắc "dòng 3". Chỉ ngắt ở khoảng trắng; một cụm liền dài hơn cả khung mới bị ngắt giữa cụm.
- Mã trong dòng: cùng phông, nền nhạt, cũng chỉ ngắt ở khoảng trắng.
- Trình đọc màn hình bỏ qua số dòng. Màu lấy từ biến màu sẵn có, dùng được cả chế độ tối. **Chưa tô màu cú pháp** (Q493).

### 4.3. Soạn

Bật `code` và `codeBlock` có sẵn trong thư viện đang dùng (không thêm thư viện): hai nút trên thanh công cụ. Trong khối mã, phím Tab chèn thụt lề; có cách rời ô bằng bàn phím (Escape rồi Tab) để không kẹt tiêu điểm. Dán mã vào khối giữ nguyên khoảng trắng.

### 4.4. Nhập từ Excel

| Trong ô | Thành |
|---|---|
| một dòng ba dấu `` ``` `` mở (được kèm một tên ngôn ngữ, mục 9), một dòng chỉ có `` ``` `` đóng | khối mã gồm các dòng ở giữa |
| `` `p->Next` `` | mã trong dòng |
| `` \` `` | dấu `` ` `` thường |

Trong mã, `$` là chữ thường, không thành công thức. Dấu mở không có dấu đóng thì giữ nguyên là chữ (như `$` lẻ, Q145); Người ra đề thấy ở bước xem trước. Thêm ví dụ vào file mẫu và hướng dẫn. Ô đã nhập trước đây không bị đổi.

### 4.5. Xuất đề Word

Khối mã in bằng phông `Courier New`, giữ khoảng trắng và xuống dòng, có viền; mã trong dòng cùng phông. Phương án có khối mã luôn xếp mỗi Phương án một dòng; phép ước lượng bề rộng Phương án tính theo phông đơn cách. Hệ thống không xuất đề ra PDF và không xuất Câu hỏi ra Excel, nên không có gì phải làm thêm ở hai đường đó.

## 5. Triển khai: đọc trước, soạn sau

Bản đang chạy **không đọc được** nội dung có khối mã (màn làm bài có thể trắng), kể cả trang đang mở sẵn trên máy Người dự thi trước khi deploy. Vì vậy chia hai lần phát hành:

| Lát | Nội dung | Quay lại bản trước |
|---|---|---|
| M0 | Bước 0 | được |
| M1 | Schema, hiển thị, xuất Word đọc được khối mã (chưa ai tạo ra được) | được |
| M2 | Trình soạn và nhập Excel tạo ra khối mã; hướng dẫn | chỉ về M1; về trước M1 thì Câu hỏi có mã bị hỏng |

M2 deploy sau M1, ngoài giờ thi, khi không còn trang cũ đang làm bài.

Ở M1, trình soạn đã **giữ** được nội dung có mã (mở, sửa chữ, lưu không mất) nhưng chưa có nút, phím tắt hay việc nhận mã từ HTML dán vào, nên lùi từ M2 về M1 vẫn an toàn.

Ở M2, trình soạn **từ chối ngay** thao tác làm khối mã vượt giới hạn ở mục 4.1 và báo cho Người ra đề, nên nội dung đang thấy luôn là nội dung sẽ lưu. Không có gõ tắt `` ``` `` trong trình soạn: tạo mã bằng nút, phím tắt (Ctrl+E, Ctrl+Alt+C) hoặc dán.

## 6. Kiểm thử

Schema (giới hạn, từ chối thành phần lạ); chuyển ô Excel thành nội dung (lồng `$`, dấu chưa đóng, tab, Windows `\r\n`); E2E 360 px: thụt lề đúng, không cuộn ngang, `->` không bị tách, trình soạn không đổi `*`; xuất Word giữ khoảng trắng; đáp án đúng vẫn không có trong dữ liệu gửi Người dự thi.

## 7. Ngoài phạm vi đợt này

Tô màu cú pháp; chạy hoặc chấm mã tự động; ô trả lời tự luận dành riêng cho viết mã (Q495).

## 8. Quyết định (chủ dự án duyệt ngày 26/11/2026)

| Câu | Nội dung | Đã chốt |
|---|---|---|
| Q490 | Làm M0 ngay bằng một PR riêng, không đợi phần còn lại? | Có |
| Q491 | Điện thoại: tự xuống dòng giữ thụt lề, có số dòng (không cuộn ngang)? | Có |
| Q492 | Excel đánh dấu bằng `` ``` `` và `` ` `` như mục 4.4? | Có |
| Q493 | Đợt đầu chưa tô màu cú pháp (nhẹ, in đen trắng không đổi)? | Chưa tô |
| Q494 | Thêm hai thuật ngữ vào `GLOSSARY.md`: **Khối mã** (`CodeBlock`), **Mã trong dòng** (`InlineCode`)? | Có |
| Q495 | Ô trả lời tự luận cho câu yêu cầu viết mã (phông đơn cách, tắt tự sửa chữ của điện thoại) để đợt sau? | Để sau |
| Q496 | Phát hành hai lần M1 rồi M2 như mục 5? | Có |
| Q497 | Sau M2, soạn lại 6 file câu hỏi Cấu trúc dữ liệu theo cách đánh dấu mới? | Có |

## 9. Thống nhất hiển thị (chủ dự án yêu cầu ngày 27/11/2026)

Yêu cầu: mã lệnh hiển thị thống nhất từ lúc soạn hoặc nạp file tới màn làm bài và đề Word. Rà các đường, sửa những chỗ lệch:

| Câu | Chỗ lệch | Đã chốt |
|---|---|---|
| Q498 | Excel: `` ```c `` không mở được khối, hai khối như vậy làm chữ ở giữa thành mã | dòng mở được kèm **một** tên ngôn ngữ liền từ (chữ Latin, số, `+ # . -`, tối đa 20 ký tự), bỏ đi; dòng đóng vẫn chỉ gồm `` ``` `` |
| Q499 | Đề Word không có số dòng như màn hình (thay một phần mục 4.5) | khối từ hai dòng: mỗi dòng một đoạn kiểu "Khối mã có số dòng", thụt treo; hai khối liền nhau ngăn bằng đoạn trống; cả khối giữ cùng trang với nội dung ngay sau |
| Q500 | Người dự thi tăng cỡ chữ, khối mã không to theo | cỡ chữ của mã tính theo chữ xung quanh |
| Q501 | Trình soạn hiện Tab rộng 4 | rộng 2; ô soạn mã tắt tự viết hoa, tự sửa chính tả |
| Q502 | Dấu ngoặc đứng sát mã bị rớt lại cuối dòng | cụm mã tới 16 ký tự giữ liền; dài hơn mới được ngắt khi không vừa khung (mục 4.2) |

Còn khác nhau, có chủ ý: ô soạn không đánh số dòng (**Xem thử** hiện đúng như màn làm bài); các danh sách chỉ hiện một đoạn chữ rút gọn.

