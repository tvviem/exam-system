# Hướng dẫn sử dụng BLUni Exam dành cho Quản trị viên

<!-- doi-tuong: Quản trị viên -->

## 1. Giới thiệu

**Quản trị viên** là người quản lý tài khoản và theo dõi hoạt động của hệ thống **BLUni Exam**. Quản trị viên **không soạn đề hay tổ chức Phiên thi** (đó là việc của Người ra đề); Quản trị viên làm các việc sau:

- Quản lý **Người dùng**: xem, sửa thông tin, gắn **Nhãn vai trò**, Khóa đăng nhập, Xóa.
- Mời **Người ra đề** bằng **Lời mời**.
- Duyệt **Yêu cầu cấp tài khoản** (danh sách Người dự thi do Người ra đề gửi lên).
- Quản lý **Đơn vị** (khoa, bộ môn).
- **Ủy quyền chấm** khi chủ Phiên thi gặp sự cố.
- Theo dõi **Lịch sử đăng nhập**, **Nhật ký thao tác**, **Hàng đợi thư** và **Sao lưu dữ liệu**.

> **Quan trọng:** hệ thống nên có **ít nhất hai Quản trị viên** đang hoạt động, để một người vắng mặt thì người kia vẫn xử lý được sự cố. Quản trị viên đầu tiên được tạo khi cài đặt hệ thống (do người triển khai thực hiện); từ đó bạn tạo thêm Quản trị viên khác ngay trong ứng dụng (mục 4.5).

### 1.1. Các vai trò trong hệ thống

| Vai trò | Làm được gì |
|---|---|
| **Quản trị viên** | Quản lý người dùng và hệ thống (tài liệu này). |
| **Người ra đề** | Soạn câu hỏi, Bộ đề, tổ chức Phiên thi, chấm và công bố. |
| **Người dự thi** | Vào thi, làm bài, xem kết quả, gửi Phúc khảo. |

Một người có thể mang **Nhãn vai trò** Người ra đề, Người dự thi, hoặc cả hai. Tài khoản **Quản trị viên** là loại riêng, không mang Nhãn vai trò.

## 2. Đăng nhập và làm quen với giao diện

### 2.1. Đăng nhập

Mở trang đăng nhập, nhập **Tên đăng nhập hoặc email** và **Mật khẩu**, bấm **Đăng nhập**.

![Màn đăng nhập](anh:chung/dang-nhap-may-tinh)

> **Lưu ý:** đăng nhập sai nhiều lần liên tiếp sẽ bị chặn tạm thời 15 phút để chống dò mật khẩu. Xem mục 9 nếu bạn hoặc người dùng bị chặn.

### 2.2. Giao diện quản trị

Sau khi đăng nhập, bạn vào trang **Người dùng**. Thanh bên trái liệt kê các mục quản trị:

![Trang Người dùng và thanh điều hướng](anh:quan-tri/01-nguoi-dung)

| Mục | Dùng để |
|---|---|
| **Người dùng** | Xem và quản lý mọi tài khoản. |
| **Yêu cầu cấp tài khoản** | Duyệt danh sách Người dự thi mới. |
| **Lời mời** | Mời Người ra đề. |
| **Đơn vị** | Quản lý khoa, bộ môn. |
| **Ủy quyền chấm** | Giao quyền chấm thay chủ Phiên thi. |
| **Lịch sử đăng nhập** | Xem ai đăng nhập, thành công hay thất bại. |
| **Nhật ký thao tác** | Xem các thao tác quan trọng đã làm. |
| **Hàng đợi thư** | Theo dõi việc gửi thư của hệ thống. |
| **Sao lưu dữ liệu** | Xem tình trạng sao lưu. |

Biểu tượng **chuông** ở góc phải là **Thông báo** (ví dụ "có Yêu cầu cấp tài khoản mới"). Biểu tượng người ở góc phải mở **Tài khoản của tôi** (xem mục 8.5).

> **Mẹo:** trên điện thoại, thanh điều hướng nằm ở đáy màn hình; mục ít dùng nằm trong menu **Thêm**.

## 3. Quản lý Đơn vị

**Đơn vị** là khoa hoặc bộ môn. Mỗi Người ra đề thuộc một Đơn vị, nên cần tạo Đơn vị **trước khi mời Người ra đề**.

1. Vào **Đơn vị**, bấm **Thêm Đơn vị**.
2. Nhập **Mã Đơn vị** (ngắn, ví dụ CNTT) và **Tên Đơn vị** (đầy đủ).
3. Bấm **Lưu thay đổi**.

![Thêm Đơn vị](anh:quan-tri/02-them-don-vi)

![Danh sách Đơn vị](anh:quan-tri/03-danh-sach-don-vi)

Bấm biểu tượng bút ở cuối dòng để sửa Đơn vị.

## 4. Quản lý tài khoản

### 4.1. Mời Người ra đề (Lời mời)

1. Vào **Lời mời**, bấm **Mời Người ra đề**.
2. Nhập **Họ tên**, **Email người được mời** và chọn **Đơn vị**.
3. Bấm **Gửi thư mời**.

![Mời Người ra đề](anh:quan-tri/04-moi-nguoi-ra-de)

Hệ thống **tự gửi thư mời** tới email đó. Liên kết trong thư **dùng được một lần** và có **hạn 7 ngày** kể từ lúc thư được gửi. Người được mời mở liên kết, đặt mật khẩu và vào hệ thống.

![Lời mời đã gửi](anh:quan-tri/05-loi-moi-da-gui)

Trạng thái và thao tác của một Lời mời:

- **Đang chờ**: chưa được nhận. Bạn có thể **Gửi lại thư mời** (liên kết cũ mất hiệu lực ngay, thư mới có hạn 7 ngày) hoặc **Thu hồi** (liên kết đã gửi không dùng được nữa).
- **Đã nhận**: người được mời đã tạo tài khoản.
- Lời mời hết hạn: gửi lại để tạo liên kết mới.

> **Lưu ý:** mã của Lời mời chỉ nằm trong thư, hệ thống không hiển thị lại. Nếu người được mời không thấy thư, nhờ họ kiểm tra thư rác hoặc dùng **Gửi lại thư mời**.

### 4.2. Duyệt Yêu cầu cấp tài khoản

Người ra đề gửi danh sách lớp (file Excel hoặc CSV, mỗi dòng có email). Khi có yêu cầu mới, bạn nhận **Thông báo** (chuông).

![Thông báo có yêu cầu mới](anh:quan-tri/06-chuong-thong-bao)

Bấm vào thông báo để mở yêu cầu. Trang yêu cầu chia các dòng thành ba nhóm:

- **Sẵn sàng duyệt**: người mới, hoặc khớp với tài khoản có sẵn (hệ thống làm nổi bật dòng khớp để bạn đối chiếu).
- **Cần xác nhận**: khôi phục tài khoản đã Xóa, hoặc khác họ tên: bạn xem **đối chiếu** rồi quyết định.
- **Không duyệt được**: dòng lỗi hoặc bị chặn, kèm lý do.

![Xem yêu cầu](anh:quan-tri/07-xem-yeu-cau)

Bấm **Duyệt … dòng sẵn sàng** để tạo tài khoản. Bạn cũng có thể chọn từng dòng để duyệt hoặc **Không duyệt**, hay **Từ chối yêu cầu** (menu **Thao tác khác với yêu cầu**, nhập lý do).

![Yêu cầu đã duyệt](anh:quan-tri/09-da-duyet)

Sau khi duyệt:

- Mỗi người mới có tài khoản ở trạng thái **Chờ kích hoạt**.
- Hệ thống **gửi thư kích hoạt** tới email từng người (gửi dần theo hạn mức thư mỗi ngày, xem ở **Hàng đợi thư**). Mỗi người **tự đặt mật khẩu** bằng liên kết trong thư; **không có phiếu hay mật khẩu tạm**.
- Bảng **Theo dõi kích hoạt** (cả bạn và Người ra đề gửi yêu cầu cùng xem được) cho biết ai đã kích hoạt, ai chưa nhận thư, thư lỗi. Có các nút **Gửi lại cho tất cả**, **Sửa email…** và **Liên kết hỗ trợ…**.

> **Mẹo:** nhắc người dùng kiểm tra cả thư mục **Spam (thư rác)**. Thư kích hoạt có thể lọt vào đó.

### 4.3. Danh sách Người dùng

Trang **Người dùng** liệt kê mọi tài khoản (có phân trang).

- **Tìm Người dùng**: theo họ tên, tên đăng nhập, email, Mã định danh hoặc Lớp; không cần gõ dấu (gõ "do duc" tìm ra "Đỗ Đức"). Từ 3 ký tự trở lên tìm nhanh hơn.
- Khi có hơn 10.000 người khớp, danh sách ghi **"hơn 10.000"** và chỉ cho xem 10.000 người mới tạo nhất; Lịch sử đăng nhập và Nhật ký thao tác cũng vậy. Hãy lọc hoặc tìm để thu hẹp.
- Lọc **Trạng thái**, **Nhãn vai trò** và **Kích hoạt** (**Chờ kích hoạt**, **Email chưa xác thực**, **Thư lỗi**).

![Lọc người chờ kích hoạt](anh:quan-tri/10-loc-cho-kich-hoat)

> **Mẹo:** trước kỳ thi, lọc **Chờ kích hoạt** để biết ai còn chưa vào được hệ thống.

### 4.4. Trang chi tiết một người dùng

Bấm tên một người để mở trang chi tiết.

![Chi tiết người dùng](anh:quan-tri/11-chi-tiet-nguoi-dung)

- **Thông tin**: sửa Họ tên, Mã định danh, Lớp, Ngày sinh, Giới tính rồi bấm **Lưu thay đổi**.
- **Nhãn vai trò**: tick **Người ra đề** hoặc **Người dự thi**. Người dùng không còn nhãn nào thì đăng nhập được nhưng **không vào được khu nào**.
- **Tài khoản**: lần đăng nhập gần nhất, ngày tạo; liên kết nhanh tới **Lịch sử đăng nhập** và **Nhật ký thao tác** của người đó.
- **Kích hoạt và email** (khi chưa kích hoạt hoặc email chưa xác thực): **Gửi lại thư kích hoạt**, **Sửa email…**, **Tạo liên kết hỗ trợ…** (liên kết kích hoạt để đưa trực tiếp khi thư không tới).
- **Thao tác**: **Khóa đăng nhập** và **Xóa người dùng**.

**Khóa đăng nhập**: mọi Phiên đăng nhập của người này bị thu hồi ngay và họ không đăng nhập được cho tới khi **Mở khóa**. Nhập **Lý do** (lưu vào Nhật ký thao tác).

![Khóa đăng nhập](anh:quan-tri/12-khoa-dang-nhap)

**Xóa người dùng**: đưa người này ra khỏi sử dụng vĩnh viễn, không khôi phục được; lịch sử và kết quả liên quan vẫn được giữ.

> **Cảnh báo:** không Khóa hay Xóa được người đang tham gia **Phiên thi đang diễn ra**. Trang người dùng báo rõ Phiên thi nào và vô hiệu hai nút này.

**Xóa Người ra đề** có thêm một bước: hệ thống chuyển **Chủ đề, Bộ đề nháp và các Phiên thi** của người đó cho một Người ra đề khác bạn chọn (**Chuyển giao**), để không mất dữ liệu.

### 4.5. Tạo thêm Quản trị viên

Bấm **Tạo Quản trị viên** ở đầu trang **Người dùng**:

1. Nhập **Họ tên** và **Email nhận thư kích hoạt** (email không trùng tài khoản khác).
2. Có thể nhập **Tên đăng nhập** (nếu bỏ trống, hệ thống dùng email làm tên đăng nhập).
3. Bấm **Tạo tài khoản**.

![Tạo Quản trị viên](anh:quan-tri/13-tao-quan-tri-vien)

Hệ thống gửi **thư kích hoạt** tới email đó. Người nhận tự đặt mật khẩu. Tài khoản Quản trị viên tách riêng và không mang Nhãn vai trò.

## 5. Ủy quyền chấm

Khi chủ Phiên thi gặp sự cố (ốm, mất liên lạc) trong lúc đang chấm, bạn có thể giao quyền chấm cho một Người ra đề khác.

1. Vào **Ủy quyền chấm**, **tìm Phiên thi** theo tên.
2. Bấm **Ủy quyền** ở dòng Phiên thi.

![Ủy quyền chấm](anh:quan-tri/18-uy-quyen-cham)

3. Gõ tên vào ô **Tìm Người ra đề**, bấm **Ủy quyền** ở người được chọn.

![Chọn người chấm thay](anh:quan-tri/19-chon-nguoi-cham-thay)

![Đã ủy quyền](anh:quan-tri/20-da-uy-quyen)

Người được ủy quyền (người này **không** có tên trong Danh sách dự thi) được chấm Tự luận, quyết Mức xử lý, Công bố, xử lý Phúc khảo và xuất Excel. Họ **không** sửa hay Hủy Phiên thi, không Đính chính đáp án, không xem Theo dõi trực tiếp. Bạn có thể bấm **Thu hồi** để thu lại quyền đã giao (cùng hộp thoại). Mọi thao tác ghi vào nhật ký.

## 6. Theo dõi hệ thống

### 6.1. Lịch sử đăng nhập

Mục **Lịch sử đăng nhập** liệt kê mọi lần đăng nhập: thời điểm, người dùng, địa chỉ IP, kết quả (thành công, sai mật khẩu, bị khóa...). Lọc theo **Kết quả** để tìm đăng nhập thất bại bất thường.

![Lịch sử đăng nhập](anh:quan-tri/14-lich-su-dang-nhap)

### 6.2. Nhật ký thao tác

Mục **Nhật ký thao tác** ghi lại các việc quan trọng: tạo Lời mời, duyệt Yêu cầu, Khóa đăng nhập, ủy quyền chấm, Công bố kết quả, Cộng giờ, Buộc nộp... kèm người thực hiện, thời điểm, địa chỉ IP và chi tiết. Lọc theo **Hành động**.

![Nhật ký thao tác](anh:quan-tri/15-nhat-ky-thao-tac)

Nhật ký dùng để truy vết khi có thắc mắc ("ai đã làm việc này, lúc nào, vì sao").

### 6.3. Hàng đợi thư

Hệ thống gửi thư (kích hoạt, quên mật khẩu, Lời mời) qua **hàng đợi bền**: nếu mạng hay máy chủ thư gặp lỗi, thư được thử lại, **không mất thư**.

![Hàng đợi thư](anh:quan-tri/16-hang-doi-thu)

Màn hình cho biết **Đã gửi … thư trong 24 giờ** so với hạn mức, số thư **Đang chờ**, **Đang gửi**, **Đã gửi**, **Lỗi**, **Bị từ chối**, và danh sách **Thư chưa gửi được**. Thư vượt hạn mức trong ngày tự chờ đến khi còn chỗ.

> **Mẹo:** trước ngày gửi hàng loạt (ví dụ kích hoạt cả khóa), hãy xem hạn mức còn lại để dự trù thời gian.

### 6.4. Sao lưu dữ liệu

Mục **Sao lưu dữ liệu** chỉ để **xem** tình trạng: **Bản đêm gần nhất**, **Bản nền gần nhất**, **Thử khôi phục gần nhất** và **Lần chạy gần đây**. Việc sao lưu do máy chủ tự chạy; khôi phục là việc của người vận hành máy chủ.

![Sao lưu dữ liệu](anh:quan-tri/17-sao-luu-du-lieu)

> **Quan trọng:** nếu thấy dải cảnh báo đỏ hoặc bản đêm quá cũ, hãy báo ngay người vận hành máy chủ.

## 7. Việc cần làm trước một kỳ thi

| Thời điểm | Việc cần làm |
|---|---|
| **Trước 1 tuần** | Hệ thống có ít nhất **2 Quản trị viên** đăng nhập được. Bản sao lưu gần nhất còn mới. Lọc **Chờ kích hoạt** ở **Người dùng** và nhắc những người chưa kích hoạt. |
| **Trước 1 ngày** | **Không triển khai bản mới** từ lúc này đến khi thi xong (hãy báo người vận hành). Kiểm **Hàng đợi thư** không có thư lỗi chưa xử lý. |
| **Trong kỳ thi** | Giữ điện thoại, kênh liên lạc để hỗ trợ Người ra đề; sẵn sàng xử lý khóa tài khoản, hỗ trợ kích hoạt. |
| **Sau kỳ thi** | Kiểm **Sao lưu dữ liệu** có bản mới sau khi công bố kết quả. |

## 8. Các tình huống thường gặp

> **Báo "Máy chủ đang bận"** khi tìm hoặc mở danh sách: hệ thống giới hạn số lượt tìm nặng chạy cùng lúc để không làm chậm người đang thi. Đợi vài giây rồi thử lại, tránh bấm tìm liên tiếp.

### 8.1. Người dùng không nhận được thư kích hoạt

1. Kiểm tra email trên trang chi tiết người dùng có đúng không; nếu sai, **Sửa email…**.
2. Bấm **Gửi lại thư kích hoạt**.
3. Nhắc kiểm tra thư mục **Spam**.
4. Nếu vẫn không được và người dùng đang ở bên cạnh: **Tạo liên kết hỗ trợ…** rồi đưa liên kết trực tiếp (liên kết chỉ hiện một lần).

### 8.2. Người dùng quên mật khẩu

Hướng dẫn họ dùng **Quên mật khẩu?** ở màn đăng nhập; họ nhận **liên kết đặt lại** (dùng một lần) qua email đã xác thực.

### 8.3. Người dùng bị chặn vì đăng nhập sai nhiều lần

Sau nhiều lần sai, tài khoản bị chặn tạm 15 phút: đợi hết thời gian chặn rồi đăng nhập lại. Nếu cần gấp, hoặc nếu **chính Quản trị viên** bị chặn mà không còn Quản trị viên nào khác, hãy báo người vận hành máy chủ để mở khóa.

### 8.4. Người ra đề nghỉ việc hoặc chuyển công tác

1. **Chuyển giao** Chủ đề, Bộ đề nháp và Phiên thi cho người nhận trước (hoặc khi Xóa người dùng, hệ thống hỏi người nhận).
2. **Khóa đăng nhập** hoặc **Xóa người dùng**.

### 8.5. Đổi thông tin tài khoản của chính bạn

Biểu tượng người ở góc phải mở **Tài khoản của tôi**: sửa **Họ và tên**, **Ngày sinh**, **Giới tính**; xem thông tin do Quản trị viên quản lý; đổi **Email** (cần xác thực bằng thư); và đổi mật khẩu.

![Tài khoản của tôi](anh:chung/tai-khoan-cua-toi)

### 8.6. Người dùng thắc mắc "ai đã làm việc này"

Mở **Nhật ký thao tác**, lọc theo **Hành động** hoặc xem trang chi tiết người dùng và mục **Nhật ký thao tác**.

## 9. Phụ lục: thuật ngữ

| Thuật ngữ | Ý nghĩa |
|---|---|
| **Nhãn vai trò** | Quyền vào khu của Người ra đề hoặc Người dự thi. |
| **Đơn vị** | Khoa, bộ môn của Người ra đề. |
| **Lời mời** | Thư mời Người ra đề tạo tài khoản, dùng một lần, hạn 7 ngày. |
| **Yêu cầu cấp tài khoản** | Danh sách Người dự thi do Người ra đề gửi, chờ Quản trị viên duyệt. |
| **Chờ kích hoạt** | Tài khoản đã tạo nhưng người dùng chưa đặt mật khẩu qua thư kích hoạt. |
| **Khóa đăng nhập** | Chặn người dùng đăng nhập, thu hồi mọi phiên đang mở. |
| **Chuyển giao** | Giao Chủ đề, Bộ đề nháp, Phiên thi của một Người ra đề cho người khác. |
| **Ủy quyền chấm** | Cho người khác chấm thay chủ Phiên thi khi có sự cố. |
