# Gắn tag và ghi chú phát hành (GitHub Release)

> **Trạng thái: đang áp dụng.** Viết ngày 18/11/2026 sau khi bản 0.1 chạy thật; chủ dự án đã duyệt tôn chỉ và ngày 22/11/2026 chốt tạo Release cho cả bốn tag (mục 7); bảng các bản và cách lùi ở mục 8.

Hệ thống đang vận hành, có người dùng thật. Tag và ghi chú phát hành là cách để mọi người, kể cả chính chủ dự án sau vài tháng, trả lời nhanh bốn câu hỏi: **prod đang chạy bản nào, bản đó khác bản trước ở đâu, khi có sự cố thì lùi về đâu, và cần làm gì tay khi nâng cấp.**

Nhãn "bản" ở đây không thay cách deploy. Deploy vẫn dùng **mã commit đầy đủ** ([trien-khai.md](./trien-khai.md)); tag là tên dễ đọc đặt trên một mã commit đã chạy thật.

## 1. Tôn chỉ

1. **Chỉ gắn tag cho commit đã chạy thật ở prod và đã được kiểm tra.** Không gắn trước khi deploy, không gắn cho commit chưa ai thấy chạy. Tag là lời cam kết "bản này đã chạy tốt", nên phải có bằng chứng.
2. **Không gắn tag cho thay đổi chỉ có tài liệu.** Prod không đổi thì không có phiên bản mới.
3. **Tag không bao giờ bị dời hay xóa sau khi đã đẩy lên GitHub.** Gắn sai thì để nguyên, ghi chú lại trong Release, rồi gắn tag mới (ví dụ `v0.1.2`).
4. **Mỗi tag có một Release trên GitHub**, viết cho người đọc là chủ dự án và Quản trị viên, không phải lập trình viên (mục 4).
5. **Ghi chú phát hành là tài liệu công khai** (repo công khai): không bí mật, không dữ liệu người thật, không địa chỉ hay đường dẫn nội bộ của máy, và không mô tả chi tiết một lỗ hổng bảo mật chưa được vá xong (mục 5).

## 2. Đánh số: `vMAJOR.MINOR.PATCH` (SemVer)

| Tăng | Khi nào | Ví dụ |
|---|---|---|
| **MAJOR** (`1.0.0`) | **thay đổi lớn về kiến trúc hệ thống hoặc mô hình cơ sở dữ liệu** (chủ dự án quyết, 18/11/2026). Bản `0.x` đầu tiên có thay đổi như vậy lên `1.0.0`; từ đó mỗi thay đổi lớn như vậy nâng MAJOR kế tiếp. **Quyết định 24/11/2026:** Mã đề (`0030`, thêm cột vào bảng đang có dữ liệu) vẫn gắn `0.5.0`; `1.0.0` để dành cho khi hệ thống đã vận hành ổn định, ít đổi chức năng và chủ yếu điều chỉnh UX/UI, nâng cấp chức năng hoàn chỉnh (chủ dự án) | |
| **MINOR** (`0.2.0`) | thêm tính năng, đổi hành vi người dùng thấy, có migration cơ sở dữ liệu nhỏ, có việc phải làm tay khi nâng cấp | |
| **PATCH** (`0.1.1`) | sửa lỗi, không thêm tính năng, không migration, không việc làm tay | họ tên đầu trang đổi ngay sau khi lưu |

**Nhận biết "thay đổi lớn":** thay đổi đó đi qua quy trình duyệt thiết kế của [AGENTS.md](../../AGENTS.md), tức có tài liệu hoặc ADR ở [docs/adr/](../adr) (viết ADR mới thay thế ADR cũ) hoặc sửa mô hình dữ liệu trong [docs/data-model.md](../data-model.md) theo cách đổi cấu trúc bảng đã có dữ liệu. Chủ dự án là người xác nhận khi chưa rõ.

Còn nghi ngờ giữa các mức thì chọn mức cao hơn: có migration hoặc việc làm tay là ít nhất MINOR, bất kể thay đổi nhỏ đến đâu.

### Cách đọc ba số

Mỗi lần phát hành chỉ tăng **một** số; các số đứng sau nó quay về 0. Số không bị giới hạn ở 9 (`0.1.9` rồi `0.1.10`).

```text
   0  .  1  .  0
   │     │     └─ PATCH: sửa lỗi
   │     └─────── MINOR: có tính năng mới
   └───────────── MAJOR: thay đổi lớn về kiến trúc hoặc mô hình cơ sở dữ liệu
```

| Sự kiện (ví dụ) | Tag | Số nào tăng |
|---|---|---|
| Bản đầu tiên đã chạy thật | `v0.1.0` | |
| Sửa họ tên đầu trang đổi ngay sau khi lưu hồ sơ | `v0.1.1` | PATCH |
| Sửa thêm một lỗi nhỏ nữa (giả định) | `v0.1.2` | PATCH |
| Thêm một tính năng mới (giả định) | `v0.2.0` (không phải `v0.1.3`) | MINOR; PATCH về 0 |
| Sửa lỗi của tính năng đó (giả định) | `v0.2.1` | PATCH |
| Thay đổi lớn về kiến trúc hoặc mô hình dữ liệu (giả định) | `v1.0.0` | MAJOR; MINOR và PATCH về 0 |

Nhìn hai tag là biết mức rủi ro khi chuyển từ bản này sang bản kia:

| Chuyển | Ý nghĩa với người nâng cấp |
|---|---|
| `0.1.0` → `0.1.3` | chỉ sửa lỗi, rủi ro thấp |
| `0.1.3` → `0.2.0` | có tính năng mới, đọc ghi chú phát hành trước |
| `0.2.0` → `1.0.0` | thay đổi lớn, cần chuẩn bị: sao lưu, đọc kỹ ghi chú, biết điểm lùi |

Chuẩn SemVer chung coi mọi bản `0.x.y` là "chưa ổn định"; dự án này vẫn áp dụng các quy tắc trên cho cả `0.x`.

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

## 7. Các quyết định đã chốt (từng là việc bỏ ngỏ)

- **Release cho mọi tag** (chủ dự án chốt 22/11/2026): `v0.1.0`, `v0.1.1`, `v0.2.0`, `v0.3.0` đều có Release, viết theo mẫu mục 4; bản đầu tiên ghi "không có bản trước". Mục đích chính là **điểm lùi**: mỗi Release nêu mã commit đầy đủ của bản trước để deploy lại khi bản mới lỗi.
- **"Rút câu theo Phần" là `0.3.0` (MINOR), không phải `1.0.0`:** chỉ thêm hai bảng và hai trigger, không đổi cột nào của bảng đang có dữ liệu, không đổi kiến trúc; bản `0.2.0` vẫn chạy được trên cơ sở dữ liệu của `0.3.0`. `1.0.0` vẫn dành cho thay đổi lớn về kiến trúc hoặc mô hình dữ liệu (cách nhận biết ở mục 2).
- **Hai nhóm góp ý sau buổi chạy thử (nút Thêm câu hỏi và Chi tiết câu hỏi khi soạn Bộ đề; thẻ tổng quan, chuyển Phần và lọc ở Bộ đề đã phát hành) là `0.5.1` (PATCH), không phải `0.6.0`** (chủ dự án chốt 24/11/2026): không đổi dữ liệu, API hay nghiệp vụ, chỉ chỉnh giao diện theo góp ý khi chạy thử; giai đoạn trước `1.0.0` chủ yếu là chỉnh UX/UI nên các đợt như vậy tăng số PATCH.
- **Đợt rà UX/UI sau `0.5.1` (sáu điểm: bảng câu hỏi, Tổng quan Phiên thi, trang Kết quả, trang đầu của Người ra đề, màn Vào thi, trợ năng) là `0.5.2` (PATCH)** (chủ dự án duyệt 24/11/2026): chỉ chỉnh giao diện, không đổi dữ liệu, API hay nghiệp vụ; cùng lý do với `0.5.1`.
- **Thiết kế lại màn làm bài chế độ Từng câu (góp ý của chủ dự án sau khi chạy thử cả luồng) là `0.5.3` (PATCH)** (chủ dự án duyệt 25/11/2026): chỉ đổi cách bố trí và cuộn của giao diện, không đổi dữ liệu, API hay nghiệp vụ chấm và lưu bài.
- **Hai lỗi hiển thị tìm ra khi chụp ảnh hướng dẫn và khi chủ dự án dùng thử trên điện thoại thật (chữ tiếng Anh ở Tài khoản của tôi; tên Chủ đề dài tràn ngang hoặc bị cắt ở Ngân hàng câu hỏi) là `0.5.4` (PATCH)** (chủ dự án chốt 25/11/2026): chỉ sửa giao diện, không đổi dữ liệu, API hay nghiệp vụ. Ba hướng dẫn theo vai (chỉ tài liệu và công cụ) đi cùng bản này nhưng không tự tạo bản mới (mục 1, điều 2).
- **Quy mô lớn và mã lệnh trong Câu hỏi là `0.6.0` (MINOR)** (chủ dự án chốt 27/11/2026): migration `0031` chỉ thêm chỉ mục, `0032` thêm một cột (và trigger) vào bảng người dùng đang có dữ liệu, không đổi kiến trúc; bản cũ vẫn chạy trên cơ sở dữ liệu mới. `1.0.0` vẫn để dành cho khi hệ thống ổn định (quyết định 24/11/2026, mục 2).

## 8. Các bản đã phát hành và cách lùi

| Tag | Ngày | Mã commit đầy đủ | Bản trước (điểm lùi) | Ghi chú khi lùi về |
|---|---|---|---|---|
| `v0.1.0` | 18/11/2026 | `3a1f9715c874b4eda1a45895ba12f8f57f081c30` | không có | bản đầu tiên chạy thật |
| `v0.1.1` | 19/11/2026 | `54c5bae68bee49268b6eb86a93d47f9150fbeb62` | `v0.1.0` | không migration; lùi an toàn |
| `v0.2.0` | 20/11/2026 | `8c482207a8a3569210140f390a7959bc39af3102` | `v0.1.1` | không migration; lùi an toàn (mất nút Xuất Bộ đề ra Word) |
| `v0.3.0` | 22/11/2026 | `508493709c993dc9b35066dc59c5197e877cab4f` | `v0.2.0` | migration `0028`, `0029` chỉ thêm bảng nên bản cũ vẫn chạy, **nhưng Phiên thi đã cấu hình Rút câu sẽ làm đủ mọi câu**: chỉ lùi khi chưa có Phiên thi thật dùng Rút câu |
| `v0.3.1` | 22/11/2026 (deploy), tag gắn bù 24/11/2026 | `f92e027cca5c967a6556c4a2b1f07ffffcdbae24` | `v0.3.0` | chỉ giao diện, không migration; lùi an toàn |
| `v0.4.0` | tag gắn bù 24/11/2026 | `e9a19f22610aa096c56452d25af66f6d87a19084` | `v0.3.1` | chỉ giao diện, không migration; lùi an toàn. Commit này **chưa từng deploy riêng** (chạy ở prod cùng `7c8ac07`, 23/11/2026), nên ảnh của đúng commit này có thể không còn trên máy |
| `v0.5.0` | 24/11/2026 | `a44182cd02ef2e9a3f7a86a2252ed740c4efe7da` | `v0.4.0` | migration `0030` chỉ thêm (bảng, cột, trigger) nên bản cũ vẫn chạy, **nhưng bản cũ không biết Mã đề: Phiên thi dùng chung Mã đề sẽ bị rút riêng từng người**: chỉ lùi khi chưa có Phiên thi thật dùng chung Mã đề. Tag gắn khi prod còn chạy `7c8ac07`; chủ dự án deploy `a44182c` để chạy thử với dữ liệu |
| `v0.5.1` | 24/11/2026 | `fcc062252859279bc80a749ce073c41fb579b4e2` | `v0.5.0` | chỉ giao diện, không migration; lùi an toàn (mất nút Thêm câu hỏi ở thanh dính, Chi tiết câu hỏi, thẻ tổng quan, chuyển Phần và lọc của Bộ đề đã phát hành) |
| `v0.5.2` | 24/11/2026 | `5aa96ed5547a1e4198d35c26fbc5f4cbe61ff7bf` | `v0.5.1` | chỉ giao diện, không migration; lùi an toàn (mất các chỉnh UX/UI của Phiên thi, Kết quả, Ngân hàng câu hỏi, màn Vào thi và trợ năng) |
| `v0.5.3` | 25/11/2026 | `d1056ef3a811dae5ee25d39361ad4a3131f3a4ae` | `v0.5.2` | chỉ giao diện, không migration; lùi an toàn (mất cách bố trí mới của màn làm bài chế độ Từng câu: chip Mã đề, thanh dưới "Câu n/N", nút Hướng dẫn, chuyển chế độ trong bảng Aa, cuộn tới đầu câu hỏi khi chuyển câu) |
| `v0.5.4` | 25/11/2026 | `bc0819b3826a1cf2e34557cf4a456c14cdfd4cbe` | `v0.5.3` | chỉ giao diện, không migration; lùi an toàn (quay lại chữ tiếng Anh ở Tài khoản của tôi, chip Chủ đề tràn ngang trên điện thoại và cột Chủ đề bị cắt "…" trên máy tính) |
| `v0.6.0` | 27/11/2026 | `0ff90ddfb515a02a316b8d1f9348a0b90d0ebd3e` | `v0.5.4` | migration `0031` (chỉ mục), `0032` (cột tìm kiếm người dùng, cần `pg_trgm`; khóa bảng người dùng trong lúc chạy) chỉ thêm nên bản cũ vẫn chạy, **nhưng bản cũ không đọc được mã lệnh**: chỉ lùi về `v0.5.4` khi chưa có Câu hỏi nào chứa mã, đã có thì không lùi xa hơn commit `a62ef63eaccb4db5473e59e846a78dfca9198d63`. Giữa hai tag prod đã chạy các commit trung gian từ ngày 26/11 |

**Cách lùi:** Actions → **Deploy (bấm tay)** → Run workflow, điền **mã commit đầy đủ** của bản muốn lùi vào ô *Mã commit* (workflow từ chối nếu mã không thuộc `main` hoặc ảnh không còn trên máy; ảnh của 3 bản gần nhất được giữ sẵn), duyệt **Approve and deploy**. Chỉ lùi mã ứng dụng, không lùi dữ liệu. Chi tiết và bảng đọc Summary: [trien-khai.md](./trien-khai.md) mục "Deploy bằng GitHub". Tag không bao giờ bị dời hay xóa; tên ảnh luôn là `ghcr.io/tvviem/exam-api:<mã commit>` và `ghcr.io/tvviem/exam-web:<mã commit>`.
