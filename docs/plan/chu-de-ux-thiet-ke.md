# Chủ đề: cột bên trái và Quản lý Chủ đề cho vài chục đến hàng trăm Chủ đề (thiết kế đề xuất)

**Trạng thái: `accepted`** (chủ dự án duyệt Q503–Q512 theo đề xuất ngày 27/11/2026, mục 9). Tiến độ: **T1** xong về mã (phát hành `0.6.1`, Q519); **T2, T3 hoãn** để làm lọc nhiều tag trước (Q518).

## 1. Yêu cầu và bằng chứng

Chủ dự án nạp file `c1-mo-dau.xlsx` và thấy: (a) chữ trong cột Chủ đề bên trái của Ngân hàng câu hỏi **đè lên nhau**; (b) hộp **Quản lý Chủ đề** khó theo dõi khi có vài chục đến hơn 100 Chủ đề. Yêu cầu: tổ chức lại cho dễ dùng, kèm bài test phù hợp.

Đã dựng lại bằng 106 Chủ đề đặt tên kiểu `<học phần> - Chương n: <tên chương>` (đúng cách đặt tên của chủ dự án), đo trên máy tính 1280 px và điện thoại:

| Quan sát | Số đo |
|---|---|
| Cột trái: dòng có chữ **tràn khỏi ô** | 106 trên 107 dòng; ô cao cố định 36 px, chữ xuống 2 đến 3 dòng |
| Thứ tự | theo chữ cái, nên `Chương 10` đến `19` đứng **trước** `Chương 1`, rồi `20` trước `2` |
| Hộp Quản lý Chủ đề, máy tính | thấy khoảng **5 trên 106** dòng (ô thêm, lời giải thích, ô tìm, nút chuyển nhóm chiếm gần hết hộp) |
| Hộp Quản lý Chủ đề, điện thoại | thấy khoảng **4 trên 106** dòng; tên bị cắt bằng "…" ở đúng chỗ phân biệt (`Chương 10: An to…`), chạm không xem được tên đủ |
| Thêm nhiều Chủ đề | từng tên một: gõ, bấm **Thêm Chủ đề**, lặp lại (106 lần cho 106 Chủ đề) |
| Việc làm hàng loạt | không có: Lưu trữ, Khôi phục, Xóa từng Chủ đề qua menu "…" |
| Chọn Chủ đề ở Soạn câu hỏi, Nhập Excel, Chuyển Chủ đề, hộp chọn câu của Bộ đề | danh sách phẳng, thứ tự chữ cái, 106 mục trong một ô chọn |

## 2. Nguyên nhân

1. **Chữ đè lên nhau** là lỗi bố cục có thật, không phải do dữ liệu: các dòng nằm trong một khung cuộn kiểu cột (`flex-col` có `max-h` và `overflow-y-auto`), mỗi dòng có chiều cao tối thiểu (`min-h-9` ở chuột, `min-h-12` ở cảm ứng) nhưng được phép **co lại** về đúng mức tối thiểu đó, còn chữ dài hơn thì tràn ra. Cần `shrink-0` cho dòng. Bài `topic-chip-overflow.spec.ts` hiện chỉ kiểm chữ bị cắt "…", không kiểm chữ tràn nên không bắt được.
2. **Thứ tự lệch**: API trả Chủ đề theo `name_key` (so chuỗi), không hiểu số trong tên.
3. **Hộp quá nhỏ cho việc quản lý**: hộp thoại phù hợp để thêm một vài Chủ đề, không phải để theo dõi hàng trăm.

## 3. Nguyên tắc (tra skill thiết kế UX/UI và [ui-design.md](../ui-design.md))

- **Cho làm hàng loạt:** chọn nhiều, thao tác một lần (skill: *Bulk Actions*); thanh hành động dính đáy khi đang chọn (ui-design mục 7).
- **Tìm đi đôi với gợi ý:** tìm không dấu, kết quả mở sẵn nhóm khớp; không có kết quả thì nói rõ và gợi ý (*No Results*, *Autocomplete*).
- **Không cắt tên bằng "…" ở chỗ phân biệt:** tên xuống dòng; rút gọn phần trùng lặp (tên học phần) thay vì cắt phần khác nhau; tên đầy đủ luôn có ở `title` và nhãn trợ năng (đã chốt 25/11, ui-design mục 13).
- **Trang đủ rộng cho việc quản lý**, hộp thoại chỉ cho việc nhanh. Danh sách ≥ 768 px là bảng, dưới đó là thẻ (`DataList`, mục 10).
- **Không lồng vùng cuộn** (mục 11): trang cuộn, không hộp cuộn trong hộp thoại cuộn.
- Mật độ: chuột 36–40 px, cảm ứng ≥ 48 px (Q109). Hàng trăm dòng vẫn vẽ trực tiếp; chỉ cần cuộn ảo (`react-virtual`) khi vượt khoảng 500 Chủ đề.

## 4. Thiết kế

### 4.1. Nhóm theo học phần (chỉ ở giao diện, không đổi dữ liệu)

Chủ đề vẫn là danh sách **phẳng** (Q112). Giao diện tự gom các Chủ đề có cùng phần tên **trước dấu ` - ` đầu tiên**:

- `NLS và ứng dụng AI - Chương 4: NLS` thuộc nhóm **NLS và ứng dụng AI**, hiện ở dòng là `Chương 4: NLS` (tên đầy đủ ở `title` và nhãn trợ năng).
- Nhóm chỉ lập khi có **từ hai Chủ đề** cùng phần đầu (không phân biệt hoa thường và dấu). Chủ đề còn lại đứng riêng ở cuối, tên đầy đủ.
- *Thêm khi làm T1:* tên kiểu `CTDL 1 - …`, `CTDL 2 - …` có phần đầu mỗi Chủ đề một khác. Những Chủ đề còn lẻ mà phần đầu **chỉ khác số cuối** được gom theo phần chữ (nhóm `CTDL`, dòng `1 - Mở đầu…`), đúng hình ở mục 4.2. Phần đầu có số nhưng lặp lại (`Toán 1 - …` hai Chủ đề) vẫn là nhóm riêng `Toán 1`.
- Thứ tự **tự nhiên** theo tiếng Việt: `Chương 2` trước `Chương 10`; nhóm xếp theo chữ cái.
- Hàm thuần `lib/topic-tree.ts` làm việc này (tách tên, gom nhóm, sắp xếp, lọc theo từ khóa); dùng chung cho cột trái, trang quản lý và các ô chọn.

**Tìm Chủ đề (T1):** gõ một hay nhiều từ, không cần dấu, không cần đúng thứ tự; khớp trên tên đầy đủ (`cay ctdl` ra `CTDL 4 - Cây`). Nhóm có kết quả tự mở và hiện số Chủ đề khớp; **Enter** chọn kết quả đầu, **Escape** xóa từ khóa. Ô tìm hiện từ 9 Chủ đề; tới 20 Chủ đề thì các nhóm mở sẵn.

### 4.2. Cột bên trái của Ngân hàng câu hỏi (máy tính)

```text
Chủ đề                        [⚙ Quản lý]
[🔍 Tìm Chủ đề…            ]
● Tất cả Chủ đề                    170
▾ CTDL                              44   6 Chủ đề
     1 - Mở đầu, ADT và độ phức tạp 20
     2 - Danh sách                  44
▸ NLS và ứng dụng AI               150
▸ Cơ sở dữ liệu                     12
  Chủ đề lẻ: Toán rời rạc           7
```

- Dòng tự cao theo chữ (tối đa 3 dòng, không cắt), **không bao giờ co**; số đếm giữ bên phải, mờ khi bằng 0.
- Tiêu đề nhóm là nút mở/đóng (`aria-expanded`), kèm tổng số câu. Nhóm chứa Chủ đề đang chọn tự mở; gõ tìm thì mở hết nhóm có kết quả; trạng thái mở/đóng nhớ trên trình duyệt (không bắt buộc).
- Tìm và "Tất cả Chủ đề" dính ở đầu, danh sách chiếm hết chiều cao còn lại của cột (không còn `55dvh` cố định).
- Nút **Quản lý** đưa tới trang quản lý (4.4).

### 4.3. Điện thoại và các ô chọn Chủ đề

- Bộ lọc ở Ngân hàng câu hỏi (điện thoại): tới 6 Chủ đề là hàng chip; từ 7 Chủ đề là nút **Chủ đề: …** mở hộp **Chọn Chủ đề**, dùng đúng danh sách của cột bên trái (nhóm, tìm). *Đổi khi làm T1:* bản đề xuất định giữ ô chọn gốc ở đây, nhưng ô chọn gốc trên điện thoại **không tìm được**, nên với hàng trăm Chủ đề phải lướt tay.
- Soạn câu hỏi, Nhập Excel, Chuyển Chủ đề, hộp chọn câu của Bộ đề: cùng dùng ô chọn có nhóm. **Giữ ô chọn gốc**, không làm ô chọn tự vẽ, để trợ năng, bàn phím và bài kiểm thử hiện có (`selectOption`) vẫn đúng. Hạn chế đã biết: ở các ô này trên điện thoại chưa có ô tìm; muốn có thì làm một lát riêng.

### 4.4. Trang Quản lý Chủ đề (thay hộp thoại)

Đường dẫn `/examiner/questions/topics` (thuộc Người ra đề), nút **Quản lý Chủ đề** ở Ngân hàng câu hỏi dẫn tới đây.

```text
Quản lý Chủ đề                                    [Thêm Chủ đề] [Thêm nhiều…]
[🔍 Tìm…]   (Đang dùng 106) (Đã lưu trữ 0)   (Tất cả) (Chưa có câu 84)
─────────────────────────────────────────────────────────────────────────
☐  Chủ đề                                     Số câu   Cập nhật       ⋯
☐  ▾ CTDL  (6)                                  124
☐       1 - Mở đầu, ADT và độ phức tạp           20     26/11
☐       2 - Danh sách                             44     26/11
…
Đã chọn 3:   [Lưu trữ]  [Xóa 2 Chủ đề rỗng]  [Bỏ chọn]        ← thanh dính đáy
```

- Máy tính: bảng, hàng 40 px, trang cuộn (không hộp cuộn riêng), tiêu đề bảng dính. Điện thoại: thẻ gom nhóm, ô chọn ở đầu thẻ, thanh hành động dính đáy.
- **Lọc:** Đang dùng / Đã lưu trữ; Tất cả / **Chưa có câu** (dọn Chủ đề rỗng nhanh). **Sắp xếp:** tên (tự nhiên), số câu, mới cập nhật.
- **Đổi tên tại chỗ** (Enter hoặc menu "…"); xóa Chủ đề còn câu vẫn bị chặn như hiện nay, có giải thích.
- **Việc hàng loạt:** Lưu trữ, Khôi phục, Xóa (chỉ Chủ đề rỗng; Chủ đề còn câu được bỏ qua và báo rõ). Sau thao tác có thông báo kèm **Hoàn tác** cho Lưu trữ và Khôi phục.
- **Thêm nhiều Chủ đề:** hộp thoại có một ô nhiều dòng (mỗi dòng một Chủ đề, tối đa 200), thêm ô **Học phần** tùy chọn (ghép `<học phần> - ` trước mỗi dòng). Xem trước ngay: số tên mới, số tên trùng (bỏ qua), số tên quá 100 ký tự; bấm **Tạo n Chủ đề**.

  ```text
  Học phần:  Cơ sở dữ liệu
  Chương 1: Mở đầu
  Chương 2: Mô hình quan hệ         → 20 mới · 1 trùng · 0 quá dài   [Tạo 20 Chủ đề]
  ```
- Thêm một Chủ đề vẫn có ô nhập ngay đầu trang (Enter để thêm), và lần đầu khi chưa có Chủ đề nào thì Ngân hàng câu hỏi hiện nút thêm như hiện nay.

### 4.5. API (thêm, không đổi cái có sẵn)

| Việc | Đường | Kết quả |
|---|---|---|
| Thêm nhiều | `POST /api/topics/bulk` `{ names: string[≤200] }` | `{ created: Topic[], skipped: { name, reason: 'duplicate' \| 'invalid' }[] }`, một giao dịch, tên chuẩn hóa như `POST /topics` |
| Làm hàng loạt | `POST /api/topics/batch` `{ action: 'archive' \| 'restore' \| 'delete', ids: uuid[≤200] }` | `{ done: n, skipped: { id, name, reason: 'has_questions' \| 'name_taken' \| 'not_found' }[] }`; chỉ Chủ đề của chính người gọi |

`GET /api/topics` giữ nguyên (đã đếm câu bằng một truy vấn gom, [quy-mo-lon-thiet-ke.md](quy-mo-lon-thiet-ke.md) mục 3.3). Thứ tự tự nhiên làm ở giao diện, không đổi sắp xếp của API. Không đổi bảng, không migration.

### 4.6. Trợ năng

Tiêu đề nhóm là `button` với `aria-expanded`; ô chọn dòng có nhãn nêu tên đầy đủ; "chọn tất cả" có trạng thái nửa chọn; thông báo kết quả việc hàng loạt đi qua vùng `aria-live`; mọi thứ bấm được ≥ 44 px trên điện thoại; bài `a11y-sweep.spec.ts` và `mobile-overflow-sweep.spec.ts` thêm trang mới.

## 5. Các lát làm (theo thứ tự)

| Lát | Nội dung | Phát hành dự kiến |
|---|---|---|
| **T1** | Sửa chữ đè (`shrink-0`) + thứ tự tự nhiên + nhóm theo học phần ở cột trái + ô chọn có nhóm ở mọi nơi. Chỉ giao diện, không API | PATCH `0.6.1` (như các đợt chỉnh giao diện trước) |
| **T2** | Trang Quản lý Chủ đề thay hộp thoại: bảng, lọc, sắp xếp, đổi tên tại chỗ, chọn nhiều, hai đường API hàng loạt, Hoàn tác | MINOR `0.7.0` (có API và chức năng mới) |
| **T3** | Thêm nhiều Chủ đề bằng dán danh sách (xem trước, trùng, quá dài) | cùng `0.7.0` hoặc ngay sau |
| Để sau | Bấm tên học phần để lọc cả nhóm; Gộp Chủ đề; Đổi tên học phần hàng loạt | theo yêu cầu |

T1 làm trước vì là lỗi nhìn thấy ngay; mỗi lát là một PR riêng, deploy ngoài giờ thi.

## 6. Kiểm thử

Theo quy trình TDD của dự án: mỗi hành vi có bài **đỏ trước, xanh sau**, và bài chứng minh bắt được lỗi cũ (chạy lại với lỗi cũ thì đỏ).

**Cần chủ dự án xác nhận các điểm kiểm (seam):** (1) hàm thuần `topic-tree` (đơn vị); (2) hai đường API qua HTTP với PostgreSQL thật (tích hợp); (3) giao diện thật bằng Playwright ở máy tính và điện thoại.

### 6.1. Đơn vị (Vitest, `lib/topic-tree.test.ts`)

| Mã | Hành vi |
|---|---|
| U-01 | Tách tên: `A - B`, nhiều dấu ` - ` (chỉ tách ở dấu đầu), không có dấu, khoảng trắng thừa, dấu gạch ngắn `–` không tách |
| U-02 | Nhóm chỉ lập khi từ hai Chủ đề; không phân biệt hoa thường và dấu; Chủ đề lẻ đứng riêng |
| U-03 | Thứ tự tự nhiên tiếng Việt: `Chương 2` < `Chương 10`; `Đ` đứng sau `D` |
| U-04 | Lọc không dấu: giữ nhóm có Chủ đề khớp, ghi rõ nhóm cần mở; từ khóa trùng tên học phần giữ cả nhóm |
| U-05 | Tổng số câu của nhóm; Chủ đề đang chọn xác định nhóm tự mở |
| U-06 | Phân tích danh sách dán: tách dòng, bỏ dòng trống, gộp trùng trong chính danh sách, báo tên quá 100 ký tự, báo trùng với Chủ đề đã có (không dấu), ghép học phần |

### 6.2. Tích hợp (`apps/api/test/question-bank-topics.int.test.ts` mở rộng)

| Mã | Hành vi |
|---|---|
| I-01 | `bulk`: tạo đủ; tên trùng (đã có hoặc lặp trong lần gửi) được bỏ qua và báo; tên không hợp lệ bị bỏ qua; quá 200 tên bị từ chối; chuẩn hóa như `POST /topics` |
| I-02 | `bulk` chỉ tạo cho chính người gọi; người không có nhãn Người ra đề bị từ chối |
| I-03 | `batch archive` và `restore`: chỉ Chủ đề của mình; Khôi phục trùng tên một Chủ đề đang dùng thì bỏ qua với lý do `name_taken` |
| I-04 | `batch delete`: chỉ xóa Chủ đề rỗng; Chủ đề còn câu được bỏ qua với `has_questions`, không làm hỏng cả lô |
| I-05 | Chủ đề của người khác trong `ids` bị coi như không có (`not_found`), không lộ sự tồn tại |
| I-06 | Hiệu năng: tạo 200 Chủ đề và lưu trữ 200 Chủ đề dưới 500 ms; `GET /topics` với 300 Chủ đề không chậm hơn ngưỡng hiện có ([quy-mo-lon-thiet-ke.md](quy-mo-lon-thiet-ke.md)) |

### 6.3. Giao diện (Playwright, máy tính và điện thoại)

| Mã | Hành vi |
|---|---|
| E-01 | **Không chữ đè** (dựng lại lỗi): 100 Chủ đề tên dài, mọi dòng có `scrollHeight` ≤ `clientHeight` và hai dòng liền nhau không chồng lên nhau; bài này **đỏ** trên mã hiện tại |
| E-02 | Thứ tự tự nhiên: `Chương 2` đứng trước `Chương 10` ở cột trái, trang quản lý và mọi ô chọn |
| E-03 | Nhóm: tiêu đề nhóm mở/đóng bằng chuột và bàn phím (`aria-expanded`); nhóm chứa Chủ đề đang chọn tự mở; chọn Chủ đề lọc đúng và giữ trên URL |
| E-04 | Tìm không dấu mở nhóm khớp; không có kết quả thì hiện lời gợi ý, không để trống |
| E-05 | Ô chọn có nhóm ở Soạn câu hỏi, Nhập Excel, Chuyển Chủ đề, hộp chọn câu: `selectOption` theo tên vẫn chọn đúng Chủ đề |
| E-06 | Trang quản lý: ở 1280×800 thấy ít nhất 12 dòng không cần cuộn trong khung; không có vùng cuộn lồng nhau |
| E-07 | Lọc **Chưa có câu**, sắp xếp theo số câu và theo mới cập nhật; trạng thái giữ khi tải lại |
| E-08 | Chọn nhiều + Lưu trữ + **Hoàn tác** + Khôi phục; Xóa chỉ các Chủ đề rỗng và báo số bị bỏ qua |
| E-09 | Đổi tên tại chỗ: Enter lưu, Esc hủy, tên trùng báo lỗi ngay tại dòng |
| E-10 | Thêm nhiều: dán 30 tên có 3 tên trùng và 1 quá dài, xem trước đúng số, tạo xong danh sách và cột trái cập nhật |
| E-11 | Điện thoại 360 px: không tràn ngang (thêm vào `mobile-overflow-sweep`), thanh hành động dính đáy không che nội dung, vùng bấm ≥ 44 px |
| E-12 | Trợ năng: `a11y-sweep` thêm trang quản lý và cột trái; vùng thông báo đọc kết quả hàng loạt |
| E-13 | Tốc độ: mở trang với 500 Chủ đề dưới 1 giây, gõ tìm cập nhật dưới 100 ms (ngân sách của AGENTS.md) |

### 6.4. Cập nhật bài đang có

- 13 chỗ trong 6 bài (`busy-states`, `mobile-overflow-sweep`, `question-bank`, `question-illustrations`, `question-import`, `guide/05`) tạo Chủ đề qua hộp **Quản lý Chủ đề**: gom vào một hàm dùng chung `e2e/topic-support.ts` ở lát T2 để chỉ sửa một chỗ khi giao diện đổi.
- `topic-chip-overflow.spec.ts`: đổi bộ chọn của cột trái và bỏ kiểm "không cắt bằng …" thành kiểm "không tràn ô" (E-01).
- Bộ chụp ảnh hướng dẫn (`apps/web/guide/05-ngan-hang-cau-hoi.spec.ts`) chụp lại cột trái và trang quản lý; tài liệu Người ra đề mục 3.1 và 3.5 cập nhật cùng PR.

## 7. Rủi ro và cách giảm

| Rủi ro | Cách giảm |
|---|---|
| Quy ước ` - ` không phải ai cũng dùng | nhóm chỉ lập khi có từ hai Chủ đề cùng phần đầu; không có thì giữ danh sách phẳng; không bắt buộc đặt tên theo quy ước |
| Đổi hộp thoại thành trang làm hỏng bài kiểm thử và hướng dẫn cũ | hàm dùng chung `topic-support.ts`, cập nhật cùng PR; ô chọn gốc giữ `selectOption` |
| Việc hàng loạt xóa nhầm | xóa chỉ Chủ đề rỗng, có hộp xác nhận nêu số lượng; Lưu trữ và Khôi phục có Hoàn tác |
| Hàng trăm dòng làm chậm | đo ở E-13; chỉ thêm cuộn ảo khi vượt khoảng 500 Chủ đề |

## 8. Ngoài phạm vi

Cây Chủ đề nhiều cấp (đã chốt phẳng ở Q112, muốn đổi phải có quyết định mới); chia sẻ Chủ đề giữa Người ra đề; nhập Chủ đề từ file Excel riêng.

## 9. Quyết định (chủ dự án duyệt ngày 27/11/2026)

| Câu | Nội dung | Đã chốt |
|---|---|---|
| Q503 | Gom Chủ đề theo phần tên trước ` - ` thành nhóm học phần ở giao diện (không đổi dữ liệu, vẫn là danh sách phẳng)? | Có |
| Q504 | Sắp xếp tự nhiên tiếng Việt (`Chương 2` trước `Chương 10`)? | Có |
| Q505 | Thay hộp thoại bằng trang **Quản lý Chủ đề** riêng? | Có (hộp thoại chỉ còn cho việc thêm nhanh) |
| Q506 | Thêm nhiều Chủ đề bằng dán danh sách (mỗi dòng một Chủ đề, tối đa 200), có ô Học phần ghép sẵn? | Có |
| Q507 | Việc hàng loạt gồm Lưu trữ, Khôi phục, Xóa (chỉ Chủ đề rỗng), kèm Hoàn tác cho hai việc đầu? | Có |
| Q508 | Các ô chọn Chủ đề giữ ô chọn gốc nhưng chia nhóm theo học phần (không làm ô chọn tự vẽ)? | Có |
| Q509 | Thứ tự làm: T1 sửa lỗi chữ đè và nhóm trước (PATCH `0.6.1`), rồi T2, T3 (MINOR `0.7.0`)? | Có |
| Q510 | Gộp Chủ đề, Đổi tên học phần hàng loạt và bấm tên học phần để lọc cả nhóm: để sau? | Để sau |
| Q511 | Có đặt giới hạn số Chủ đề mỗi Người ra đề? | Không giới hạn cứng; thiết kế cho tới khoảng 500 |
| Q512 | Xác nhận ba điểm kiểm thử ở đầu mục 6 (hàm thuần, API qua HTTP, giao diện Playwright)? | Có |
| **Q513** biểu diễn học phần | Mỗi chương một Chủ đề (nhóm theo tên) dùng được ngay; không thêm thực thể Học phần. Cùng ngày chủ dự án cho biết **định hướng tới: mỗi Chủ đề là một học phần**, chương và mức độ ghi bằng tag | **Đồng ý**; lọc nhiều tag thiết kế riêng |
| **Q514** thuật ngữ | **Nhóm Chủ đề** (`TopicGroup`) trong `GLOSSARY.md` | **Đồng ý** |
| **Q515** điều chỉnh khi làm T1 | Gom cả phần đầu chỉ khác số cuối; điện thoại dùng hộp chọn có ô tìm | **Đồng ý** |
| **Q518** thứ tự | Vì định hướng mỗi Chủ đề là một học phần (số Chủ đề ít), hoãn T2, T3; làm lọc nhiều tag trước (thiết kế riêng, Q516, Q517) | **Đồng ý** |
| **Q519** phát hành | T1 phát hành ngay thành `0.6.1`, không đợi phần tag | **Đồng ý** |

