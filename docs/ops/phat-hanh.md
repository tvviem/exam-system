# Gắn tag và ghi chú phát hành (GitHub Release)

> **Trạng thái: đề xuất, chờ chủ dự án duyệt.** Viết ngày 18/11/2026, sau khi bản 0.1 chạy thật.

Hệ thống đang vận hành, có người dùng thật. Tag và ghi chú phát hành là cách để mọi người, kể cả chính chủ dự án sau vài tháng, trả lời nhanh bốn câu hỏi: **prod đang chạy bản nào, bản đó khác bản trước ở đâu, khi có sự cố thì lùi về đâu, và cần làm gì tay khi nâng cấp.**

Nhãn "bản" ở đây không thay cách deploy. Deploy vẫn dùng **mã commit đầy đủ** ([trien-khai.md](./trien-khai.md)); tag là tên dễ đọc đặt trên một mã commit đã chạy thật.

## 1. Tôn chỉ

1. **Chỉ gắn tag cho commit đã chạy thật ở prod và đã được kiểm tra.** Không gắn trước khi deploy, không gắn cho commit chưa ai thấy chạy. Tag là lời cam kết "bản này đã chạy tốt", nên phải có bằng chứng.
2. **Không gắn tag cho thay đổi chỉ có tài liệu.** Prod không đổi thì không có phiên bản mới.
3. **Tag không bao giờ bị dời hay xóa sau khi đã đẩy lên GitHub.** Gắn sai thì để nguyên, ghi chú lại trong Release, rồi gắn tag mới (ví dụ `v0.1.2`).
4. **Mỗi tag có một Release trên GitHub**, viết cho người đọc là chủ dự án và Quản trị viên, không phải lập trình viên (mục 4).
5. **Ghi chú phát hành là tài liệu công khai** (repo công khai): không bí mật, không dữ liệu người thật, không địa chỉ hay đường dẫn nội bộ của máy, và không mô tả chi tiết một lỗ hổng bảo mật chưa được vá xong (mục 5).

## 2. Đánh số: `vMAJOR.MINOR.PATCH` (SemVer, giai đoạn 0.x)

| Tăng | Khi nào | Ví dụ |
|---|---|---|
| **MINOR** (`0.2.0`) | thêm tính năng, đổi hành vi người dùng thấy, có migration cơ sở dữ liệu, có việc phải làm tay khi nâng cấp | "Rút câu theo Phần" |
| **PATCH** (`0.1.1`) | sửa lỗi, không thêm tính năng, không migration, không việc làm tay | họ tên đầu trang đổi ngay sau khi lưu |
| **MAJOR** (`1.0.0`) | **do chủ dự án quyết.** Đề xuất: sau Phiên thi thật đầu tiên chạy tốt và sao lưu đã khôi phục thử thành công | |

Còn nghi ngờ MINOR hay PATCH thì chọn MINOR: có migration hoặc việc làm tay là MINOR, bất kể thay đổi nhỏ đến đâu.

## 3. Thứ tự làm (sau mỗi lần deploy một thay đổi có hành vi mới)

```text
merge PR → deploy (workflow GitHub, có sao lưu trước) → kiểm trên prod → gắn tag → đẩy tag → tạo Release
```

1. **Kiểm trên prod, không chỉ CI xanh:** `make -C infra prod-status` (bản đang chạy đúng mã commit), `prod-preflight` không có mục ✗, và chính người sửa tự thử hành vi đã sửa hoặc thêm trên giao diện thật.
2. **Gắn tag chú thích trên đúng commit đang chạy** (đối chiếu `~/.local/state/exam-prod/tag`), thân tag ghi: ngày deploy, mã commit, kết quả kiểm sau deploy.
   ```bash
   git tag -a v0.1.1 <mã commit đang chạy> -m "BLUni Exam 0.1.1 - <một dòng mô tả>" -m "<ngày deploy, mã commit, đã kiểm gì>"
   ```
3. **Đẩy tag** (`git push origin v0.1.1`) và **tạo Release** (mục 4). Đẩy tag và tạo Release là hành động công khai, nên người có quyền làm chỉ làm khi chủ dự án đã đồng ý.
4. **Không deploy và không gắn tag trong giờ thi** ([checklist-phien-thi.md](./checklist-phien-thi.md)).

## 4. Ghi chú Release: mẫu

Dùng ngôn ngữ nghiệp vụ của [GLOSSARY.md](../../GLOSSARY.md) (Người ra đề, Người dự thi, Lượt làm bài…), câu ngắn, mỗi ý một dòng. Bỏ mục nào không có nội dung, **trừ mục "Khi nâng cấp"** (ghi "Không cần làm gì thêm" nếu đúng như vậy).

```markdown
## BLUni Exam 0.1.1

### Điểm mới
- <điều người dùng làm được mà trước đó chưa làm được>

### Sửa lỗi
- <triệu chứng người dùng đã thấy> → <nay ra sao>

### Khi nâng cấp
- Migration cơ sở dữ liệu: <có / không; tên>
- Việc phải làm tay: <không / liệt kê>
- Biến môi trường mới: <không / tên, không ghi giá trị>

### Phiên bản
- Mã commit: `<mã commit đầy đủ>`; ảnh: `ghcr.io/tvviem/exam-api:<mã commit>`, `ghcr.io/tvviem/exam-web:<mã commit>`
- **Bản trước (điểm lùi):** `v0.1.0` (`3a1f971…`)
- Thay đổi so với bản trước: <liên kết so sánh, danh sách PR>
- Đã kiểm sau deploy: <kiểm gì, kết quả>
```

Đặt tiêu đề Release theo mẫu `BLUni Exam <số bản>`. Tạo Release từ tệp ghi chú:

```bash
gh release create v0.1.1 --verify-tag --title "BLUni Exam 0.1.1" --notes-file ghi-chu.md
```

## 5. Không đưa vào ghi chú (repo công khai)

- Mật khẩu, khóa, token, giá trị biến môi trường, nội dung `api.env`.
- Tên, mã sinh viên, email của người thật; ảnh chụp có dữ liệu thật.
- Đường dẫn trên máy chủ, địa chỉ nội bộ, tên bucket sao lưu.
- Cách khai thác một lỗ hổng bảo mật chưa vá xong. Lỗi bảo mật chỉ ghi "sửa lỗi bảo mật" kèm mức độ, sau khi đã deploy bản vá.

## 6. Vì sao cần (tóm tắt)

- **Biết prod đang chạy gì** bằng một cái tên có nghĩa thay cho dãy 40 ký tự.
- **Điểm lùi rõ ràng:** mỗi Release ghi bản trước, khi bản mới lỗi thì deploy lại mã commit đó (workflow có sẵn bước tự lùi).
- **Truy vết sự cố:** một sự cố giờ thi hỏi được "xảy ra ở bản nào, bản đó khác gì bản trước".
- **Báo thay đổi cho người dùng và Quản trị viên** mà không bắt họ đọc lịch sử commit.
- **Việc làm tay khi nâng cấp** (migration, biến môi trường) nằm ở một chỗ cố định, khỏi sót.

## 7. Việc còn bỏ ngỏ (chờ chủ dự án)

- Có tạo Release cho `v0.1.0` (hiện mới có tag, chưa có Release) không. Nếu có, dùng đúng mẫu ở mục 4, ghi "không có bản trước".
- Khi nào lên `1.0.0` (đề xuất ở mục 2).
