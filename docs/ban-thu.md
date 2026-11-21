# Nguồn gốc các bản thử (prototype)

Bản thử là mã bỏ đi để trả lời **một câu hỏi thiết kế** trước khi viết mã thật. Quy ước của dự án ([README](../README.md), mục Quy trình phát triển): bản thử nằm ở nhánh `prototype/*` và **không trộn vào `main`**. Phần đã được chủ dự án duyệt thì đã vào mã thật; tài liệu này là sổ tra cứu: mỗi bản thử trả lời câu hỏi gì, kết luận ra sao, quyết định ghi ở đâu, và xem lại bản thử bằng cách nào.

Không trộn bản thử vào `main` vì: (1) mã thử nằm trong `apps/web/src/routes` sẽ bị gói vào bản build web và thành đường dẫn truy cập được thật ở production; (2) kéo theo các bài E2E của bản thử vào CI; (3) một số bản thử sửa cả tệp giao diện thật theo một phương án chưa chốt. Image triển khai build nhiều giai đoạn nên các tệp ngoài `apps/web/dist` và `/out` của API không làm image to thêm; vấn đề là (1) và (2), không phải kích thước.

## Sổ các bản thử

| Nhánh | Ngày | Câu hỏi đã trả lời | Kết luận | Đã vào mã thật | Quyết định ghi ở |
|---|---|---|---|---|---|
| `prototype/exam-taking-ui` | 28/10/2026 | Màn **làm bài trên điện thoại** nên thiết kế thế nào? (ba biến thể A, B, C) | Giữ **hai chế độ xem** chuyển qua lại bất cứ lúc nào: "1 câu" (A) và "Cả đề" (B); bỏ biến thể C. Bảng màu **teal** của bản thử này thành bản sắc của cả hệ thống | Lát cắt 4c (khu làm bài `/take`) | [architecture.md](architecture.md) mục 7; [ui-design.md](ui-design.md) Q100 đến Q105; [plan/slice-4.md](plan/slice-4.md) Q240 |
| `prototype/ui-theme` | 29/10/2026 | Bảng màu thống nhất và **khung ứng dụng thích ứng** (thanh bên trên máy tính, thanh tab dưới đáy trên điện thoại) trông thế nào khi áp bằng thành phần thật? Ảnh trước và sau | Duyệt: bảng màu teal cho mọi khu vực (sáng và tối), một khung dùng chung cho Quản trị viên và Người ra đề, Người dự thi dùng khung riêng | PR giao diện #10 (`apps/web/src/lib/ui/app-shell.tsx`) | [ui-design.md](ui-design.md) mục 3 (màu, Q100) và mục 9 (khung ứng dụng, Q106 và Q107); [ui-review.md](ui-review.md) |
| `prototype/theo-doi` | 3/11/2026 | Màn **Theo dõi phòng thi** (300 người, trạng thái đổi theo thời gian) nên là bảng, lưới ghế hay "ngoại lệ trước"? (Q207) | Chủ dự án **yêu cầu gộp**: mỗi phương án thành một chế độ xem (A là Bảng, B là Lưới, C là Thẻ), kèm lọc "Cần chú ý", chọn nhóm và thao tác cả phòng; mặc định theo số người trong Danh sách | PR 4d-2 (#48), `lib/ui/monitor/` | [plan/slice-4.md](plan/slice-4.md) Q207, Q252 đến Q254; [ui-design.md](ui-design.md) mẫu Theo dõi |
| `prototype/cham-bai` | 7/11/2026 | Màn **Chấm câu tự luận** nên bố cục thế nào? (Q110, Q290 đến Q293): A chia đôi, B một bài mỗi màn, C bảng, D kết hợp A và B | Chủ dự án chọn **phương án D**, thêm thanh chọn câu khi có nhiều câu tự luận và ghi chú đối chiếu số câu | PR 5b-2 (#64) | [plan/slice-5.md](plan/slice-5.md), mục PR 5b |
| `prototype/xuat-bo-de-cong-thuc` | 19/11/2026 | **Xuất Bộ đề ra Word (X0):** công thức LaTeX có sang được công thức Word (OMML) gốc, sửa được, trong .docx tự dựng không? | Được: hướng **LaTeX, KaTeX (MathML), rồi OMML** bằng `mathml2omml`, tự dựng WordprocessingML bằng JSZip; chủ dự án chốt dùng `mathml2omml` | PR X1 (#120) và các PR X2 đến X5 | [plan/xuat-bo-de-thiet-ke.md](plan/xuat-bo-de-thiet-ke.md) mục 5.1, 5.2 và bảng lộ trình X0 |

Nhánh còn lại trên `origin`. Mỗi nhánh nằm ngoài `main`; các tệp thử nằm ở:

- `prototype/exam-taking-ui`: `prototypes/exam-taking-ui/index.html` (một tệp HTML, mở trực tiếp bằng trình duyệt).
- `prototype/ui-theme`: ảnh chụp trong `prototypes/ui-theme/khung-moi/` và `so-sanh/`, ghi chú ở `prototypes/ui-theme/README.md`; kèm các tệp giao diện thật đã sửa theo phương án thử.
- `prototype/theo-doi`: `apps/web/src/prototype/theo-doi/`, trang thử `/examiner/sessions/theo-doi-thu`, bài E2E `apps/web/e2e/prototype-theo-doi*.spec.ts`.
- `prototype/cham-bai`: `apps/web/src/prototype/cham-bai/`, trang thử `/examiner/sessions/cham-thu`, bài E2E `apps/web/e2e/prototype-cham-bai.spec.ts`.
- `prototype/xuat-bo-de-cong-thuc`: `apps/api/prototypes/xuat-bo-de-x0/` (có `package.json` riêng, `run.ts`, mẫu kết quả `out/mau-x0.docx`).

## Mã băm của đầu nhánh (đề phòng nhánh bị xóa nhầm)

Nếu một nhánh mất, tạo lại từ mã băm: `git branch prototype/<tên> <mã băm>` (chỉ làm được khi các commit còn trên máy chủ hoặc trong bản sao cục bộ).

| Nhánh | Mã băm đầu nhánh |
|---|---|
| `prototype/exam-taking-ui` | `76e3d7516151c2333124ed697bb418fdfbfeace6` |
| `prototype/ui-theme` | `a963f87cba06085de08acaeef34312d357d10063` |
| `prototype/theo-doi` | `c396b3c76ff344955fd018055b90c05eac165922` |
| `prototype/cham-bai` | `12d888bad715391c1063b5513e6edbac897c5fc3` |
| `prototype/xuat-bo-de-cong-thuc` | `0920322a7263689d19b0a56d5be7d6f7432d9f85` |

## Xem lại một bản thử

```bash
git fetch origin
git switch prototype/theo-doi      # hoặc tên nhánh khác
pnpm install && pnpm dev           # rồi mở đường dẫn trang thử ở danh sách tệp phía trên
```

Các trang thử `theo-doi` và `cham-bai` dùng dữ liệu giả nhưng nằm sau đăng nhập, nên cần chạy cả API (`pnpm dev` chạy cả hai) và đăng nhập bằng tài khoản Người ra đề. Không bao giờ đưa nhánh `prototype/*` lên production.

## Khi thêm bản thử mới

1. Tạo nhánh `prototype/<tên>` từ `main`, đặt mã thử gần nơi sẽ dùng, đặt tên rõ là thử (thư mục `prototype`, tiêu đề commit bắt đầu bằng "PROTOTYPE").
2. Đẩy lên GitHub, không mở PR vào `main`.
3. Khi chủ dự án chọn phương án: ghi quyết định vào tài liệu thiết kế, **thêm một dòng vào bảng trên** (câu hỏi, kết luận, nơi ghi quyết định) và mã băm đầu nhánh, rồi làm bản thật ở một PR riêng.
