# Lọc và quản lý theo nhiều tag

**Trạng thái: `accepted`** (27/11/2026, chủ dự án đồng ý Q516–Q517 và Q520–Q524; thứ tự phát hành ở Q523 được thay bằng Q529 của [hop-chon-cau-thiet-ke.md](hop-chon-cau-thiet-ke.md)). Tiến độ: **G1** và **hướng dẫn đặt tag** đã phát hành ở bản `0.7.0` (28/11/2026); **G2** (gợi ý khi soạn, thêm bỏ hàng loạt, đổi tên và gộp) xong về mã (28/11/2026); G3 chưa làm.

## 1. Yêu cầu và hiện trạng

Chủ dự án định hướng **mỗi Chủ đề là một học phần**; chương, nội dung và mức độ ghi bằng **tag**. Khi đó tag là cách chính để tìm và chọn câu.

| Hiện nay | Hệ quả |
|---|---|
| Lọc chỉ được **một** tag | không ghép được chương với mức độ |
| Phải gõ **đúng từng ký tự, kể cả dấu**; gõ dở thì danh sách trống | `van dung` không ra `vận dụng` |
| Không có chỗ xem các tag đang có (dữ liệu thật đã có hơn 60 tag) | gõ lệch, tag sinh trùng nghĩa |
| Không sửa tag hàng loạt, không đổi tên hay gộp tag | tag lệch phải mở từng câu |

**Mô hình dữ liệu hiện tại đủ dùng:** `questions.tags text[]` (tối đa 10 tag, mỗi tag 30 ký tự, đã chuẩn hóa chữ thường) và chỉ mục GIN `questions_tags_idx` hỗ trợ cả "có đủ" (`@>`) và "có ít nhất một" (`&&`). **Không đổi bảng, không migration.**

## 2. Ý nghĩa khi chọn nhiều tag (Q516)

Mỗi tag thuộc một **loại**, suy ra từ chính chữ của tag (không lưu thêm gì):

| Dạng tag | Loại | Ví dụ |
|---|---|---|
| `loại: giá trị` | phần trước dấu `:` đầu tiên | `mức: vận dụng` thuộc loại `mức` |
| kết thúc bằng khoảng trắng và số (kể cả `2.1`) | phần chữ phía trước | `chương 1`, `chương 2` thuộc loại `chương` |
| còn lại | không có loại | `ngăn xếp`, `nhận biết` |

Hai chế độ, nút chuyển ngay trên bộ lọc:

- **Khớp tất cả** (mặc định): các tag **cùng loại** nối bằng "hoặc", các **loại khác nhau** và mỗi tag không loại nối bằng "và". Ví dụ chọn `chương 1`, `chương 2`, `vận dụng` nghĩa là **(chương 1 hoặc chương 2) và vận dụng**.
- **Khớp bất kỳ**: câu có ít nhất một tag đã chọn.

Dưới bộ lọc luôn viết ra bằng lời điều đang lọc (như ví dụ trên) để không phải đoán.

## 3. Lát G1: lọc nhiều tag

### Giao diện (Ngân hàng câu hỏi và hộp chọn câu của Bộ đề)

Trong hộp chọn câu của Bộ đề, danh sách tag nằm ngay ở cột lọc: theo [hop-chon-cau-thiet-ke.md](hop-chon-cau-thiet-ke.md) (kèm loại **mức độ**, Q528). Hộp "Chọn tag" dưới đây dùng ở Ngân hàng câu hỏi.

```text
Tag  [chương 1 ×] [chương 2 ×] [vận dụng ×]   [+ Chọn tag]
     (Khớp tất cả ▾)   Đang lọc: (chương 1 hoặc chương 2) và vận dụng · 14 câu

Hộp "Chọn tag"
[🔍 van dung            ]
chương     ☑ chương 1  20     ☑ chương 2  44     ☐ chương 3  44
Khác       ☑ vận dụng  18     ☐ vận dụng cao  4
```

- Danh sách tag **của Chủ đề đang chọn** (chưa chọn Chủ đề thì của mọi Chủ đề), kèm số câu, gom theo loại, xếp tự nhiên.
- Tìm **không dấu** trong danh sách; bấm để chọn hay bỏ; tag đã chọn thành nhãn gỡ được; chọn tối đa 20 tag.
- Tag đã chọn và chế độ khớp nằm trên **địa chỉ trang** (tải lại, quay lại vẫn giữ). Điện thoại: hộp chọn toàn chiều rộng, vùng bấm ≥ 48 px.

### API

| Đường | Ghi chú |
|---|---|
| `GET /api/questions?tag=a&tag=b&tagMatch=all\|any` | thêm vào đường sẵn có; một `tag` như trước vẫn chạy |
| `GET /api/questions/tags?topicId=&archived=` | `{ tag, count }[]`, tối đa 500 tag, chỉ câu của người gọi; đi qua cổng truy vấn nặng như danh sách câu |

Quy tắc suy loại và dựng điều kiện là **một hàm thuần ở `@exam/shared`**, dùng cho cả API (điều kiện SQL) và web (dòng "Đang lọc"), nên hai bên không lệch nhau. Giữ cách sắp xếp đã dùng khi lọc tag ([quy-mo-lon-thiet-ke.md](quy-mo-lon-thiet-ke.md) mục 6.5).

## 4. Lát G2: giữ tag gọn

- **Gợi ý khi soạn:** ô Tag của Câu hỏi thành ô nhãn có gợi ý tag đang có (tìm không dấu); Enter hoặc dấu phẩy để thêm. Gõ tag mới vẫn được.
- **Thêm, bỏ tag hàng loạt:** chọn nhiều câu ở Ngân hàng (cùng thanh thao tác với Chuyển Chủ đề), `POST /api/questions/tags/apply` `{ ids (≤200), add[], remove[] }`; câu vượt 10 tag được bỏ qua và báo rõ.
- **Đổi tên, gộp tag:** trong hộp danh sách tag, `POST /api/questions/tags/rename` `{ from, to, topicId? }`; đổi sang tên đã có là gộp (không trùng trong một câu). Hộp xác nhận nêu số câu bị đổi.
- Sửa tag tăng `version` của câu (người đang soạn câu đó được báo phiên bản đã đổi, như mọi lần sửa). Bản chụp trong Bộ đề đã Phát hành không đổi.

**Hướng dẫn đặt tag (28/11/2026, chủ dự án yêu cầu, làm trước phần còn lại của G2):** quy tắc đặt tag nằm ở một chỗ (`@exam/shared`, `tag-guide.ts`) và hiện ở sheet "Hướng dẫn" của file Excel mẫu và file ví dụ (kèm ghi chú ở tiêu đề cột Tags, 8 câu ví dụ đặt tag đúng quy tắc) và dưới ô Tags ở màn soạn câu hỏi (ví dụ ngay trong gợi ý; mục bấm mở, đóng sẵn). `tag-guide.test.ts` giữ cho quy tắc nêu ra khớp cách hệ thống xếp loại.

**G2a đã làm** (`tag-suggest.test.ts`, `tag-filter.spec.ts`): lựa chọn mặc định (Enter) là "Thêm tag mới" với đúng chữ đã gõ, trừ khi chữ đó trùng một tag đang có lúc bỏ dấu (lấy tag đang có). Dấu phẩy và rời ô thêm đúng chữ đã gõ; bấm Lưu khi còn đang gõ vẫn lưu tag đó. Điện thoại: chạm vào ô thì ô cuộn lên sát đầu trang để gợi ý không nằm dưới bàn phím.

**G2b, G2c đã làm** (`question-tags.int.test.ts`, `tag-filter.spec.ts`): `tags/apply` trả `{ changed, skipped }`, chỉ câu thật sự đổi mới tăng `version`; thêm và bỏ cùng một tag bị từ chối. `tags/rename` có `dryRun` để hộp xác nhận nêu số câu (kể cả câu đã Lưu trữ), đi qua cổng truy vấn nặng. Giao diện: nút **Sửa tag** ở thanh thao tác khi đang chọn câu; đổi tên mở từ hộp **Chọn tag** khi tích đúng một tag (gộp nhiều tag thì đổi lần lượt từng tag). Chưa đo đổi tên ở quy mô rất lớn (một câu lệnh sửa mọi câu mang tag).

## 5. Lát G3 (để sau, Q517)

Chọn ngẫu nhiên N câu đang khớp bộ lọc trong hộp chọn câu; sau đó **ma trận đề** (loại `chương` × loại `mức`, điền số câu từng ô, hệ thống chọn). Thiết kế riêng khi làm.

## 6. Kiểm thử (đỏ trước, xanh sau)

| Tầng | Bài |
|---|---|
| Đơn vị (`@exam/shared`) | suy loại (dấu `:`, số cuối, số có chấm, không loại, khoảng trắng); điều kiện "tất cả" và "bất kỳ"; câu mô tả bằng lời |
| Tích hợp API | lọc nhiều tag đúng ý nghĩa mục 2; một `tag` cũ vẫn đúng; quá 20 tag bị từ chối; danh sách tag đúng số, chỉ của người gọi, theo Chủ đề và trạng thái; thêm, bỏ hàng loạt (vượt 10 bị bỏ qua, không đụng câu người khác); đổi tên và gộp không tạo tag trùng; Bộ đề đã Phát hành không đổi |
| Giao diện (máy tính, điện thoại) | tìm không dấu rồi chọn; nhãn, dòng "Đang lọc", chuyển chế độ; giữ trên địa chỉ; hộp chọn câu của Bộ đề lọc như vậy; không tràn ngang, trợ năng; gợi ý khi soạn; thao tác hàng loạt và đổi tên |
| Quy mô | thêm vào `quy-mo-bench`: lọc ba tag, danh sách tag của một Chủ đề; mục tiêu dưới 500 ms ở 1.000.000 câu cho lọc, dưới 1 giây cho danh sách tag (không đạt thì đề xuất cách khác trước khi phát hành) |

**Đã đo (27/11/2026, `quy-mo-bench`, mỗi câu ba tag, p50, một lần chạy):**

| Việc | 100.000 câu | 1.000.000 câu | Ngưỡng |
|---|---|---|---|
| Lọc ba tag (hai chương và một mức, khớp rộng) | 47 ms | 238 ms | 500 ms |
| Lọc ba tag khớp hẹp, hoặc không câu nào khớp | 34–44 ms | 8–15 ms | 500 ms |
| Khớp bất kỳ trong ba tag | 42 ms | 235 ms | 500 ms |
| Danh sách tag của một Chủ đề | 11 ms | 101 ms | 1 giây |
| Danh sách tag của mọi Chủ đề | 56 ms | 400 ms | 1 giây |

Cùng lần chạy 1.000.000: mục "gợi ý người khi gõ tên rất phổ biến" (đã ghi là chưa đạt ở [quy-mo-lon-thiet-ke.md](quy-mo-lon-thiet-ke.md) mục 6, trước đo 609–711 ms) đo được 1.022 ms; "lưu câu trả lời chậm nhất giữa 40 lượt tìm Câu hỏi" đạt sát ngưỡng (97 ms trên 100, trước 38–49 ms). Hai đường này không đổi mã ở lát này; chưa đo lại.

## 7. Rủi ro

| Rủi ro | Cách giảm |
|---|---|
| Suy loại từ chữ không đúng ý (ví dụ `ipv 6`) | luôn hiện dòng "Đang lọc" bằng lời; có chế độ Khớp bất kỳ; đặt `loại: giá trị` khi muốn chắc chắn |
| Đếm tag chậm khi một Chủ đề rất lớn | đo trước khi phát hành (mục 6); chỉ gọi khi mở hộp chọn tag |
| Đổi tên hàng loạt nhầm | hộp xác nhận nêu số câu; một giao dịch; mặc định chỉ trong Chủ đề đang chọn |

## 8. Quyết định

| Câu | Nội dung | Trạng thái |
|---|---|---|
| Q516 | Cùng loại "hoặc", khác loại "và", kèm chế độ Khớp tất cả / Khớp bất kỳ | **Đã đồng ý** (27/11/2026) |
| Q517 | Làm G1 và G2 trước, G3 sau | **Đã đồng ý** (27/11/2026) |
| Q520 | Danh sách tag lấy theo Chủ đề đang chọn; chưa chọn thì mọi Chủ đề. Số đếm không đổi theo các tag đã chọn (bản đầu) | **Đã đồng ý** (27/11/2026) |
| Q521 | Chọn tối đa 20 tag một lần | **Đã đồng ý** (27/11/2026) |
| Q522 | Đổi tên, gộp tag mặc định chỉ trong Chủ đề đang chọn; muốn mọi Chủ đề phải chọn rõ | **Đã đồng ý** (27/11/2026) |
| Q523 | G1 phát hành trước một mình (không đổi dữ liệu), G2 sau | **Đã đồng ý**, sau thay bằng Q529: G1 phát hành chung `0.7.0` với hộp chọn câu mới |
| Q524 | Xác nhận ba điểm kiểm thử: hàm thuần, API qua HTTP với PostgreSQL thật, giao diện Playwright | **Đã đồng ý** (27/11/2026) |
| Q530 | Thêm thuật ngữ **Loại tag** (`TagKind`) vào `GLOSSARY.md` | **Đã đồng ý** (28/11/2026) |
| Q532 | Gõ dở chưa trùng tag nào thì Enter **thêm tag mới** đúng chữ đã gõ (gợi ý đang có phải bấm hoặc dùng mũi tên để chọn); chỉ khi trùng một tag đang có lúc bỏ dấu mới lấy tag đó | **Đã đồng ý** (28/11/2026) |
