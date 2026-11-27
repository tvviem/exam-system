# Hộp "Thêm câu hỏi vào Bộ đề" mới

**Trạng thái: `accepted`** (27/11/2026, chủ dự án đồng ý Q520–Q529). Tiến độ: **P1** xong về mã; P2, P3 chưa làm. Đi cùng [loc-nhieu-tag-thiet-ke.md](loc-nhieu-tag-thiet-ke.md) (lọc nhiều tag, G1). Quyết định ở mục 7.

## 1. Yêu cầu và hiện trạng

Góp ý của chủ dự án sau khi nạp 200 câu học phần Cấu trúc dữ liệu: lọc tag khó dùng; chọn Chủ đề cần gõ để tìm (hiện vài Chủ đề trước, gõ thì tìm tiếp); hộp cần rộng hơn và dành chỗ cho danh sách câu. Chọn Loại câu hỏi giữ nguyên. Nút **Xem** chi tiết câu hỏi giữ nguyên.

Đo trên bản `0.6.1`, 20 câu có Phần dẫn dài hai dòng:

| Màn hình | Hộp | Danh sách bắt đầu ở | Số câu thấy trọn |
|---|---|---|---|
| Máy tính 1366 × 768 | 896 × 653 | 306 px | **2** |
| Điện thoại 390 × 844 | 390 × 717 | 590 px | **0** |

Nguyên nhân: bốn ô lọc và hai dòng hướng dẫn nằm trên danh sách; cả hộp cuộn, trong đó danh sách lại cuộn riêng (cao tối đa nửa màn hình). Lỗi kèm theo: dòng câu hỏi lộ ra **phía dưới** thanh nút dính đáy.

## 2. Bố cục

### Máy tính (từ 1024 px)

```text
┌ Thêm câu hỏi vào Bộ đề                        Thêm vào Phần [Phần 1 ▾]  × ┐
├──────────────┬─────────────────────────────────────────────────────────────┤
│ Chủ đề   [▾] │ [🔍 Tìm trong nội dung câu hỏi…                          ]  │
│ Loại     [▾] │ (chương 2 ×) (vận dụng ×)  chương 2 và vận dụng · 31 câu    │
│ Tag          │ ☐ Chọn cả 20 câu trên trang này           31 câu  ‹ 1/2 ›   │
│ [Tìm tag…]   │ ┌ ☑ Phần dẫn (tối đa 2 dòng)                       [Xem] ┐  │
│ CHƯƠNG       │ │   Loại · tag · điểm                                    │  │
│ ☐ chương 1 20│ └────────────────────────────────────────────────────────┘  │
│ ☑ chương 2 80│   … (vùng duy nhất cuộn)                                    │
│ MỨC ĐỘ   …   │                                                             │
│ KHÁC     …   │                                                             │
├──────────────┴─────────────────────────────────────────────────────────────┤
│ Đã chọn 3 câu · Bỏ chọn tất cả                      [Hủy]  [Thêm 3 câu]    │
└────────────────────────────────────────────────────────────────────────────┘
```

- Hộp rộng tối đa 1200 px, cao theo màn hình (chừa 16 px mỗi cạnh). Đầu và chân **cố định**; cột lọc (300 px) và danh sách cuộn riêng; không cuộn cả hộp.
- Chọn trang và phân trang gộp một dòng trên đầu danh sách. Số đã chọn và đích thêm vào nằm ở chân. Mẹo Shift chuyển thành chữ nhỏ ở chân.
- Dòng câu hỏi gọn hơn và **hiện tag**; bỏ tên Chủ đề khi đã lọc một Chủ đề.

### Điện thoại và máy tính bảng (dưới 1024 px)

Hộp **toàn màn hình**: một hàng gồm ô tìm và nút **Bộ lọc (n)**; nhãn các bộ lọc đang bật (xuống dòng, gỡ được); danh sách; chân một hàng (đã chọn, Phần đích, nút Thêm). **Bộ lọc** mở thành một màn trong cùng hộp (Chủ đề, Loại, Tag), nút dưới đáy **Xem n câu**; nút quay lại và phím Back của hộp trở về danh sách, giữ lựa chọn.

## 3. Ô chọn Chủ đề gõ để tìm (`TopicCombobox`)

| Lúc | Hiện |
|---|---|
| Vừa mở, chưa gõ | **Mọi Chủ đề**, tối đa 3 Chủ đề **dùng gần đây** (nhớ trên máy), thêm theo tên cho đủ **6**; dòng "Còn N Chủ đề khác. Gõ tên để tìm." |
| Đang gõ | tối đa **20** kết quả kèm số câu, tô đậm phần khớp; nhiều hơn thì "Còn N kết quả, gõ thêm để thu hẹp" |
| Không khớp | "Không có Chủ đề khớp. Thử gõ ít từ hơn." |

- Khớp **không dấu**, mọi từ, không cần đúng thứ tự (như cột Chủ đề), **thêm khớp chữ cái đầu**: `ctdl` ra "Cấu trúc dữ liệu".
- Xếp hạng: tên bắt đầu bằng từ khóa, rồi khớp đầu từ, rồi khớp giữa từ, rồi khớp chữ cái đầu; cùng hạng theo thứ tự tự nhiên.
- Bàn phím: mũi tên, Enter chọn, Esc **chỉ đóng danh sách** (không đóng hộp). Mẫu trợ năng `combobox` + `listbox`; đọc số kết quả. Vùng bấm ≥ 48 px trên điện thoại.
- Lọc trên danh sách Chủ đề trang đã tải (`GET /api/topics`), không thêm API; vài trăm Chủ đề vẫn tức thì.
- Tự viết trên phần tử HTML gốc, không thêm thư viện (Q74).

## 4. Tag trong hộp

Theo [loc-nhieu-tag-thiet-ke.md](loc-nhieu-tag-thiet-ke.md) mục 2 và 3, với một điều chỉnh về chỗ đặt: trong hộp này danh sách tag nằm **ngay ở cột lọc** (không mở hộp con). Mỗi loại một nhóm; nhóm **Khác** hiện 8 tag nhiều câu nhất, "Xem thêm" hoặc ô **Tìm tag** (không dấu) để tìm phần còn lại; tag đã chọn luôn hiện.

**Mức độ (Q528):** bốn tag `nhận biết`, `thông hiểu`, `vận dụng`, `vận dụng cao` được coi là cùng loại **mức độ**. Nếu không, chọn hai mức sẽ không ra câu nào (vì tag không loại nối bằng "và"). Dữ liệu đã nạp dùng đúng các tag này nên không phải sửa.

## 5. Chia lát

| Lát | Nội dung | Đổi gì |
|---|---|---|
| **P1** | Khung hộp mới (mục 2) và `TopicCombobox` trong hộp | chỉ giao diện |
| **P2** | Lọc nhiều tag (G1): hàm ở `@exam/shared`, API lọc và danh sách tag, cột tag trong hộp và bộ chọn tag ở Ngân hàng câu hỏi | API (không đổi bảng) và giao diện |
| **P3** | Dùng `TopicCombobox` ở màn soạn, nhập Excel, chuyển Chủ đề | chỉ giao diện |

## 6. Kiểm thử (đỏ trước, xanh sau)

| Tầng | Bài |
|---|---|
| Đơn vị | xếp hạng và khớp chữ cái đầu; danh sách mặc định 6 mục với Chủ đề dùng gần đây; giới hạn 20; quy tắc tag (mục 6 của thiết kế tag, thêm loại mức độ) |
| Giao diện, 1366 × 768 | thấy trọn **≥ 6** câu; chỉ danh sách và cột lọc cuộn; không dòng nào nằm sau chân hộp; ô Chủ đề: mở, gõ `ctdl`, bàn phím, Esc không đóng hộp |
| Giao diện, 390 × 844 | thấy trọn **≥ 4** câu; vào và ra màn Bộ lọc giữ lựa chọn; không tràn ngang ở 360 px |
| Hồi quy | các bài hiện có của hộp (chọn trang, Shift, giữ lựa chọn, đổi Phần, Xem chi tiết), trợ năng, rà tràn |

Bản phác đo được 7 câu (máy tính) và 5 câu (điện thoại); số liệu trong bản phác là minh họa.

**Đã làm ở P1** (`exam-picker-layout.spec.ts`, `topic-search.test.ts`): với Phần dẫn dài hai dòng, thấy trọn **6** câu ở 1366 × 768 và **4** câu ở 390 × 844 (trước: 2 và 0). Khác bản phác ở bốn chỗ nhỏ: số câu ghi cùng nút lật trang ("1–20 / 31"); nhãn bộ lọc hiện cả trên máy tính (gồm tên Chủ đề đầy đủ); điện thoại có từ hai Phần thì ô **Thêm vào Phần** đứng một dòng riêng ở chân hộp; nút **Hủy** chỉ có trên màn rộng.

## 7. Quyết định

| Câu | Nội dung | Đã chốt (27/11/2026) |
|---|---|---|
| Q525 | Bố cục mục 2 (cột lọc bên trái; điện thoại toàn màn hình, bộ lọc là một màn riêng)? | **Đồng ý** |
| Q526 | Ô Chủ đề như mục 3 (6 mục đầu, 20 kết quả, khớp chữ cái đầu)? | **Đồng ý** |
| Q527 | Dùng cùng ô Chủ đề ở màn soạn, nhập Excel, chuyển Chủ đề (P3) cho thống nhất? | **Đồng ý** |
| Q528 | Bốn tag mức độ là một loại? | **Đồng ý** |
| Q529 | Làm P1, P2, P3 mỗi lát một PR, phát hành chung `0.7.0` (thay đề xuất Q523)? | **Đồng ý** |
