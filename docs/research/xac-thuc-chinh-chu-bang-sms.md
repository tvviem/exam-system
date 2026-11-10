# Đánh giá: xác thực chính chủ tài khoản bằng mã gửi qua SMS (số điện thoại), thay cho email

Ngày: 10/11/2026. Người hỏi: chủ dự án. Bối cảnh: lát cắt 7 ([slice-7.md](../plan/slice-7.md)), đang trong backlog (tạm dừng). Đề xuất đánh giá: **người dùng cung cấp số điện thoại ở lần đổi mật khẩu đầu tiên; hệ thống gửi mã về số đó; người dùng nhập mã lên màn hình đổi mật khẩu; hệ thống ghi nhận "đã kích hoạt chính chủ bằng số điện thoại"**.

Cách làm: đọc **nguồn gốc** (chuẩn NIST, hướng dẫn OWASP, tài liệu API của nhà cung cấp, trang giá của nhà cung cấp) và gắn nhãn độ tin cậy cho từng điều: **[gốc]** = đã đọc nguồn sở hữu thông tin; **[thứ cấp]** = chỉ có bài viết thứ hai, **chưa kiểm** nên cần đối chiếu trước khi dựa vào. Phần phân tích thiết kế (mục 3 trở đi) là nhận định của Trợ lý.

## 1. Các sự thật đã tra

### 1.1 NIST SP 800-63B-4 (Digital Identity Guidelines, bản 4)
Nguồn: [pages.nist.gov/800-63-4/sp800-63b.html](https://pages.nist.gov/800-63-4/sp800-63b.html) và [mục Authenticators](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/).

- **[gốc] Dùng mạng điện thoại công cộng (PSTN: SMS và cuộc gọi) để gửi mã xác thực là "restricted" (bị hạn chế)** (mục 3.1.3.3): "Use of the PSTN for out-of-band verification is *restricted*". NIST có thể điều chỉnh trạng thái này theo diễn biến mối đe dọa.
- **[gốc] Điều kiện để dùng thuộc loại hạn chế** (mục 3.2.9): tổ chức phải "assess, understand, and accept the risks" và thừa nhận rủi ro "will likely increase over time"; nếu rủi ro không chấp nhận được thì "SHALL NOT be used". Nhà cung cấp danh tính phải: (1) **cho người dùng ít nhất một phương thức thay thế không bị hạn chế**; (2) **thông báo rõ ràng về rủi ro**; (3) đưa rủi ro phụ vào đánh giá; (4) **có kế hoạch chuyển đổi** phòng khi sau này không còn chấp nhận được.
- **[gốc] Phải có phương án khác cho mọi người dùng** (3.1.3.3): "alternative authenticator types are available to all subscribers" (vì vùng phủ sóng có thể kém).
- **[gốc] Đổi số điện thoại đã đăng ký = gắn một phương thức xác thực mới** và phải theo quy trình gắn sau đăng ký (3.1.3.3, tham chiếu mục 4.1.2).
- **[gốc] Nên xét tín hiệu rủi ro trước khi gửi mã qua PSTN**: "device swap, SIM change, number porting, other abnormal behavior" (3.1.3.3). NIST không nêu cách phát hiện.
- **[gốc] Yêu cầu về mã** (3.1.3.2): ngẫu nhiên, **ít nhất 6 chữ số**; **hết hiệu lực sau 10 phút**; **chỉ dùng một lần**; nếu mã ngắn hơn 64 bit thì **phải giới hạn số lần thử**, và **tạo mã mới không được đặt lại bộ đếm thử sai**.
- **[gốc] Xác thực ngoài kênh (out-of-band) không chống được lừa đảo** (phishing) (3.1.3.1).

### 1.2 OWASP Forgot Password Cheat Sheet
Nguồn: [cheatsheetseries.owasp.org/…/Forgot_Password_Cheat_Sheet.html](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
- **[gốc]** Trả **cùng một thông báo** dù tài khoản có tồn tại hay không, thời gian phản hồi đều nhau (chống dò tài khoản).
- **[gốc]** Dùng bộ sinh số ngẫu nhiên an toàn mật mã; mã PIN **6 đến 12 chữ số**; vô hiệu mã sau khi dùng; **giới hạn số lần gửi** theo tài khoản (hoặc CAPTCHA), vì không giới hạn thì kẻ xấu làm ngập điện thoại nạn nhân bằng tin nhắn đặt lại.
- **[gốc]** Sau đặt lại: không tự đăng nhập; hỏi hoặc tự thu hồi mọi phiên; báo cho chủ tài khoản rằng mật khẩu đã đổi (không bao giờ kèm mật khẩu).
- **[gốc]** SMS chỉ được liệt kê là một kênh gửi mã; **không có cảnh báo riêng cho SMS**. Sau nghi ngờ bị chiếm, **đừng tự khôi phục số điện thoại cũ đã bị thay** vì có thể số đó bị mất hoặc bị lộ.

### 1.3 SMS pumping (lạm dụng gửi SMS để kiếm tiền cước)
- **[thứ cấp]** Các bài của nhà cung cấp và báo kỹ thuật ([TechTarget](https://www.techtarget.com/cybersecurity/feature/SMS-pumping-attacks-and-how-to-mitigate-them), [46elks](https://46elks.com/blog/2023/03/01/sms-traffic-fraud), [Authsignal](https://www.authsignal.com/guides/how-to-mitigate-sms-pumping-without-breaking-signup)) mô tả: kẻ xấu gọi hàng loạt chức năng "gửi mã" tới số do chúng kiểm soát để hưởng chia cước, bạn phải trả tiền. Biện pháp được khuyến nghị: giới hạn theo số và theo **đầu số (prefix)**, **chờ tăng dần** giữa các lần gửi, kiểm tra số trước khi gửi (loại số cước đặc biệt), theo dõi **tỷ lệ mã được nhập đúng**, và giảm phụ thuộc SMS. Chưa kiểm với nguồn gốc (OWASP không có trang riêng về chủ đề này trong kết quả tra cứu).

### 1.4 Nhà cung cấp SMS và quy định ở Việt Nam
- **[gốc] eSMS yêu cầu đăng ký Brandname trước và đăng ký mẫu nội dung**: tài liệu API gửi OTP/CSKH ghi tham số `Brandname` bắt buộc ("Pre-registration is required"); lỗi `104` = mã brandname không tồn tại, lỗi `146` = mẫu nội dung CSKH chưa đăng ký ([developers.esms.vn](https://developers.esms.vn/en/esms-api/send-sms-api/send-otp-customer-care-message)). Nghĩa là **không gửi SMS tùy ý được nếu chưa có brandname và mẫu tin được duyệt**. Có chế độ sandbox không tính phí.
- **[gốc] Twilio gửi SMS tới Việt Nam: 0,2852 USD mỗi phân đoạn tin nhắn** (ước tính khoảng 7.000 đồng, tỷ giá ước tính), và trang giá không nêu điều kiện đăng ký cho Việt Nam ([twilio.com/…/pricing/vn](https://www.twilio.com/en-us/sms/pricing/vn)). Cao gấp hàng chục lần giá nội địa (dòng dưới).
- **[thứ cấp, chưa kiểm]** Giá SMS nội địa: VietGuys cho biết khoảng **150 đến 500 đồng mỗi tin** tùy khối lượng và nhà mạng (SMS marketing, [vietguys.biz](https://www.vietguys.biz/en/case-study-detail/sea-group-and-the-cost-problem-of-sms-services)); một bài Viblo (không ghi ngày) ước khoảng 500 đồng ([viblo.asia](https://viblo.asia/p/gui-sms-bang-speedsms-RQqKL27pl7z)). Không tra được bảng giá chính thức hiện hành của eSMS hay SpeedSMS (trang giá trả lỗi).
- **[thứ cấp, chưa kiểm]** Thông tin quy định: brandname do cơ quan quản lý cấp và quản lý tập trung (tối đa 11 ký tự, giá trị 3 năm, người dùng chịu trách nhiệm về hồ sơ, [lawnet.vn](https://lawnet.vn/ngan-hang-phap-luat/en/tu-van-phap-luat/cong-nghe-thong-tin/is-there-any-limit-on-the-number-of-brandnames-for-advertisements-by-messaging-in-vietnam-380307)); OTP ngân hàng từ 2025 theo Thông tư 50/2024/TT-NHNN có yêu cầu riêng (không áp dụng trực tiếp cho hệ thống thi). **Chưa tìm được số hiệu văn bản gốc về brandname OTP**; cần đối chiếu với văn bản chính thức hoặc hỏi nhà cung cấp.

### 1.5 Nghị định 13/2023/NĐ-CP (bảo vệ dữ liệu cá nhân)
- **[thứ cấp, chưa kiểm]** Số điện thoại được các trang tổng hợp liệt kê là dữ liệu cá nhân (nhóm cơ bản); bên kiểm soát dữ liệu phải **chứng minh được chủ thể đã đồng ý** khi có tranh chấp (Điều 11) và phải **thông báo mục đích, rủi ro, thời gian xử lý** (Điều 13) ([hethongphapluat.com](https://hethongphapluat.com/nghi-dinh-13-2023-nd-cp-ve-bao-ve-du-lieu-ca-nhan/dieu-11), [BSI](https://www.bsigroup.com/globalassets/localfiles/vi-vn/events/2023/20230719/pims-in-support-to-compliance-with-decree-13_ndcp.pdf)). Không đọc được toàn văn từ nguồn chính thức (kết nối bị ngắt); cần đối chiếu Điều 2, 9, 11, 13 trên nguồn chính thức.

## 2. Phần chưa biết hoặc chưa kiểm (không suy đoán)
1. Bảng giá nội địa **hiện hành** và điều kiện đăng ký brandname **cho cá nhân hoặc đơn vị trường** (cần thủ tục gì, mất bao lâu).
2. Văn bản pháp luật gốc về brandname và OTP; Điều 2, 9, 11, 13 của Nghị định 13/2023 từ nguồn chính thức.
3. Chính sách tái cấp số điện thoại bị hủy ở Việt Nam (thời gian trước khi nhà mạng cấp lại số cho người khác).
4. Zalo ZNS (gửi mã qua Zalo) và Firebase Phone Auth: chưa tra, chưa kết luận gì về hai lựa chọn này.

## 3. Đánh giá thiết kế (nhận định của Trợ lý)

### 3.1 Điều mã SMS thực sự chứng minh (quan trọng nhất)
Mã đến được số điện thoại và người dùng nhập đúng chỉ chứng minh: **người đang ngồi trước màn hình đang cầm một SIM nhận được tin ở số đó, vào lúc đó**. Nó **không** chứng minh số đó đứng tên người này, cũng không chứng minh người này đúng là sinh viên trong danh sách.

- Nếu **người dùng tự nhập số** ở lần đổi mật khẩu đầu (đề xuất của bạn): điểm tựa danh tính vẫn là **mật khẩu tạm trên Phiếu tài khoản**. Số điện thoại chỉ biến thành **kênh khôi phục** gắn với người đã giữ Phiếu. Nếu Phiếu bị lấy trộm trước khi sinh viên dùng, kẻ lấy sẽ gắn **số của kẻ đó** và chiếm tài khoản vĩnh viễn (Quản trị viên cũng khó phát hiện). Hôm nay rủi ro đó đã tồn tại (ai giữ mật khẩu tạm thì chiếm được), nhưng SMS làm nó **bền hơn** vì quyền khôi phục về sau thuộc về số của kẻ chiếm.
- Nếu **số do nhà trường cung cấp** (cột số điện thoại trong file Excel, như email ở phương án B): điểm tựa danh tính là **hồ sơ của nhà trường**, mã gửi đúng người có số trong hồ sơ. Mạnh hơn nhiều, giống bản chất của phương án email.

### 3.2 Phân tích các tình huống biên (kịch bản)
| Tình huống | Hậu quả với đề xuất "người dùng tự nhập số" |
|---|---|
| Phiếu bị người khác lấy trước | kẻ lấy gắn số của mình, chiếm tài khoản, sinh viên thật không vào được (xử lý bằng Quản trị viên) |
| Sinh viên nhập số của bạn hoặc người thân | tài khoản "đã xác thực" nhưng khôi phục về điện thoại người khác |
| Một số điện thoại gắn nhiều tài khoản (anh em, chung số) | cần quy tắc: cho phép chung hay mỗi số một tài khoản |
| Đổi số, mất điện thoại, mất SIM | đổi số là gắn phương thức mới, phải có quy trình mạnh (NIST 4.1.2); không có thì kẹt, buộc nhờ Quản trị viên |
| Số bị nhà mạng thu hồi rồi cấp lại cho người khác | người lạ nhận mã khôi phục của sinh viên cũ; OWASP nói đừng tự khôi phục số cũ khi nghi ngờ |
| Đổi SIM (SIM swap), chuyển mạng giữ số | kẻ chiếm số nhận mã; NIST chỉ khuyên "xét tín hiệu rủi ro", không có cách phát hiện sẵn |
| Không có sóng, ở ngoài nước, không có điện thoại ở phòng máy | kẹt ở màn hình đổi mật khẩu bắt buộc, phải có lối thoát (NIST yêu cầu phương án khác) |
| Kẻ xấu bấm "gửi mã" liên tục vào số của sinh viên | làm phiền, tốn tiền (pumping); cần giới hạn theo tài khoản, số, IP và ngân sách ngày |
| Phishing: kẻ lừa sinh viên đọc mã qua điện thoại | SMS OTP không chống được (NIST 3.1.3.1) |

### 3.3 So sánh nhanh với email (phương án B đã chọn)
| Tiêu chí | Email (B) | SMS qua số người dùng tự nhập | SMS qua số do nhà trường cung cấp |
|---|---|---|---|
| Điểm tựa danh tính | email trong hồ sơ nhà trường | **Phiếu mật khẩu tạm** (yếu) | số trong hồ sơ nhà trường |
| Chi phí mỗi lần gửi | gần 0 (Gmail App Password, giới hạn khoảng 500 mỗi ngày) | **có tiền**: nội địa khoảng 150 đến 500 đồng (chưa kiểm), Twilio khoảng 7.000 đồng | như cột giữa |
| Rào cản triển khai | thấp: tài khoản Gmail | **cao**: đăng ký brandname và mẫu tin, hồ sơ pháp nhân (chưa rõ cho cá nhân) | như cột giữa |
| Rủi ro lạm dụng | thấp (nhưng cần giới hạn) | **SMS pumping, SIM swap, số tái cấp** | như cột giữa |
| NIST | email không nằm trong nhóm hạn chế | **nhóm hạn chế**: bắt buộc có phương án thay thế, thông báo rủi ro, kế hoạch chuyển đổi | như cột giữa |
| Quản trị viên biết mật khẩu? | không | không | không |
| Phủ người dùng | mọi người có email (sinh viên thường có email trường) | mọi người có điện thoại (gần như tất cả, nhưng sóng và pin) | như cột giữa |

### 3.4 Chất lượng thiết kế mô-đun (từ skill thiết kế mã)
Dù chọn email hay SMS, **phần việc cốt lõi giống nhau**: sinh mã, băm mã, hết hạn, giới hạn thử, giới hạn gửi, trả lời chống dò tài khoản, ghi nhật ký. Chỉ khác **cách gửi**. Gợi ý một **mô-đun sâu** `ContactVerification`:
- **Interface nhỏ:** `start(người dùng, kênh, đích)`, `confirm(người dùng, mã)`, `statusOf(người dùng)`. Người gọi (đổi mật khẩu lần đầu, quên mật khẩu, đổi liên hệ) không cần biết kênh nào.
- **Đường nối (seam) bên trong:** `DeliveryChannel` có các bộ chuyển đổi (adapter): `Email` (Gmail SMTP), `Sms` (nhà cung cấp), `Console` (dev và test, không gửi thật). Hiện **chưa có bộ chuyển đổi thật nào** nên đường nối này mới là giả thuyết; khi cả email và SMS cùng có thì nó thành thật. **Quy tắc: không dựng đường nối khi chưa có hai kênh thật**; chỉ giữ ranh giới sạch để thêm kênh sau.
- **Quy tắc bất biến nằm trong mô-đun:** mã chỉ lưu dạng băm, dùng một lần, hết hạn 10 phút, tối đa 5 lần thử và **gửi lại không đặt lại bộ đếm** (NIST 3.1.3.2), giới hạn theo tài khoản, số, IP, ngân sách ngày, trả lời giống nhau dù số có hợp lệ hay không.
- **Phép thử xóa mô-đun:** nếu xóa, độ phức tạp sẽ xuất hiện lại ở ít nhất ba nơi (kích hoạt, quên mật khẩu, đổi liên hệ), nên mô-đun xứng đáng tồn tại. Kiểm thử đi qua interface với bộ gửi giả.

### 3.5 Từ vựng nghiệp vụ cần thống nhất (nếu sau này làm)
Theo quy trình dự án, **chưa thêm vào `GLOSSARY.md` khi chưa được duyệt**. Đề xuất các thuật ngữ, phân biệt rõ để không nhập nhằng: **Số điện thoại liên hệ** (thông tin người dùng cung cấp), **Số điện thoại đã xác thực** (đã nhận và nhập đúng mã ở một thời điểm), **Mã xác thực** (mã dùng một lần), và **Danh tính đã xác minh** (điều hệ thống **không** chứng minh chỉ bằng mã SMS). Lưu ý "chính chủ" trong tiếng Việt thường hàm ý **số đăng ký tên người đó**, điều hệ thống không kiểm được; nên dùng "đã xác thực số điện thoại" thay cho "kích hoạt chính chủ".

## 4. Đánh giá luồng cụ thể bạn đề xuất
Luồng: màn hình **đổi mật khẩu bắt buộc** có thêm ô số điện thoại → "Gửi mã" → nhập mã → "Đổi mật khẩu" → ghi `phone_verified_at`.

**Điểm tốt:** gộp việc đổi mật khẩu bắt buộc và xác thực vào một chỗ, không thêm bước; có sẵn màn hình và luồng buộc đổi.
**Điểm cần xử lý:**
1. **Kẹt nếu không nhận được mã** (không sóng, SIM hỏng, phòng máy cấm điện thoại): cần **lối thoát** (đổi mật khẩu không kèm số rồi bị hạn chế, hoặc Quản trị viên xác nhận thủ công có nhật ký).
2. **Điểm tựa danh tính vẫn là Phiếu** (mục 3.1), không phải số điện thoại. Muốn mạnh hơn: **số do nhà trường cung cấp** trong file Excel, gửi mã tới đúng số đó (và người dùng không được chọn số khác).
3. **Gửi SMS chỉ cho số đã đăng ký hoặc do hệ thống cung cấp, và chỉ sau khi đã đăng nhập bằng mật khẩu tạm** (chống pumping: không có chức năng "gửi mã tới số bất kỳ" mở cho người chưa đăng nhập). Chức năng **quên mật khẩu qua SMS** (người chưa đăng nhập) chỉ gửi tới số **đã xác thực của đúng tài khoản**, và vẫn phải trả lời giống nhau.
4. **Ngân sách và giới hạn:** trần số SMS mỗi ngày, mỗi số, mỗi tài khoản, mỗi IP, mỗi đầu số; cảnh báo cho Quản trị viên khi vượt ngưỡng.
5. **Nhà cung cấp và brandname** là rào cản lớn nhất (mục 1.4): cần pháp nhân hoặc nhờ nhà trường; thời gian đăng ký chưa biết.
6. **Quyền riêng tư:** thông báo mục đích thu thập số điện thoại, lưu tối thiểu (chuẩn hóa E.164, có thể lưu băm nếu chỉ cần so khớp), cho phép xóa; Nghị định 13/2023 (mục 1.5).
7. **Đổi số về sau** là gắn phương thức xác thực mới; cần quy trình mạnh (nhập mật khẩu hiện tại cộng mã gửi tới số cũ hoặc xác nhận của Quản trị viên).

## 5. Kết luận và khuyến nghị
1. **Làm được về kỹ thuật**, nhưng **SMS không mạnh hơn email về danh tính** nếu số do người dùng tự nhập: điểm tựa vẫn là Phiếu mật khẩu tạm. Nó giúp **khôi phục tự phục vụ** chứ chưa "xác thực chính chủ".
2. Muốn **mạnh như email**, số phải **đến từ hồ sơ nhà trường** (cột trong Excel), và hệ thống chỉ gửi tới số đó.
3. **Rào cản thực tế lớn nhất:** brandname và mẫu tin cho nhà cung cấp nội địa, cộng chi phí mỗi tin và rủi ro SMS pumping. Email qua Gmail App Password gần như không có rào cản và chi phí, nhưng bị giới hạn khoảng 500 thư mỗi ngày.
4. **NIST xếp SMS vào nhóm hạn chế**: nếu dùng SMS thì phải có **phương án thay thế** (ví dụ email hoặc Quản trị viên xác nhận), thông báo rủi ro, và kế hoạch chuyển đổi.
5. **Khuyến nghị:** giữ **email (phương án B)** làm đường chính khi quay lại nâng cấp; xem SMS là **kênh bổ sung** (khôi phục hoặc xác nhận lần hai) **sau khi** có nhà cung cấp và brandname, và thiết kế mô-đun `ContactVerification` để thêm kênh SMS mà không viết lại. Nếu bắt buộc chọn SMS làm kênh chính: **số do nhà trường cung cấp**, gửi sau khi đã đăng nhập bằng mật khẩu tạm, có trần ngân sách, có lối thoát cho người không nhận được mã.

## 6. Nguồn
- NIST SP 800-63B-4: <https://pages.nist.gov/800-63-4/sp800-63b.html>, <https://pages.nist.gov/800-63-4/sp800-63b/authenticators/>
- OWASP Forgot Password Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html>
- eSMS API gửi OTP/CSKH (brandname bắt buộc): <https://developers.esms.vn/en/esms-api/send-sms-api/send-otp-customer-care-message>
- Giá Twilio SMS Việt Nam: <https://www.twilio.com/en-us/sms/pricing/vn>
- SMS pumping (thứ cấp): <https://www.techtarget.com/cybersecurity/feature/SMS-pumping-attacks-and-how-to-mitigate-them>, <https://46elks.com/blog/2023/03/01/sms-traffic-fraud>, <https://www.authsignal.com/guides/how-to-mitigate-sms-pumping-without-breaking-signup>
- Giá SMS nội địa (thứ cấp, chưa kiểm): <https://www.vietguys.biz/en/case-study-detail/sea-group-and-the-cost-problem-of-sms-services>, <https://viblo.asia/p/gui-sms-bang-speedsms-RQqKL27pl7z>
- Brandname (thứ cấp, chưa kiểm): <https://lawnet.vn/ngan-hang-phap-luat/en/tu-van-phap-luat/cong-nghe-thong-tin/is-there-any-limit-on-the-number-of-brandnames-for-advertisements-by-messaging-in-vietnam-380307>
- Nghị định 13/2023 (thứ cấp, chưa kiểm): <https://hethongphapluat.com/nghi-dinh-13-2023-nd-cp-ve-bao-ve-du-lieu-ca-nhan/dieu-11>, <https://www.bsigroup.com/globalassets/localfiles/vi-vn/events/2023/20230719/pims-in-support-to-compliance-with-decree-13_ndcp.pdf>
