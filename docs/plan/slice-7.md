# Lát cắt 7: tài khoản và mật khẩu: khôi phục khi quên, liên kết đặt lại một lần

Nâng cấp sau khi bản MVP chạy thật (lát cắt 6). Câu hỏi bắt đầu từ chủ dự án (10/11/2026): Người dự thi hoặc Người ra đề tạo tài khoản đã lâu, đã đổi mật khẩu từ lần đầu, rồi quên. Hệ thống xử lý được chưa, và có cách nào tốt hơn cho **tài khoản cá nhân** không? Mô tả cơ chế hiện tại đầy đủ ở [docs/ops/tai-khoan-va-mat-khau.md](../ops/tai-khoan-va-mat-khau.md).

## Tóm tắt các quyết định (để xem lại nhanh)

| Q | Quyết định | Ghi chú |
|---|---|---|
| Q371 | Làm theo **phương án C**: trước hết bổ sung kiểm thử trọn kịch bản và tài liệu hoàn chỉnh (PR 7a), sau đó mới thiết kế và làm **liên kết đặt lại dùng một lần** (PR 7b) | Kiểm thử là "lưới an toàn" trước khi sửa khu vực đăng nhập nhạy cảm |
| Q372 | Phạm vi bắt buộc email và số phận của Phiếu tài khoản: chọn **phương án B** (email chính chủ bắt buộc, kích hoạt và đặt lại qua email, bỏ Phiếu mật khẩu tạm, Quản trị viên có cửa thoát hiểm bằng liên kết hỗ trợ có nhật ký) | 10/11/2026 chọn B nhưng tạm dừng; **11/11/2026 chủ dự án MỞ LẠI**, thiết kế từng câu Q373 trở đi (các dòng bên dưới). Thiết kế chi tiết: [slice-7-phuong-an-b-email.md](./slice-7-phuong-an-b-email.md); quyết định kiến trúc: [ADR-0009](../adr/0009-email-chinh-chu-va-thu-qua-hang-doi-ben.md) (accepted) |
| Q373 | **Phương án A** (11/11/2026): tin Người ra đề: email trong Excel chỉ cần đúng định dạng và không trùng; không giới hạn tên miền, không bắt Quản trị viên đối chiếu từng email | Lý do của chủ dự án: Người ra đề có danh sách sinh viên và xác định được email chính xác. Hệ quả: phải có đường sửa email gõ nhầm và gửi lại thư (xem Q374) |
| Q374 | **Duyệt 11/11/2026 (a, b, c):** (a) Người ra đề đã tạo Yêu cầu được sửa email của Người dự thi **chỉ khi còn Chờ kích hoạt**; đã kích hoạt thì chỉ Quản trị viên sửa (lý do bắt buộc, nhật ký); sửa email vô hiệu liên kết cũ và gửi thư mới. (b) Hạn liên kết kích hoạt **7 ngày tính từ lúc thư gửi đi thật** (thay 24 giờ). (c) Có nút "Gửi lại cho tất cả người chưa kích hoạt" **kèm giới hạn để không dùng hết hạn mức Gmail 500 thư/ngày**, tính tới việc nhiều Người ra đề thao tác cùng ngày (chi tiết giới hạn: Q375). Sinh viên tự gửi lại thư kích hoạt từ trang hết hạn; liên kết quên mật khẩu hết hạn thì tự yêu cầu lại | Chủ dự án bổ sung: Người ra đề cũng có email và dùng cùng quy trình kích hoạt, quên mật khẩu (đang đánh giá ở Q376) |
| Q375 | **Duyệt 11/11/2026:** trần **400 thư/24 giờ trượt** (Google cho ~500); **dành riêng 100 thư cho thư khẩn** (quên mật khẩu, mật khẩu đã đổi, liên kết hỗ trợ, Lời mời), thư hàng loạt (kích hoạt) tối đa **300**; **xoay vòng giữa các Người ra đề**; mỗi sinh viên được Người ra đề/Quản trị viên gửi lại tối đa 1 lần/24 giờ, tự gửi lại tối đa 3 lần/ngày; nút "Gửi lại cho tất cả" chỉ gửi người đủ điều kiện, mỗi Người ra đề tối đa 1 lần/6 giờ; Người ra đề thấy hạn mức, hàng đợi và giờ dự kiến xong, Quản trị viên thấy số thư/24 giờ + chuông khi vượt 70 %, lúc duyệt lô lớn thấy số ngày dự kiến | Hạ tầng: Gmail App Password |
| Q376 | **Duyệt 11/11/2026:** Người ra đề dùng chung cơ chế email (Lời mời tự gửi thư, kích hoạt, quên mật khẩu), kèm: (1) quên mật khẩu của Người ra đề **không bị chặn** khi đang theo dõi Phiên thi; (2) Quản trị viên khác nhận chuông khi mật khẩu của Người ra đề/Quản trị viên được đặt lại qua email (mức: chờ chủ dự án chốt); (3) đổi email phải nhập mật khẩu hiện tại, thư báo tới cả email cũ và mới, chỉ Quản trị viên xử lý khi mất quyền vào hộp thư. **Tài khoản hiện có: môi trường dev (pod dev) coi mọi email là đã xác thực; PRODUCTION phải chạy đủ luồng xác thực** | Phân biệt dev/production làm bằng lệnh nạp dữ liệu của dev, **không** bằng migration (migration chạy cả ở production) |
| Q377 | **Duyệt 11/11/2026:** (1) Chuông báo cho Quản trị viên **mỗi lần** mật khẩu của Người ra đề hoặc Quản trị viên được đặt lại qua email (hoàn tất Q376b). (2) Lối thoát khẩn cấp là **liên kết hỗ trợ** (một lần, hạn 60 phút, lý do bắt buộc, nhật ký), không còn mật khẩu tạm: **chọn B**: Người ra đề được tạo cho Người dự thi của mình **khi tài khoản còn Chờ kích hoạt**; tài khoản đã kích hoạt chỉ Quản trị viên. (3) Người dùng đặt mật khẩu qua liên kết hỗ trợ thì tài khoản **Hoạt động nhưng "email chưa xác thực"**: không chặn làm bài, hiện biểu ngữ nhắc, nút "Gửi thư xác thực"; **trong lúc chưa xác thực, "Quên mật khẩu" KHÔNG gửi thư tới email đó** (chống email gõ nhầm sang người lạ). `prod-recover-admin` giữ làm phương án cuối | Q374(a) đã cho Người ra đề sửa email tài khoản Chờ kích hoạt nên về thực chất họ đã có khả năng này; lớp an toàn thật là nhật ký + chuông + ràng buộc "chưa xác thực" |
| Q378 | **Duyệt 11/11/2026:** mật khẩu cũ **còn dùng được cho tới khi liên kết đặt lại được dùng** (yêu cầu "Quên mật khẩu" không làm mất hiệu lực mật khẩu cũ); khi có dấu hiệu bị dùng trái phép thì **Quản trị viên Khóa đăng nhập** tài khoản đó ngay | Lý do: người lạ xin reset không khóa được chủ thật; đã có cơ chế Khóa đăng nhập |
| Q379 | **Duyệt 11/11/2026: phương án A.** "Quên mật khẩu" của Người dự thi **không bị chặn** khi đang có Lượt làm bài (đổi ý so với đề xuất cũ là chặn) | Lý do: người mất phiên giữa giờ thi lại là người cần tự phục vụ nhất; giờ thi do server quyết định, câu trả lời đã lưu PostgreSQL, và Lượt chỉ có một phiên hoạt động, sang thiết bị khác vẫn cần Người ra đề cho phép nên đặt lại mật khẩu không vượt qua luật nào. Nhật ký `password-reset` ghi kèm "đang có Lượt làm bài" để truy vết. Không thêm sự kiện ở màn Theo dõi |
| Q380 | **Duyệt 11/11/2026** (bản rút gọn vì production hiện chỉ có 2 Quản trị viên: `quantri` chưa có email, `tvvresearch` có email chưa xác thực, không có người dùng nào khác): (1) hai Quản trị viên **tự xác thực** sau khi lát cắt 7 lên production (`tvvresearch` bấm "Gửi thư xác thực"; `quantri` nhập email ở trang Tài khoản, cần mật khẩu hiện tại, rồi bấm liên kết); (2) **Quản trị viên không bao giờ bị chặn đăng nhập** vì chưa xác thực, chỉ có biểu ngữ; (3) `prod-preflight` và `checklist-phien-thi.md` thêm mục **"mọi Quản trị viên có email đã xác thực"**, bắt buộc đạt trước Phiên thi thật đầu tiên; (4) thứ tự lên bản: 7b (thử gửi một thư) → 7c → hai Quản trị viên xác thực → mới tạo Người ra đề, Người dự thi thật. Chủ dự án xác nhận **chưa tạo người dùng thật trước khi lát cắt 7 lên production** nên **bỏ** cơ chế chuyển hàng loạt (hạn chót, bảng theo dõi dữ liệu cũ, nhập email hộ cho tài khoản đã hoạt động) | Nếu sau này vẫn tạo người dùng thật bằng luồng cũ trước khi lát cắt 7 xong thì họ thành dữ liệu cũ và Q380 phải mở lại. Quy tắc giữ lại: thêm email cho tài khoản đã hoạt động chỉ do chính chủ (nhập mật khẩu) hoặc Quản trị viên (lý do, nhật ký), Người ra đề không làm hộ. `quantri` dùng một email khác `tvvresearch` (email là duy nhất) |
| Q381 | **Duyệt 11/11/2026:** (1) worker **sinh mã lúc gửi**, hàng đợi không lưu mã (thay cho mã hóa AES nội dung chờ gửi: không cần khóa mới, không còn mã nào trong cơ sở dữ liệu hay sao lưu, hạn "từ lúc gửi" tự đúng); gửi lỗi thì thử lại bằng mã mới và vô hiệu mã cũ. (2) Hạn: kích hoạt 7 ngày từ lúc gửi; đặt lại 60 phút; xác thực email và đổi email 24 giờ; liên kết hỗ trợ 60 phút; mỗi người một mã còn hiệu lực mỗi loại. (3) Quên mật khẩu: tối đa 3 lần/giờ/tài khoản (cách nhau 60 giây), 20 lần/giờ/IP, thử mã sai 10 lần/giờ/IP (Redis); vượt thì trả cùng câu, không gửi thêm. (4) **Yêu cầu giao diện của chủ dự án: mọi màn hình và thư phải nêu rõ thời hạn** | Mục 7 của tài liệu thiết kế có yêu cầu chung; ADR-0009 đã cập nhật |
| Q382 | **Duyệt 11/11/2026:** (1) sáu loại thư (kích hoạt, Lời mời, đặt lại mật khẩu, mật khẩu đã đổi, xác thực email, email tài khoản đã đổi); (2) thời hạn: giờ hết hạn cụ thể theo giờ Việt Nam trong thư, giờ cụ thể kèm đếm ngược trên màn hình, trang liên kết lỗi nêu lý do và việc làm tiếp; (3) thư "mật khẩu đã đổi" ghi giờ, trình duyệt, hệ điều hành, **không ghi IP** (Nghị định 13/2023; IP vẫn ở nhật ký); (4) tên hệ thống và dòng liên hệ hỗ trợ cấu hình được (mặc định tạm "Hệ thống kiểm tra đánh giá trực tuyến"), **chủ dự án sửa sau, Trợ lý phải nhắc**; (5) **bổ sung cấu hình chống vào thư rác** theo yêu cầu của chủ dự án (mục 5 của tài liệu thiết kế, hàng "Giảm vào Spam") | **Điều chỉnh Q374:** Gmail SMTP không cho biết thư trả lại bất đồng bộ, nên "Thư lỗi" chỉ hiện cho lỗi từ chối ngay; thêm trạng thái "Cần kiểm tra" (đã gửi quá 48 giờ chưa kích hoạt). Danh sách việc chủ dự án cần làm trước production ở mục 9 |
| Q383 | **Duyệt 11/11/2026 (gói kỹ thuật):** (1) bảng `auth_tokens`, `email_outbox`, cột mới trên `users`, module `mail` mới (hàng đợi, cổng `MailSender`, job gửi), logic mã ở module `identity`, hai module nói chuyện qua cổng (port); (2) trang "Quên mật khẩu" trả lời dưới 300 ms, đều nhau với mọi tài khoản, gửi thư ở nền, thêm vào ngân sách phản hồi và test đo thời gian; (3) bộ gửi giả, test trọn kịch bản thay cho 7a, test pod `drill-exam`/`dr-exam`/`restore-test` không có SMTP; (4) sửa hẳn các tài liệu trong cùng PR với mã; (5) bốn thuật ngữ GLOSSARY: Chờ kích hoạt, Liên kết kích hoạt, Liên kết hỗ trợ, Email đã xác thực (mục Phiếu tài khoản bỏ khi PR 7d làm); (6) **tên hệ thống và dòng liên hệ hỗ trợ cấu hình ở `api.env`** (phương án A), không làm màn Cài đặt | Chủ dự án yêu cầu rà lại thiết kế bằng skill của mattpocock trước khi duyệt ADR-0009 |
| Q384 | **Duyệt 11/11/2026, phương án C:** "Người ra đề của Người dự thi" (được sửa email, gửi lại, tạo Liên kết hỗ trợ khi tài khoản còn Chờ kích hoạt) = **người tạo Yêu cầu đã tạo tài khoản đó HOẶC Người ra đề có người đó trong Danh sách dự thi của Phiên thi chưa kết thúc của mình**; quyền nằm ở một hàm duy nhất trong `identity`. **Thuật ngữ:** Liên kết một lần (chung), **Liên kết hỗ trợ** (thay "Liên kết thủ công"), Chờ kích hoạt, Email đã xác thực (trạng thái); GLOSSARY đã cập nhật | **Điều chỉnh Q374(a) và Q377**, vốn viết "Người ra đề đã tạo Yêu cầu": cách hiểu đó làm Người ra đề thứ hai (kỳ thi ngày mai) bó tay, còn "chỉ theo Danh sách dự thi" làm người tạo Yêu cầu bó tay lúc kích hoạt sớm. Phát hiện khi đối chiếu `SessionRosterService.reissuePassword` |

## Các PR

| PR | Nội dung | Trạng thái |
|---|---|---|
| **7a** | kiểm thử trọn kịch bản quên mật khẩu (API 16 bài, trình duyệt 4 bài), tài liệu `tai-khoan-va-mat-khau.md`, kế hoạch lát cắt này; **không đổi hành vi hệ thống** | đã merge (#89) |
| **7b** | hạ tầng gửi email: cấu hình SMTP, `email_outbox`, hàng đợi có trần và xoay vòng, mẫu thư, lệnh gửi thử, bộ gửi giả, tắt gửi ở môi trường diễn tập | chờ duyệt ADR-0009 (mọi câu thiết kế Q372 đến Q384 đã duyệt) |
| **7c** | `auth_tokens`, kích hoạt tài khoản, Lời mời tự gửi thư, quên mật khẩu, đổi email, nhật ký, màn hình, kiểm thử trọn kịch bản | chờ thiết kế |
| **7d** | màn hình Quản trị viên và Người ra đề (gửi lại, sửa email, liên kết hỗ trợ, hạn mức, bảng theo dõi kích hoạt), biểu ngữ và trang xác thực email cho 2 Quản trị viên hiện có (Q380), bỏ Phiếu tài khoản và "Cấp lại mật khẩu tạm", cập nhật `prod-preflight` và checklist, tài liệu | chờ thiết kế |

(Tên "7b" trong bản kế hoạch ban đầu là "liên kết đặt lại một lần do Quản trị viên gửi tay"; hướng đó **đã bị thay** bằng phương án B nên 7b, 7c, 7d nay theo bảng trên.)

## Rà soát hiện trạng (10/11/2026)

Câu hỏi: kịch bản "đã đổi mật khẩu từ lâu rồi quên" có được giải quyết chưa? **Có**, bằng "Cấp lại mật khẩu tạm" của Quản trị viên (Q61). Rà soát qua mã và chạy 133 bài kiểm thử liên quan (đạt hết) cho thấy:

**Đã có và đã kiểm:** cấp lại cho người dùng có mật khẩu thường (không phải mật khẩu tạm); mật khẩu cũ mất hiệu lực; mọi phiên thu hồi; gỡ khóa tạm do nhập sai; buộc đổi mật khẩu; mật khẩu tạm hạn 7 ngày; không ghi mật khẩu vào nhật ký; không tự cấp cho chính mình; cấp được khi người đó đang trong Phiên thi; Người ra đề chỉ cấp được cho Người dự thi mình xin tài khoản và chưa đổi mật khẩu.

**Khoảng trống phát hiện và đã bù ở PR 7a:**
1. Không có bài kiểm thử **trọn kịch bản** (chỉ có các mảnh lẻ) → thêm `password-recovery.int.test.ts` (16 bài).
2. Không có bài kiểm thử **trình duyệt** cho hộp thoại cấp lại (mật khẩu hiện một lần, không đóng bằng Esc) và luồng người dùng bị buộc đổi → thêm `password-recovery.spec.ts` (4 bài, desktop và điện thoại).
3. Không có tài liệu vận hành **một chỗ** về cơ chế → thêm `docs/ops/tai-khoan-va-mat-khau.md`.

**Điều phát hiện khi viết kiểm thử:** phiên của Quản trị viên chỉ **30 phút nhàn rỗi, tối đa 12 giờ**, nên nếu để lâu thì phải đăng nhập lại trước khi cấp lại (ghi trong tài liệu vận hành).

**Điểm yếu thiết kế (không sửa ở 7a, là lý do làm 7b):**
1. **Quản trị viên biết mật khẩu tạm** khi cấp lại, về nguyên tắc có thể đăng nhập bằng tài khoản người khác trước khi họ đổi. Có nhật ký ghi việc cấp lại nhưng hệ thống không ngăn.
2. **Chủ tài khoản không được báo** khi mật khẩu bị cấp lại.
3. Không tự phục vụ; hệ thống không xác minh danh tính (chỉ có quy trình của người vận hành).
4. Hạn 7 ngày của mật khẩu tạm dài hơn nhu cầu thực tế.

### Q371: hướng cải tiến (ĐÃ DUYỆT 10/11/2026: phương án C)

**Phương án:**
- **A.** Giữ nguyên, chỉ bổ sung kiểm thử trình duyệt, trọn kịch bản và tài liệu vận hành.
- **B.** Thêm **liên kết đặt lại dùng một lần** cho Người ra đề và Người dự thi (Quản trị viên chỉ tạo và gửi liên kết, chủ tài khoản tự đặt mật khẩu; Quản trị viên không biết mật khẩu); giữ cấp mật khẩu tạm làm dự phòng.
- **C.** Làm cả hai theo thứ tự: bổ sung kiểm thử trước (không đổi hành vi), sau đó mới thiết kế B.
- Phương án đã loại cho giai đoạn này: **tự đặt lại qua email** (cần dịch vụ gửi email; nhiều Người dự thi không có email; vẫn trong backlog của lát cắt 1).

**Quyết định:** chọn **C**. Lý do: kiểm thử trọn kịch bản tạo lưới an toàn trước khi thay đổi cơ chế đăng nhập (khu vực nhạy cảm); thiết kế B dựa trên cơ chế liên kết dùng một lần đã có của **Lời mời** (liên kết băm mã, dùng một lần, hết hạn) nên không phải dựng mới từ đầu.

**Hướng của B (chưa duyệt chi tiết, sẽ hỏi từng câu):** Quản trị viên bấm "Tạo liên kết đặt lại mật khẩu" cho một người; hệ thống hiện liên kết **một lần**, hết hạn ngắn (đề xuất 24 giờ), dùng được **một lần**; Quản trị viên gửi qua Zalo; chủ tài khoản mở liên kết, tự chọn mật khẩu (theo cùng quy tắc: từ 10 ký tự...), mọi phiên cũ bị thu hồi, nhật ký ghi lại. Mật khẩu cũ **giữ nguyên cho tới khi liên kết được dùng** (đề xuất, để kẻ giả danh xin reset không khóa được chủ thật). Các câu cần quyết: hạn của liên kết; mật khẩu cũ còn hiệu lực hay không; ai được tạo liên kết (chỉ Quản trị viên hay cả Người ra đề cho Người dự thi của mình); có thông báo cho chủ tài khoản không và bằng cách nào; áp dụng cho Quản trị viên không; có giới hạn số lần tạo và có tạo lại thay liên kết cũ không; nhật ký ghi gì; giao diện ở đâu; có bỏ hạn 7 ngày của mật khẩu tạm hay rút ngắn không.

## Hướng mới của chủ dự án (10/11/2026): xác thực email chính chủ, đặt lại mật khẩu qua email

Sau khi xem các điểm yếu của cách cấp mật khẩu tạm, chủ dự án nhận xét cách vận hành hiện tại **"rất khó xác định danh tính và nhập nhằng"**, và khuyến khích: **yêu cầu người dùng xác thực email chính chủ trước khi sử dụng hệ thống**; từ đó quên mật khẩu được xử lý bằng email, **như dự án `plo-tracker-bluni` đã làm** (Quản trị viên dùng tài khoản Gmail cùng cơ chế **App Password** để gửi email). Hướng này **thay thế** phương án "liên kết đặt lại do Quản trị viên gửi tay" (Q372 cũ về mật khẩu cũ còn hiệu lực hay không vẫn dùng được cho luồng email, xem dưới); cấp mật khẩu tạm có thể giữ làm lối thoát khẩn cấp.

### Rà soát `plo-tracker-bluni` (thư mục cùng cấp, chỉ đọc, 10/11/2026)

Không đọc file bí mật nào (không mở `.env`, `backend.env`). Các nơi đã đọc và điều học được:

| Chủ đề | Nơi | Cách `plo-tracker-bluni` làm |
|---|---|---|
| Gửi email | `docs/EMAIL_DELIVERY_GMAIL.md`, `backend/app/services/email_sender.py` | **Gmail SMTP** (`smtp.gmail.com:587`, STARTTLS) bằng **App Password** (bật xác minh hai bước, tạo mật khẩu ứng dụng 16 ký tự, chỉ lưu trong file bí mật quyền 600). Với Gmail, `EMAIL_FROM` **phải trùng** `SMTP_USERNAME`. Thư dựng từ mẫu tiếng Việt (bản văn bản và HTML), có đầu mục `Auto-Submitted` |
| Hàng đợi bền | bảng `emailoutbox` (migration `e20260625a01`), lớp `DurableEmailSender` | thư **vào hàng đợi trong PostgreSQL**, tiến trình nền gửi lần lượt: `pending, retry -> processing -> sent \| failed`; **không mất khi khởi động lại**; khôi phục việc kẹt (`processing` quá lâu); API trả `queued` chứ không `sent` |
| Giới hạn an toàn | `EMAIL_DAILY_LIMIT=400`, `EMAIL_MIN_INTERVAL_SECONDS=6`, `EMAIL_BULK_MAX_RECIPIENTS=100`, `EMAIL_MAX_ATTEMPTS=5` (chờ tăng dần 60 giây đến 1 giờ) | Google cho tài khoản cá nhân tối đa khoảng **500 thư mỗi ngày**; script chủ động dừng ở 400 và **hoãn sang cửa sổ sau mà không tính là lỗi**; phân biệt lỗi tạm thời (thử lại) và lỗi vĩnh viễn (mã 5xx, sai xác thực) |
| Kích hoạt tài khoản | `UserAdminService`, `AuthService.set_password_by_token`, bảng `PasswordSetupToken` | tài khoản mới **chưa kích hoạt, chưa xác thực email**; Quản trị viên **phát hành thư thiết lập mật khẩu**; liên kết `/set-password?token=...` **dùng một lần, hạn 24 giờ** (`PASSWORD_SETUP_EXPIRE_MINUTES=1440`); khi người dùng đặt mật khẩu bằng liên kết thì **email được coi là đã xác thực** ("vào được hộp thư nghĩa là chính chủ") |
| Quên mật khẩu | `POST /auth/forgot-password`, `AuthService.request_password_reset` | nhập tên đăng nhập hoặc email; **luôn trả "đã gửi"** dù tài khoản có hay không (chống dò tài khoản); chỉ cấp mã cho tài khoản hợp lệ và đang hoạt động; **vô hiệu các mã cũ chưa dùng**; mã `token_urlsafe(32)`, **hạn 60 phút**; dùng chung `/set-password`; **giới hạn tần suất mềm** theo IP và định danh (Redis), vượt thì vẫn trả "đã gửi" |
| Nhật ký | `AuditLog` | ghi `REQUEST_PASSWORD_RESET`, `SET_PASSWORD` kèm IP, trình duyệt, mã yêu cầu; không ghi mật khẩu |
| Dev và test | `ConsoleEmailSender` | không gửi thật; **không bao giờ in mã ra log ở production** |
| Chính sách | `docs/knowledge/_shared/auth-session.md` | mật khẩu 10 đến 64 ký tự, khuyến khích câu dài dễ nhớ, chặn mật khẩu yếu, phổ biến, đã lộ hoặc theo ngữ cảnh |
| Khuyến nghị tương lai | cuối `EMAIL_DELIVERY_GMAIL.md` | khi vượt 200 đến 300 thư mỗi ngày, cần biết thư bị trả lại, hoặc Gmail bị khóa thì chuyển sang dịch vụ chuyên dụng (Amazon SES, Postmark, Resend, Mailgun) hoặc Google Workspace dùng tên miền của trường |

### Điều cần cân nhắc khi mang sang `exam-system` (phát hiện từ rà soát)

1. **Mã nằm nguyên dạng trong cơ sở dữ liệu ở `plo-tracker-bluni`**: cột `token` của `PasswordSetupToken` và của `emailoutbox` đều lưu mã **dạng đọc được**. Ai đọc được cơ sở dữ liệu hoặc bản sao lưu thì dùng được mã còn hạn. Ở `exam-system` nên làm chặt hơn: **chỉ lưu băm của mã** (giống Lời mời hiện tại) và mã trong hàng đợi gửi thư được **mã hóa** rồi **xóa ngay sau khi gửi**.
2. **Hạn mức Gmail 500 thư mỗi ngày** va với việc cấp tài khoản **hàng loạt** cho Người dự thi (một lớp 500 sinh viên là hết hạn mức của cả ngày, và thư kích hoạt cho cả lớp gửi trong nhiều ngày). Cần hàng đợi có giới hạn (như `plo-tracker-bluni`) và lập kế hoạch kích hoạt **trước ngày thi nhiều ngày**, hoặc dùng dịch vụ gửi thư chuyên dụng.
3. **Người dự thi không nhận được thư (rơi vào Spam, email gõ sai) thì không vào thi được.** Cần lối thoát của Quản trị viên (cấp liên kết hoặc mật khẩu tạm thủ công, có nhật ký) và hạn "phải kích hoạt trước giờ thi".
4. **Email hiện là tùy chọn** trong Yêu cầu cấp tài khoản của `exam-system`; bắt buộc email nghĩa là đổi định dạng file Excel, kiểm tra email trùng, và quyền riêng tư (Nghị định 13/2023: ghi rõ mục đích thu thập email).
5. **Cùng một Gmail**: tài khoản `tvvresearch@gmail.com` đang là địa chỉ gửi của `plo-tracker-bluni` **và** là email của Quản trị viên thứ hai `tvvresearch` của `exam-system`. Dùng chung tài khoản gửi thì **chung hạn mức 500 thư** của hai hệ thống; nên cân nhắc tài khoản gửi riêng cho từng hệ thống.
6. **Các bí mật mới** (`SMTP_PASSWORD`...) nằm trong `api.env`, nên **tự động được sao lưu** (mã hóa gpg, thư mục `khoa/`) khi đổi; khôi phục từ sao lưu phải **không gửi lại** các thư còn nằm trong hàng đợi (hoặc chấp nhận gửi trùng).
7. **Hạ tầng:** cần cổng ra SMTP 587 từ laptop WSL và từ VPS sau này (một số nhà cung cấp VPS chặn cổng 25 nhưng thường mở 587).
8. **Đã có sẵn trong `exam-system`** để tận dụng: hàng đợi job BullMQ và worker; bảng `notifications`; cơ chế liên kết dùng một lần băm mã (Lời mời); `AuditService`; giới hạn tần suất đăng nhập qua Redis; mẫu bí mật `api.env`.

### Hướng tổ chức lại lát cắt 7 (đề xuất, chờ duyệt từng câu)

| PR | Nội dung |
|---|---|
| **7a** | kiểm thử trọn kịch bản, tài liệu hiện trạng, rà soát (đã làm, PR #89) |
| **7b** | **hạ tầng gửi email**: cấu hình SMTP và App Password, hàng đợi bền (băm mã, worker sinh mã lúc gửi, hàng đợi không chứa mã), giới hạn và thử lại, mẫu thư tiếng Việt, tài liệu vận hành, kiểm thử với bộ gửi giả |
| **7c** | **xác thực email và kích hoạt tài khoản**; **quên mật khẩu qua email** (có trả lời chung, giới hạn tần suất, mã hạn ngắn, một lần); lối thoát khẩn cấp của Quản trị viên; nhật ký; kiểm thử; cập nhật tài liệu `tai-khoan-va-mat-khau.md` |

(Danh sách dưới đây là bản dự kiến cũ; số Q đã được tính lại, xem mục 11 của [slice-7-phuong-an-b-email.md](./slice-7-phuong-an-b-email.md).) Các câu thiết kế dự kiến (hỏi từng câu): phạm vi bắt buộc email và số phận của Phiếu tài khoản (Q372); nhà cung cấp gửi thư và hạn mức (Q373); mã: băm, mã hóa, hạn, một lần (Q374); mật khẩu cũ còn hiệu lực đến khi dùng mã không (Q375); lối thoát khẩn cấp của Quản trị viên (Q376); thông báo cho chủ tài khoản khi đổi mật khẩu (Q377); chuyển dữ liệu cũ (người dùng hiện có chưa có email) (Q378); các thiết lập kỹ thuật còn lại (Q379).

## Nâng cấp tài khoản bằng xác thực chính chủ: ĐÃ MỞ LẠI ngày 11/11/2026

**Trạng thái: THIẾT KẾ ĐÃ DUYỆT** (Q372 đến Q384; ADR-0009 accepted ngày 11/11/2026). Chưa viết mã; bước kế là thiết kế chi tiết và bộ test của PR 7b để chủ dự án duyệt. Mục này từng là Backlog (tạm dừng 10/11/2026).

- **Quyết định đã có:** Q372 phương án **B**; Q373 đến Q377 (bảng "Tóm tắt các quyết định" ở đầu tài liệu). Cốt lõi: email do Người ra đề cung cấp được tin; kích hoạt và quên mật khẩu qua email (liên kết một lần: kích hoạt hạn **7 ngày tính từ lúc thư gửi**, đặt lại hạn 60 phút); **bỏ Phiếu tài khoản mật khẩu tạm** và nút "Cấp lại mật khẩu tạm"; **không ai biết mật khẩu của người khác**; lối thoát khẩn cấp bằng liên kết hỗ trợ có nhật ký (Người ra đề cho tài khoản Chờ kích hoạt, Quản trị viên cho mọi tài khoản).
- **Bản thiết kế chi tiết:** [slice-7-phuong-an-b-email.md](./slice-7-phuong-an-b-email.md) (đã cập nhật theo Q373 đến Q377). **Quyết định kiến trúc đề xuất:** [ADR-0009](../adr/0009-email-chinh-chu-va-thu-qua-hang-doi-ben.md), trạng thái `accepted` (11/11/2026).
- **Tài liệu tham khảo:** mục "Hướng mới của chủ dự án" ở trên (rà soát `plo-tracker-bluni`).
- **Việc còn lại:** thiết kế chi tiết và bộ test PR 7b để duyệt, rồi làm 7b, 7c, 7d.
- **Đang dùng trong lúc chờ:** "Cấp lại mật khẩu tạm" của Quản trị viên, đã có kiểm thử trọn kịch bản (PR 7a) và tài liệu [tai-khoan-va-mat-khau.md](../ops/tai-khoan-va-mat-khau.md).
- **Phương án thay thế (không dùng email):** mã gửi qua SMS, đã đánh giá ở [docs/research/xac-thuc-chinh-chu-bang-sms.md](../research/xac-thuc-chinh-chu-bang-sms.md); không chọn.

## Quy trình ghi chú cho các nâng cấp tiếp theo

1. Chủ dự án mô tả điểm nâng cấp → ghi mục tiêu vào `slice-N.md`.
2. Thiết kế **từng câu một** (Q371 trở đi): bài toán, ví dụ, phương án A/B/C, khuyến nghị, quyết định, phương án đã bỏ.
3. Quyết định kiến trúc khó đảo ngược → ADR; thuật ngữ mới → `GLOSSARY.md`; bảng dữ liệu → `docs/data-model.md`; kiến trúc → `docs/architecture.md`.
4. Mỗi PR có Summary, Evidence (số đo, kết quả kiểm thử), Merge Danger.
5. Sau khi làm: ghi chú triển khai (điều khác thiết kế, lỗi tìm ra, kết quả kiểm thử) vào `slice-N.md`; tài liệu vận hành vào `docs/ops/` kèm nhật ký bật thật.
6. Ghi tiến độ vào bộ nhớ dự án để phiên sau tiếp tục.
