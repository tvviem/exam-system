# PROTOTYPE BỎ ĐI: X0 của "Xuất Bộ đề" (không đưa vào main)

Thiết kế: `docs/plan/xuat-bo-de-thiet-ke.md` (mục 5.1, 5.2, 9). Skill: `prototype`.

**Câu hỏi bản thử trả lời:** công thức LaTeX của ngân hàng câu hỏi có chuyển được thành công thức Word gốc (OMML) trong một `.docx` tự dựng bằng JSZip, hợp lệ, đủ nội dung và đọc được không?

## Chạy (một lệnh)

```
cd apps/api/prototypes/xuat-bo-de-x0 && npm install && node run.ts          # thêm --chi-tiet để xem khứ hồi
```

Ra `out/mau-x0.docx` (mở bằng **Word** để xem thật) và `out/ket-qua.json`. Cần Node 24 (chạy TypeScript trực tiếp). Phụ thuộc riêng, không đụng `package.json` của dự án.

## Kết quả (45 công thức đại diện đề STEM tiếng Việt; ngân hàng câu hỏi thật chưa có vì production đã reset)

| | Nguyên bản (KaTeX + `mathml2omml`) | Sau xử lý của bản thử |
|---|---|---|
| Hợp lệ về cấu trúc, không cảnh báo | **34/45** | **44/45** |
| Pandoc (bộ đọc độc lập) đọc lại được | | **44/44** công thức, chữ Việt đúng |
| Thời gian chuyển (45 công thức) | | tổng khoảng 55 ms, lớn nhất 7 ms |

Lỗi của `mathml2omml 0.5.0` phát hiện và đã sửa bằng xử lý trước và sau:
1. Chữ trần (không bọc `m:r/m:t`) trong toán tử n-ary: `\sum`, `\prod`, `\int` kèm số hạng sau (OMML không hợp lệ).
2. `m:sty m:val="undefined"` xuất hiện ở khoảng 1/4 công thức thường (OMML không hợp lệ).
3. Thứ tự sai của `w:rPr` và `m:rPr` trong `m:r`.
4. `\overline` ra `m:acc` thay vì `m:bar` của Word.
5. `\binom`: mất "không vạch" (hiện thanh phân số) và ngoặc rời; sửa thành `m:d` + `m:f noBar`.
6. `\mathbb{R}`: mất kiểu chữ; sửa bằng ký tự Unicode ℝ.
8. **Ngoặc `\left..\right` quanh ma trận, hệ phương trình, giá trị tuyệt đối** (phát hiện nhờ ảnh chụp Word của chủ dự án): `mathml2omml` không hỗ trợ `mfenced` và ghi ngoặc thành chữ thường nên không giãn theo chiều cao. Sửa: đánh dấu ngoặc ở tầng MathML theo cấu trúc `mrow` (tự bù ngoặc đóng rỗng cho `cases`), tách lượt chữ tại ký tự giữ chỗ (thư viện gộp các lượt liền kề), rồi ghép từng cặp từ trong ra ngoài thành `m:d`.
9. **Căn cột ma trận**: thư viện ghi cứng căn giữa; `aligned` cần phải-trái. Sửa: đặt `m:mcJc` theo `columnalign` của KaTeX.
7. **Chữ Việt trong `\text{}`**: chính KaTeX tách `ố` thành dấu toán học lồng nhau (sai với tiếng Việt); sửa bằng mã giữ chỗ rồi trả lại chữ thật (`m:nor`).

Còn lại cần dự phòng: `\overset{..}{=}` (OMML lồng sai, `mathml2omml` không sửa được), và `\xrightarrow` in cảnh báo `mpadded` (nội dung vẫn đúng).

## Đã kiểm chứng bằng Word (ảnh chụp của chủ dự án, 19/11/2026)

Word 2019 mở tệp được, công thức hiện là công thức Word gốc, "Câu N:" và "A. B." đậm xanh đúng mẫu, phương án dự phòng (chữ đỏ) của `\overset` hiện đúng ý. Hai lỗi nhìn thấy (ngoặc không giãn, `aligned` lệch) đã sửa ở mục 8 và 9, chờ xác nhận lại bằng bản v2.

## Chưa kiểm chứng được ở đây

- **Đầu trang, chân trang (Trang X/Y), bảng, hình trong Word**: chủ dự án chưa gửi ảnh phần này. Máy này không có Word hay LibreOffice.
- Bộ công thức là bộ đại diện tự viết, chưa phải dữ liệu thật.
- Phân số không vạch lồng phân số khác trong `\binom` chưa xử lý.
- `cases`, `pmatrix`, `aligned` ra `m:d` hoặc ma trận Word (căn cột theo `columnalign`), không phải mảng phương trình `m:eqArr` của Word.

## Giấy phép

`mathml2omml` (và hai bản fork) là **LGPL-3.0-or-later**; `latex-to-omml` (MIT) vẫn dùng nó. Cần chủ dự án quyết (xem báo cáo X0).
