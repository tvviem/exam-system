# Prototype: bảng màu thống nhất theo prototype Người dự thi

Nhánh thử, **không merge vào `main`**. Đề xuất chính thức nằm ở `docs/ui-design.md` (nhánh `docs/ui-redesign`).

- `so-sanh/`: ảnh ghép trước / sau (desktop sáng và tối, điện thoại sáng và tối, màn Người dùng và Đăng nhập, bảng "Hiển thị" của Người dự thi).
- `anh-goc/truoc`, `anh-goc/sau`: ảnh chụp gốc 390 px và 1280 px, sáng và tối, của 6 màn hình (đăng nhập, Người dùng, yêu cầu chờ duyệt, yêu cầu đã duyệt, thông báo, menu tài khoản).
- Mã thử trên nhánh này: `apps/web/src/index.css` (token mới), `apps/web/public/theme-init.js` (màu thanh địa chỉ), `apps/web/src/routes/_authed.tsx` (biểu tượng thương hiệu ở thanh trên cùng).
- `prototypes/exam-taking-ui/index.html`: prototype Người dự thi cũ, thêm nút **Aa** mở bảng "Hiển thị" (chế độ xem 1 câu / Cả đề, giao diện sáng/tối/theo máy, cỡ chữ, kiểu chữ có chân/không chân). Mở file này trực tiếp bằng trình duyệt (cần mạng để tải font và MathJax).

Ảnh "sau" mới chỉ đổi màu và thêm biểu tượng thương hiệu; các lỗi bố cục ở mục 0 của `docs/ui-design.md` (thanh điều hướng 3 hàng, câu gợi ý cũ, thanh hành động dính đáy...) chưa sửa vì thuộc đề xuất Q103.

## Khung ứng dụng thích ứng (bản thử)

`apps/web/src/lib/ui/app-shell.tsx` + `routes/_authed.tsx`: từ 1024 px thanh bên cố định; dưới 1024 px thanh tab dưới đáy (tối đa 5 mục, mục thứ 5 là "Thêm"). Bỏ thanh tab ngang của khu quản trị. Bảng Người dùng ở 768–1023 px ẩn cột Mã và Lớp, gộp thành dòng phụ dưới tên. Ảnh ghép ở `khung-moi/`, ảnh gốc 390/768/1024/1440 px sáng và tối ở `anh-goc/khung-moi/`.
