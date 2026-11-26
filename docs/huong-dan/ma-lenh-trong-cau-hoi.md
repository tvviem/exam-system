# Hướng dẫn: Mã lệnh trong Câu hỏi

Dành cho **Người ra đề** (và phần "Người dự thi thấy gì"). Từ bản sau 0.5.4 (chưa gắn số phiên bản). Thiết kế và các quyết định ở [plan/ma-lenh-trong-cau-hoi-thiet-ke.md](../plan/ma-lenh-trong-cau-hoi-thiet-ke.md), thuật ngữ ở [GLOSSARY.md](../../GLOSSARY.md).

Dùng cho các học phần lập trình: C, C++, Java, Python, SQL và ngôn ngữ khác. Hệ thống giữ nguyên khoảng trắng và ký tự của mã, **không tô màu cú pháp** và không chạy mã.

## Hai loại mã

| Loại | Dùng khi | Ví dụ |
|---|---|---|
| **Mã trong dòng** | tên biến, một biểu thức hay câu lệnh ngắn xen trong câu chữ | Điều kiện `p->Next == NULL` đúng khi nào? |
| **Khối mã** | đoạn mã từ một dòng trở lên đứng riêng, cần giữ thụt lề | cả một vòng lặp, một hàm |

Cả hai dùng được ở **Phần dẫn, Phương án, Mệnh đề** và **Hướng dẫn chấm**.

## 1. Soạn trên web

Thanh công cụ của mỗi ô soạn có hai nút: **Mã trong dòng** (biểu tượng `<>`) và **Khối mã** (ô vuông có `<>`).

### Mã trong dòng

- **Gõ mới:** bấm nút, gõ mã, bấm lần nữa để về chữ thường.
- **Chữ đã gõ:** bôi đen rồi bấm nút.

### Khối mã

1. Đặt con trỏ ở một dòng trống, bấm **Khối mã**.
2. Gõ hoặc dán mã (bấm nút **trước** rồi mới dán).
3. **Enter** xuống dòng. **Tab** thụt lề (2 dấu cách), **Shift+Tab** lùi lề. Điện thoại không có phím Tab thì gõ dấu cách.
4. Gõ tiếp chữ thường bên dưới: nhấn **Enter ba lần**, hoặc mũi tên xuống ở cuối khối.

| Muốn | Làm |
|---|---|
| Đổi đoạn đã gõ (xuống dòng bằng **Shift+Enter**) thành khối mã | đặt con trỏ trong đoạn, bấm **Khối mã**: giữ nguyên các dòng |
| Đổi nhiều đoạn (mỗi dòng gõ bằng **Enter**) thành một khối | nếu bấm nút sẽ ra nhiều khối rời: hãy cắt, dán vào một khối mã mới rồi xóa dòng trống thừa |
| Bỏ khối mã, trở về chữ thường | đặt con trỏ trong khối, bấm **Khối mã** lần nữa |
| Đưa mã từ trang web vào | chép rồi dán: đoạn mã định dạng sẵn trên trang thành khối mã, giữ thụt lề |

Phím tắt: **Ctrl+E** (máy Mac: Cmd+E) mã trong dòng; **Ctrl+Alt+C** khối mã; **Esc** rồi **Tab** để rời ô soạn bằng bàn phím.

Trong trình soạn, gõ hay dán dấu `` ` ``, `` ``` ``, `*`, `_` **giữ nguyên là chữ**; muốn có mã phải dùng nút hoặc phím tắt.

Ô soạn hiện mã nguyên như bạn gõ (chưa có số dòng). Mở **Xem thử** để thấy đúng như Người dự thi sẽ thấy, rồi **Lưu**.

## 2. Nhập từ Excel

| Cần gì | Viết trong ô |
|---|---|
| Mã trong dòng | đặt giữa hai dấu `` ` `` trên cùng một dòng: `` `p->Next` `` |
| Khối mã | một dòng chỉ có `` ``` `` để mở, các dòng mã, một dòng chỉ có `` ``` `` để đóng |
| Xuống dòng trong ô | **Alt+Enter** |
| Thụt lề | gõ dấu cách (phím Tab trong Excel chuyển sang ô khác) |

Ví dụ một ô **Nội dung**:

````text
Đoạn sau in ra gì khi `n = 3`?
```c
for (i = 0; i < n; i++)
    s = s + i;
```
````

- Sau `` ``` `` mở khối **được phép** ghi tên ngôn ngữ liền một từ (`c`, `C++`, `c#`, `python`, `sql`…); tên này bị bỏ đi, không hiện ra. Dòng **đóng** chỉ gồm `` ``` ``.
- Trong mã, dấu `$` là chữ thường (ngoài mã, `$...$` vẫn là công thức toán).

### Khi muốn in chính dấu `` ` ``

| Viết trong ô | Hiện ra |
|---|---|
| một dấu `` ` `` lẻ trong dòng | giữ nguyên |
| `` `date` `` | **date** thành mã, mất hai dấu |
| `` \`date\` `` | `` `date` `` là chữ |
| `\`\`\`` | ` ``` ` là chữ |
| dấu `` ` `` bên trong khối mã | giữ nguyên, **không** thêm `\` |
| dấu `` ` `` bên trong mã trong dòng | viết `` \` `` |

Cách chắc chắn ở ngoài mã: thêm `\` trước **từng** dấu `` ` `` muốn in.

Dòng chỉ gồm `` ``` `` nằm **bên trong** một khối mã (ví dụ câu hỏi dạy Markdown) sẽ đóng khối: câu như vậy hãy soạn trên web.

### Kiểm trước khi tạo

Ở bước xem trước, bấm **Xem** vài câu có mã. Nếu thấy dấu `` ` `` hoặc `` ``` `` còn hiện thành chữ thì khối chưa có dòng đóng hoặc cặp dấu bị lệch: sửa file, tải lại.

Excel có thể tự sửa chữ khi gõ (ví dụ đổi `(c)` thành ©, `-->` thành mũi tên). Nếu mã bị đổi, bấm **Ctrl+Z** ngay sau khi Excel đổi, hoặc tắt trong **File → Options → Proofing → AutoCorrect Options**.

Dấu trừ trong mã phải là `-` trên bàn phím. Mã chép từ Word hay PDF đôi khi mang dấu `−`, `“ ”` khác với dấu của ngôn ngữ lập trình: hệ thống giữ nguyên chứ không tự sửa.

## 3. Người dự thi thấy gì

Màn làm bài, **Xem thử**, màn chấm, xem Kết quả và Phúc khảo dùng chung một cách hiển thị:

- Mã dùng phông đơn cách, nền nhạt.
- Khối mã từ **hai dòng** trở lên có **số dòng**; khối một dòng không có số.
- Dòng dài **tự xuống hàng**, không phải cuộn ngang. Hàng xuống thêm thụt vào và **không có số**, nên không nhầm với dòng mới. Câu hỏi có thể nhắc "dòng 3".
- Chỉ xuống hàng ở khoảng trắng; cụm dài hơn cả màn hình mới bị ngắt giữa chừng.
- Tab hiện rộng 2 dấu cách.
- Chỉnh **cỡ chữ** ở nút **Hiển thị** thì mã to theo.

Danh sách câu hỏi, hộp chọn câu và bảng xem trước khi nhập chỉ hiện **một đoạn chữ rút gọn** (không định dạng mã); bấm vào câu để xem đầy đủ.

## 4. Xuất đề ra Word

Xuất Bộ đề như thường (nút **Xuất Bộ đề**). Trong tệp Word:

- Mã dùng phông **Courier New**.
- Khối mã nằm trong khung viền; từ hai dòng có **số dòng khớp với màn hình**; dòng dài tự xuống thẳng cột mã, không có số.
- Câu có Phương án là khối mã thì mỗi Phương án xếp một dòng.
- Tab thành 2 dấu cách.
- Tệp **Đáp án và thang điểm** in mã trong Hướng dẫn chấm cùng cách đó.

Muốn đổi cỡ hay phông cho cả tệp, sửa các kiểu của Word: **Khối mã**, **Khối mã có số dòng**, **Chữ khối mã**, **Số dòng**, **Mã trong dòng**.

Nên mở tệp và lướt qua các câu có mã trước khi in.

## 5. Giới hạn

| Mục | Giới hạn |
|---|---|
| Một khối mã | tối đa 4.000 ký tự (tính cả khoảng trắng) và 200 dòng |
| Chữ trong mã | vẫn tính vào giới hạn chung của Phần dẫn, Phương án |
| Khối mã trong danh sách đánh dấu, đánh số | không được |
| Định dạng đậm, nghiêng trên mã | không được |

Quá giới hạn: trình soạn không nhận phần vừa thêm và báo ngay; nhập Excel thì dòng đó báo **Khối mã dài quá 4.000 ký tự hoặc 200 dòng**.

## 6. Sự cố thường gặp

| Hiện tượng | Nguyên nhân và cách sửa |
|---|---|
| Thấy nguyên dấu `` ``` `` trong câu đã nhập | thiếu dòng đóng, hoặc dòng đóng còn chữ khác: sửa trên web (bấm **Khối mã**) hoặc xóa câu và nhập lại |
| Một đoạn chữ bình thường lại thành mã | ô có cặp dấu `` ` `` dùng như chữ: thêm `\` trước mỗi dấu |
| Mã bị mất thụt lề | thụt lề trong Excel phải là dấu cách |
| Nhập lại file đã sửa thì báo **Nghi trùng** | hệ thống so nội dung chữ, không so định dạng: xóa câu cũ trước khi nhập lại |
| Trang đang mở không có nút soạn mã | tải lại trang |

## 7. Danh sách kiểm trước kỳ thi

1. Mở **Xem thử** Bộ đề, lướt các câu có mã trên điện thoại.
2. Xuất Word một Mã đề, kiểm số dòng và thụt lề.
3. Nếu đề nhắc "dòng N", đối chiếu đúng số dòng.
