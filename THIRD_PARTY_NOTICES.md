# Ghi chú giấy phép của thư viện bên thứ ba

Mã của dự án này là tài sản của chủ sở hữu (xem [LICENSE](LICENSE)). Các thư viện bên dưới là phần mềm của bên thứ ba, được dùng theo giấy phép riêng của từng thư viện. Tệp này chỉ ghi các thư viện cần nêu rõ vì giấy phép của chúng có điều kiện khi phân phối; danh sách đầy đủ của mọi phụ thuộc nằm trong `pnpm-lock.yaml`.

## mathml2omml (LGPL-3.0-or-later)

- **Dùng để làm gì:** chuyển công thức toán (MathML do KaTeX sinh ra) thành công thức Word (OMML) khi xuất Bộ đề ra tệp `.docx` (module `apps/api/src/modules/paper`, xem [docs/plan/xuat-bo-de-thiet-ke.md](docs/plan/xuat-bo-de-thiet-ke.md)).
- **Phiên bản và nguồn:** 0.5.0, https://github.com/fiduswriter/mathml2omml
- **Giấy phép:** GNU Lesser General Public License, phiên bản 3 hoặc mới hơn: https://www.gnu.org/licenses/lgpl-3.0.html
- **Cách dùng:** cài nguyên gói từ npm làm một phụ thuộc riêng (`apps/api/package.json`, phiên bản cố định), **không sửa mã của thư viện**. Các chỗ thư viện sinh OMML sai (ngoặc, ma trận, chữ Việt, và các lỗi khác) được xử lý bằng mã của dự án đứng ngoài thư viện (`apps/api/src/modules/paper/math/`), trước và sau khi gọi thư viện. Người nhận phần mềm có thể thay thư viện bằng phiên bản khác bằng cách đổi phụ thuộc và cài lại.
- **Quyết định:** chủ dự án chấp nhận giấy phép này ngày 19/11/2026.

## Các thư viện khác dùng cho tính năng xuất Bộ đề

| Thư viện | Giấy phép | Dùng để |
|---|---|---|
| jszip 3.10.2 | MIT hoặc GPL-3.0-or-later (dự án dùng theo MIT) | dựng gói `.docx` |
| @xmldom/xmldom 0.9 | MIT | đọc XML trong kiểm thử (chỉ phụ thuộc phát triển) |
| katex 0.19 | MIT | dựng công thức (đã dùng từ trước để kiểm khi lưu câu hỏi) |
