# Hệ thống khảo thí trực tuyến BLUNI

Hệ thống cho phép Người ra đề xây dựng Bộ đề từ ngân hàng Câu hỏi của mình và tổ chức Phiên thi để Người dự thi làm bài trên điện thoại hoặc máy tính. Tên tiếng Anh trong ngoặc là tên dùng trong mã nguồn.

## Người dùng

**Người dùng** (`User`):
Một tài khoản đăng nhập bằng email hoặc tên đăng nhập kèm mật khẩu, được tạo bởi Quản trị viên, qua Lời mời hoặc qua Yêu cầu cấp tài khoản.
_Avoid_: tài khoản sinh viên, thành viên

**Quản trị viên** (`Admin`):
Người dùng quản lý vòng đời của các Người dùng khác và không mang Nhãn vai trò. Quản trị viên đầu tiên được khởi tạo khi triển khai hệ thống, sau đó có thể chỉ định thêm Quản trị viên khác.
_Avoid_: superuser, root

**Nhãn vai trò** (`RoleTag`):
Nhãn gắn cho Người dùng không phải Quản trị viên, gồm *Người ra đề* và *Người dự thi*. Một Người dùng có thể mang một hoặc cả hai nhãn.
_Avoid_: quyền, nhóm quyền, permission

**Người ra đề** (`Examiner`):
Người dùng mang Nhãn vai trò Người ra đề, sở hữu Chủ đề, Câu hỏi, Bộ đề, Phiên thi và chấm Câu tự luận trong các Phiên thi của mình.
_Avoid_: giảng viên, giáo viên, Lecturer, Teacher

**Người dự thi** (`Candidate`):
Người dùng mang Nhãn vai trò Người dự thi; chỉ những người này mới được thêm vào Danh sách dự thi.
_Avoid_: sinh viên, học viên, thí sinh, Student, Examinee

**Lời mời** (`Invitation`):
Đề nghị Quản trị viên gửi tới một người để họ trở thành Người ra đề. Lời mời chưa phải tài khoản; chỉ khi người nhận chấp nhận mới có Người dùng.
_Avoid_: đăng ký, sign-up

**Chờ kích hoạt** (`PendingActivation`):
Trạng thái của một Người dùng đã có tài khoản nhưng chưa đặt mật khẩu nên chưa đăng nhập được; khác với Lời mời, người này đã là Người dùng.
_Avoid_: chưa duyệt, tài khoản treo

**Liên kết một lần** (`AuthLink`):
Liên kết gửi cho một Người dùng để làm đúng một việc nhạy cảm (kích hoạt tài khoản, đặt lại mật khẩu, xác thực email), dùng được một lần và có hạn.
_Avoid_: mã, token, link kích hoạt

**Liên kết hỗ trợ** (`SupportLink`):
Liên kết một lần do người có quyền tạo hộ khi thư không đến được; người nhận tự đặt mật khẩu nên không ai biết mật khẩu của người khác.
_Avoid_: liên kết thủ công, mật khẩu tạm

**Email đã xác thực** (`verified email`):
Email của Người dùng đã được chính chủ hộp thư xác nhận bằng cách mở Liên kết một lần gửi tới đó.
_Avoid_: email hợp lệ, email chính thức

**Thư khẩn** (`UrgentMail`) và **Thư hàng loạt** (`BulkMail`):
Hai loại thư theo mức ưu tiên khi gửi. Thư khẩn là thư một người đang chờ để làm tiếp việc của mình (quên mật khẩu, báo mật khẩu đã đổi, Lời mời, Liên kết hỗ trợ) và luôn có phần hạn mức dành riêng; Thư hàng loạt là thư gửi cho cả danh sách một lúc (kích hoạt tài khoản cả lớp) và có thể phải chờ sang ngày sau.
_Avoid_: thư quan trọng, thư thường

**Hạn mức gửi thư** (`MailQuota`):
Số thư tối đa hệ thống gửi trong 24 giờ liên tục, thấp hơn trần của nhà cung cấp thư để không bao giờ chạm trần đó. Thư vượt hạn mức chờ sang cửa sổ sau, không bị mất và không tính là lỗi.
_Avoid_: giới hạn ngày, quota

**Thư bị từ chối** (`RejectedMail`):
Thư mà máy chủ thư báo ngay lúc nhận rằng địa chỉ người nhận không dùng được. Khác với thư đã gửi nhưng người nhận không kích hoạt, vì nhà cung cấp thư thường không báo lại.
_Avoid_: thư lỗi, thư bounce

**Yêu cầu cấp tài khoản** (`AccountRequest`):
Danh sách người do Người ra đề tập hợp và gửi Quản trị viên để cấp tài khoản Người dự thi.
_Avoid_: đăng ký hộ, import

**Mã định danh** (`Code`):
Mã do Quản trị viên gán cho Người dùng để nhận diện, ví dụ mã sinh viên hoặc mã nhân viên.
_Avoid_: MSSV, ID

**Lớp** (`Class`):
Nhãn nhóm gắn với Người dùng, chỉ dùng để tìm và thêm nhanh vào Danh sách dự thi. Không lưu lịch sử.
_Avoid_: nhóm học, cohort

**Đơn vị** (`Unit`):
Nơi công tác của Người ra đề, ví dụ một khoa hoặc phòng ban.
_Avoid_: khoa, department

**Phiên đăng nhập** (`AuthSession`):
Khoảng thời gian một Người dùng đăng nhập trên một thiết bị, từ lúc đăng nhập tới khi đăng xuất, hết hạn hoặc bị thu hồi. Một Người dùng có thể có nhiều Phiên đăng nhập cùng lúc.
_Avoid_: session (đứng một mình, dễ nhầm với Phiên thi), phiên

**Khóa đăng nhập** (`Lock`):
Trạng thái tạm thời không cho Người dùng đăng nhập; chỉ Quản trị viên đặt và mở lại được. Không đặt được khi Người dùng đang tham gia một Phiên thi đang diễn ra (chủ của Phiên thi đó, hoặc Người dự thi đang có Lượt làm bài đang làm); Quản trị viên được cảnh báo kèm danh sách Phiên thi.
_Avoid_: cấm, ban, vô hiệu hóa

**Phiếu tài khoản** (`CredentialSlip`):
Phiếu in cho từng Người dự thi, ghi tên đăng nhập và mật khẩu tạm, được tạo khi Yêu cầu cấp tài khoản được duyệt. Mật khẩu tạm phải đổi ở lần đăng nhập đầu tiên.
_Avoid_: phiếu mật khẩu, thẻ dự thi

**Xóa người dùng** (`Remove`):
Đưa Người dùng ra khỏi sử dụng vĩnh viễn nhưng vẫn giữ toàn bộ lịch sử và kết quả liên quan. Người ra đề còn Chủ đề, Bộ đề hoặc Phiên thi thì phải Chuyển giao cho người nhận ngay trong lúc Xóa; mọi Bộ đề của họ (nháp, đã Phát hành, đã Lưu trữ) và mọi Phiên thi (kể cả đã Hủy; Danh sách dự thi, Lượt làm bài và Câu trả lời giữ nguyên) sang người nhận cùng Chủ đề. Không Xóa được khi Người dùng đang tham gia một Phiên thi đang diễn ra (như Khóa đăng nhập).
_Avoid_: hủy tài khoản

## Ngân hàng câu hỏi

**Chủ đề** (`Topic`):
Nhóm Câu hỏi thuộc sở hữu duy nhất của một Người ra đề, thường tương ứng với một học phần. Không dùng chung giữa các Người ra đề.
_Avoid_: học phần, môn học, Course, Subject

**Câu hỏi** (`Question`):
Một đơn vị nội dung kiểm tra thuộc một Chủ đề, có một Loại câu hỏi. Câu hỏi thuộc sở hữu của Người ra đề tạo ra nó; chỉ người đó được dùng nó, và có thể dùng lại trong nhiều Bộ đề của mình.

**Lưu trữ câu hỏi** (`Archive`):
Ẩn Câu hỏi khỏi danh sách mặc định và khỏi việc chọn vào Bộ đề mới nhưng giữ lại; Khôi phục đưa Câu hỏi trở lại. Câu hỏi nằm trong một Bộ đề (nháp hoặc đã Phát hành) không xóa được: Bộ đề nháp thì gỡ câu ra trước, Bộ đề đã Phát hành thì chỉ Lưu trữ vì Bản chụp cần câu gốc. Câu hỏi chưa nằm trong Bộ đề nào thì xóa hẳn được.
_Avoid_: xóa mềm câu hỏi

**Chuyển giao** (`Transfer`):
Hành động của Quản trị viên chuyển quyền sở hữu một Chủ đề, cùng mọi Câu hỏi trong đó, từ Người ra đề này sang Người ra đề khác. Tại mọi thời điểm, mỗi Chủ đề chỉ có một chủ. Chủ đề trùng tên với Chủ đề của người nhận được thêm "(từ <tên người cho>)"; Hình minh họa đi theo Câu hỏi (đổi chủ, dùng ảnh sẵn có của người nhận, hoặc sao chép khi còn dùng chung với Câu hỏi ở lại); Lô nhập gắn với Chủ đề đó bị xóa. Bộ đề nháp có câu thuộc Chủ đề được chuyển cũng sang người nhận, còn các câu của Chủ đề không chuyển bị gỡ khỏi Bộ đề đó (hộp thoại báo trước số Bộ đề và số câu bị gỡ); Bộ đề đã Phát hành ở lại người cho. Chuyển giao không đụng Phiên thi (Phiên thi chỉ chuyển khi Xóa người dùng).
_Avoid_: chia sẻ, bàn giao

**Phần dẫn** (`Stem`):
Nội dung chính của Câu hỏi mà Người dự thi đọc trước khi trả lời, có thể kèm Hình minh họa.
_Avoid_: đề bài, nội dung câu

**Lô nhập** (`QuestionImportBatch`):
Một lần Người ra đề tải file Excel chứa Câu hỏi vào một Chủ đề; mỗi Loại câu hỏi nằm ở một sheet của file. Lô cho xem trước từng dòng, chọn dòng rồi mới tạo Câu hỏi, và được giữ 30 ngày để xem lại. Lô chờ xác nhận hoặc đọc lỗi có thể hủy (xóa) để sửa file rồi tải lại.
_Avoid_: import, đợt nhập

**Nghi trùng** (`Duplicate suspect`):
Dòng của Lô nhập có nội dung giống một Câu hỏi đã có trong Chủ đề đích, hoặc giống một dòng đứng trước trong cùng file. Chỉ là cảnh báo: Người ra đề quyết định có tạo hay không.
_Avoid_: trùng lặp (khi chưa chắc), duplicate

**Hình minh họa** (`Illustration`):
Hình ảnh gắn vào Phần dẫn, Phương án hoặc Mệnh đề để diễn đạt nội dung.
_Avoid_: attachment, media

**Câu chọn một** (`SingleChoice`):
Câu hỏi có từ 2 Phương án trở lên và đúng một Phương án đúng.
_Avoid_: trắc nghiệm đơn

**Câu chọn nhiều** (`MultipleChoice`):
Câu hỏi có từ 2 Phương án trở lên và một hoặc nhiều Phương án đúng.
_Avoid_: trắc nghiệm nhiều đáp án

**Chùm đúng/sai** (`TrueFalseCluster`):
Câu hỏi gồm một Phần dẫn và một hoặc nhiều Mệnh đề, Người dự thi nhận định từng Mệnh đề là đúng hay sai.
_Avoid_: câu đúng sai đơn (là Chùm đúng/sai có một Mệnh đề)

**Câu tự luận** (`Essay`):
Câu hỏi yêu cầu Người dự thi viết nội dung trả lời ngắn, do Người ra đề chấm.
_Avoid_: câu luận, câu hỏi mở

**Phương án** (`Option`):
Một lựa chọn trong Câu chọn một hoặc Câu chọn nhiều.
_Avoid_: đáp án (dễ nhầm với Đáp án đúng)

**Mệnh đề** (`Statement`):
Một nhận định trong Chùm đúng/sai, có giá trị đúng hoặc sai.
_Avoid_: ý, câu con

**Đáp án đúng** (`Key`):
Tập Phương án đúng, hoặc giá trị đúng/sai của từng Mệnh đề, dùng để chấm tự động.
_Avoid_: lời giải

**Quy tắc chấm** (`ScoringRule`):
Cách quy đổi Câu trả lời thành điểm cho câu có nhiều thành phần: *Tỷ lệ* (`Proportional`), *Đúng hết* (`AllOrNothing`) hoặc *Bậc thang* (`Ladder`, chỉ dùng cho Chùm đúng/sai).
_Avoid_: thang điểm

**Bậc thang** (`Ladder`):
Bảng do Người ra đề thiết lập, quy định tỷ lệ điểm tương ứng với số Mệnh đề được nhận định đúng trong một Chùm đúng/sai.
_Avoid_: thang bậc, step table

## Bộ đề và Phiên thi

**Bộ đề** (`Exam`):
Tập Câu hỏi có thứ tự và điểm số do một Người ra đề soạn, có thể chia thành nhiều Phần.
_Avoid_: đề thi, bài kiểm tra, test

**Phần** (`Section`):
Một nhóm Câu hỏi được hiển thị cùng nhau trong Bộ đề. Bộ đề không chia phần thì có đúng một Phần.
_Avoid_: mục, part

**Bản chụp** (`Snapshot`):
Bản sao đầy đủ nội dung một Câu hỏi (Phần dẫn, Phương án, Mệnh đề, Đáp án đúng, Quy tắc chấm, ảnh) được ghi vào Bộ đề lúc Phát hành. Lượt làm bài, Chấm và Phúc khảo chỉ đọc Bản chụp, nên sửa hay Lưu trữ Câu hỏi sau đó không đổi Bộ đề đã Phát hành.
_Avoid_: bản sao, backup

**Đặt điểm nhanh** (`Bulk points`):
Thao tác của Người ra đề đặt điểm cho nhiều câu của Bộ đề cùng lúc (theo Bộ đề, Phần hoặc Loại câu hỏi; mỗi câu một mức điểm hoặc chia đều một tổng điểm), xem trước rồi mới áp dụng.
_Avoid_: chia điểm tự động

**Lưu trữ Bộ đề** (`Archive exam`):
Ẩn Bộ đề đã Phát hành khỏi lựa chọn cho Phiên thi mới nhưng vẫn xem và Nhân bản được; Khôi phục đưa Bộ đề trở lại. Bộ đề nháp không Lưu trữ mà xóa.
_Avoid_: xóa bộ đề

**Phát hành** (`Publish`):
Hành động đóng băng nội dung Bộ đề để dùng cho Phiên thi. Sửa Câu hỏi về sau không làm thay đổi Bộ đề đã phát hành.
_Avoid_: duyệt, kích hoạt

**Phiên thi** (`Session`):
Một lần tổ chức một Bộ đề đã Phát hành cho một Danh sách dự thi, trong một Khung giờ, với các thiết lập làm bài.
_Avoid_: ca thi, kỳ thi, đợt kiểm tra

**Danh sách dự thi** (`Roster`):
Tập Người dự thi được phép làm bài trong một Phiên thi.
_Avoid_: danh sách lớp

**Mã vào thi** (`AccessCode`):
Mã do Người ra đề đặt trước cho một Phiên thi; Người dự thi nhập mã này để vào làm bài.
_Avoid_: mã bộ đề, mã phòng, PIN

**Khung giờ** (`Window`):
Khoảng thời gian từ lúc mở đến lúc đóng Phiên thi; chỉ được bắt đầu Lượt làm bài trong khoảng này. Mặc định mỗi Lượt được đủ Thời lượng kể cả khi vượt giờ đóng; Phiên thi bật Cắt cứng thì Lượt kết thúc lúc đóng Khung giờ.
_Avoid_: lịch thi

**Thiết bị dự thi** (`ExamDevice`):
Thiết bị duy nhất được gắn cho một Người dự thi trong một Phiên thi, tính từ lần đầu họ nhập đúng Mã vào thi. Mọi thao tác dự thi của người đó trong Phiên thi phải đến từ thiết bị này; thiết bị khác bị từ chối dù cùng tài khoản. Một thiết bị chỉ phục vụ một Người dự thi trong một Phiên thi.
_Avoid_: máy thi, phiên thi của thiết bị

**Phòng chờ** (`WaitingRoom`):
Trạng thái của một Người dự thi đã nhập đúng Mã vào thi (Thiết bị dự thi đã được gắn) nhưng chưa bắt đầu Lượt làm bài, vì Phiên thi chưa mở. Nhập mã được từ 30 phút trước giờ mở; đến giờ mở người ấy tự bấm bắt đầu, hệ thống không tự bắt đầu thay. Người ra đề thấy họ là "Đang chờ" (còn trực tuyến) hoặc "Chờ · mất kết nối" thay cho "Chưa vào". Không phải một Phiên thi hay một màn riêng của Người ra đề.
_Avoid_: sảnh, lobby, phòng đợi

**Thu hồi thiết bị** (`Revoke`):
Hành động của Người ra đề gỡ Thiết bị dự thi của một Người dự thi khi thiết bị gặp sự cố hoặc nghi ngờ thi hộ. Thiết bị bị thu hồi bị loại khỏi Phiên thi đó cho người ấy; thiết bị mới đầu tiên nhập đúng Mã vào thi sẽ được gắn và làm tiếp đúng Lượt làm bài cũ. Câu trả lời đã lưu được giữ, Câu trả lời chưa gửi từ thiết bị cũ không được nhận, trừ khi Người ra đề Hoàn tác Thu hồi.
_Avoid_: đổi thiết bị, cho phép đổi thiết bị, đăng xuất

**Hoàn tác Thu hồi** (`Pardon`):
Hành động của Người ra đề cho một thiết bị đã bị Thu hồi quay lại Phiên thi, thay cho thiết bị mới nếu thiết bị mới đã được gắn; Người dự thi làm tiếp đúng Lượt làm bài cũ, kể cả các Câu trả lời chưa gửi còn giữ trên thiết bị.
_Avoid_: mở khóa thiết bị, cho đổi thiết bị, cho thiết bị vào lại

**Thời lượng** (`Duration`):
Thời gian tối đa của một Lượt làm bài tính từ lúc bắt đầu.
_Avoid_: thời gian thi

**Cắt cứng** (`HardClose`):
Thiết lập của Phiên thi: Lượt làm bài kết thúc đúng lúc đóng Khung giờ thay vì được đủ Thời lượng. Mặc định tắt; khi tắt, người bắt đầu muộn vẫn được làm đủ Thời lượng dù đã quá giờ đóng. Hợp với phòng thi chỉ mượn được đến một giờ nhất định. Cộng giờ vẫn kéo dài được hạn của một Lượt kể cả khi Cắt cứng đang bật.
_Avoid_: khóa cứng, hết giờ cứng

**Đóng cửa vào thi** (`CloseEntry`):
Hành động của Người ra đề chặn việc bắt đầu Lượt làm bài mới trong Phiên thi, dù Khung giờ chưa đóng. Người đang làm bài vẫn làm tiếp đến hết hạn của mình; Người dự thi chưa vào được báo rằng Phiên thi đã đóng cửa vào thi. Người ra đề có thể Mở lại cửa vào thi khi Khung giờ chưa đóng.
_Avoid_: khóa phòng, đóng Phiên thi

**Cộng giờ** (`ExtendTime`):
Hành động của Người ra đề thêm số phút vào hạn nộp của một Lượt làm bài đang làm, của một nhóm Lượt đã chọn, hoặc của mọi Lượt đang làm trong phòng, ví dụ khi mất điện hay mất mạng. Mỗi lần Cộng giờ được ghi lại kèm lý do và hiện ngay trên màn hình của Người dự thi. Người ra đề cũng có thể cộng sẵn giờ cho từng người trong Danh sách dự thi trước khi thi (ví dụ hỗ trợ đặc biệt); phần cộng sẵn tính vào hạn ngay khi họ bắt đầu.
_Avoid_: gia hạn, kéo dài Phiên thi (kéo dài Khung giờ hoặc Thời lượng của cả Phiên thi là việc khác)

**Buộc nộp** (`ForceSubmit`):
Hành động của Người ra đề kết thúc ngay một Lượt làm bài, một nhóm Lượt đã chọn, hoặc mọi Lượt đang làm của cả Phiên thi. Các Câu trả lời đã lưu được giữ và Chấm như bình thường. Khác Đình chỉ ở chỗ không kèm Vi phạm.
_Avoid_: thu bài, ép nộp

**Hoàn tác Buộc nộp** (`UndoForceSubmit`):
Hành động của Người ra đề mở lại một Lượt vừa bị Buộc nộp nhầm, trong 10 phút kể từ lúc bị nộp. Lượt trở lại đang làm với các Câu trả lời đã lưu và hạn mới bằng phần thời gian còn lại lúc bị nộp, tính từ lúc hoàn tác. Chỉ áp dụng cho Lượt bị Buộc nộp (không cho Đình chỉ, hết giờ, Người dự thi tự nộp hay Hủy Phiên thi); không làm được khi người đó đã bắt đầu Lượt mới, khi Phiên thi đã Hủy, hay khi đã có điểm thủ công của Lượt hoặc Phiên thi đã Công bố kết quả.
_Avoid_: khôi phục bài, mở lại bài

**Hủy Phiên thi** (`Cancel`):
Hành động của Người ra đề dừng hẳn một Phiên thi, thường vì đề sai hoặc lộ đề: mọi Lượt đang làm được nộp ngay, không ai vào thi được nữa, không tính Kết quả nhưng vẫn xem lại được, và Người dự thi được thông báo. Không hoàn tác. Muốn thi lại thì tạo Phiên thi mới (cần sửa đề thì Nhân bản Bộ đề, Phát hành bản mới trước). Phiên thi đã có Lượt làm bài thì chỉ Hủy, không Xóa.
_Avoid_: hủy kỳ thi

**Xóa Phiên thi** (`Delete`):
Hành động của Người ra đề gỡ hẳn một Phiên thi chưa từng có Lượt làm bài, kèm Danh sách dự thi của nó; không còn xem lại được. Người dự thi đã được thêm vào Danh sách của một Phiên thi chưa Hủy được thông báo. Không hoàn tác. Phiên thi đã có Lượt làm bài thì Hủy chứ không Xóa, để còn xem lại.
_Avoid_: hủy (đứng một mình, dễ nhầm với Hủy Phiên thi), gỡ Phiên thi

**Xem thử** (`Preview`):
Chế độ Người ra đề đi qua Phiên thi của mình đúng như Người dự thi sẽ thấy, không tạo Lượt làm bài và không lưu gì. Người ra đề không được có tên trong Danh sách dự thi của Phiên thi do chính mình tạo.
_Avoid_: thi thử, demo

**Lượt làm bài** (`Attempt`):
Một lần Người dự thi làm bài trong Phiên thi, có thứ tự Câu hỏi và Phương án cố định sau khi bắt đầu.
_Avoid_: bài thi, lần thi, submission

**Câu trả lời** (`Response`):
Nội dung Người dự thi chọn hoặc viết cho một Câu hỏi trong Lượt làm bài.
_Avoid_: đáp án, answer

**Nộp bài** (`Submit`):
Kết thúc Lượt làm bài, do Người dự thi chủ động hoặc hệ thống tự động khi hết thời gian. Người ra đề cũng có thể kết thúc Lượt bằng Buộc nộp, Đình chỉ hoặc Hủy Phiên thi. Sau khi Nộp bài, Câu trả lời không còn sửa được (trừ Lượt bị Buộc nộp nhầm và được Hoàn tác Buộc nộp trong 10 phút).
_Avoid_: hoàn thành, finish

**Cần chú ý** (`NeedsAttention`):
Gợi ý trên màn Theo dõi rằng một Người dự thi đang làm bài có thể cần Người ra đề xem trước, vì có dấu hiệu như mất kết nối, rời màn hình nhiều lần, dùng thiết bị mới hoặc bị Thu hồi, hoặc làm chậm bất thường so với thời gian đã trôi. Chỉ để xem, không phải Vi phạm và không ghi vào Kết quả; Người ra đề tự quyết có hành động hay không.
_Avoid_: nghi vấn, đáng ngờ, nghi gian lận

**Vi phạm** (`Violation`):
Ghi nhận của Người ra đề, kèm lý do, về hành vi sai quy định của Người dự thi trong một Lượt làm bài. Hành động đi kèm là *Cảnh cáo* (vẫn làm tiếp, nội dung hiện trên màn hình của Người dự thi) hoặc *Đình chỉ*.
_Avoid_: gian lận, sự cố

**Đình chỉ** (`Disqualify`):
Hành động dừng ngay một Lượt làm bài vì Vi phạm nặng. Các Câu trả lời đã lưu đến thời điểm đó vẫn được giữ và Chấm như bình thường. Người bị Đình chỉ không bắt đầu được Lượt làm bài mới trong Phiên thi đó, kể cả khi còn lượt (khác Buộc nộp, chỉ đóng Lượt).
_Avoid_: hủy bài, cấm thi

**Mức xử lý** (`Penalty`):
Hình thức Người ra đề quyết định cho một Vi phạm: *không*, *trừ phần trăm điểm* hoặc *hủy kết quả*. Mức xử lý được áp lên Kết quả của Người dự thi trong cả Phiên thi; nhiều mức trừ phần trăm được cộng dồn, tối đa 100%. Có thể chọn hoặc đổi cho đến khi Công bố kết quả; sau đó chỉ thay đổi qua Phúc khảo.
_Avoid_: hình phạt, kỷ luật

**Hủy kết quả** (`Void`):
Mức xử lý nặng nhất: Kết quả của Người dự thi trong cả Phiên thi bằng 0 và ghi "Hủy", kể cả khi Phiên thi cho làm nhiều lượt.
_Avoid_: xóa bài

## Chấm và kết quả

**Chấm** (`Grading`):
Việc xác định điểm cho từng Câu trả lời: tự động với câu có Đáp án đúng, thủ công với Câu tự luận.
_Avoid_: đánh giá, marking

**Kết quả** (`Result`):
Tổng điểm và điểm từng câu của một Lượt làm bài sau khi Chấm, gồm Điểm thô và Điểm quy đổi.
_Avoid_: bảng điểm

**Điểm thô** (`RawScore`):
Tổng điểm đạt được trên tổng điểm của Bộ đề, ví dụ 37/50.

**Điểm quy đổi** (`ScaledScore`):
Điểm thô quy về thang 10, làm tròn đến 0,1 (từ 5 trở lên làm tròn lên), ví dụ 7,2 hoặc 6,5.
_Avoid_: điểm chuẩn hóa

**Chấm ẩn tên** (`BlindGrading`):
Cách Người ra đề chấm Câu tự luận mà không thấy tên, Mã định danh hay Lớp của người làm bài (chỉ thấy "Bài 17"); bật mặc định, tắt hoặc bật lại được đến khi Công bố kết quả. Điểm các câu tự luận trong bảng Kết quả cũng được ẩn cho đến khi chấm xong.
_Avoid_: chấm kín, chấm mù

**Ủy quyền chấm** (`GradingDelegate`):
Việc chủ Phiên thi hoặc Quản trị viên giao cho một Người ra đề khác (không có tên trong Danh sách dự thi của Phiên thi đó) quyền thay chủ Phiên thi chấm Câu tự luận, quyết Mức xử lý, Công bố kết quả, xử lý Phúc khảo và xuất Excel khi chủ Phiên thi có sự cố. Không gồm sửa hay Hủy Phiên thi, Đính chính đáp án, xem Theo dõi trực tiếp. Thu hồi được bất cứ lúc nào; không đổi chủ sở hữu.
_Avoid_: chuyển giao (đó là việc đổi chủ vĩnh viễn)

**Đính chính đáp án** (`KeyCorrection`):
Việc Người ra đề sửa Đáp án đúng của một câu trong Bộ đề đã Phát hành sau khi phát hiện nhập sai. Câu đó được chấm lại tự động cho mọi Người dự thi.
_Avoid_: sửa đề, cập nhật đáp án

**Công bố kết quả** (`Release`):
Hành động của Người ra đề cho phép Người dự thi xem Kết quả. Người dự thi thấy điểm từng câu và biết câu nào chưa đúng hoàn toàn, nhưng không bao giờ thấy Đáp án đúng, cũng không biết Phương án hay Mệnh đề nào sai.
_Avoid_: xuất điểm

**Phúc khảo** (`Appeal`):
Yêu cầu của Người dự thi, có kèm lý do, đề nghị Người ra đề xem xét lại điểm một Câu trả lời hoặc Mức xử lý. Mỗi đối tượng chỉ được Phúc khảo một lần, và điểm sau khi xem xét lại có thể tăng hoặc giảm.
_Avoid_: khiếu nại, regrade

**Thời hạn phúc khảo** (`AppealPeriod`):
Khoảng thời gian sau khi Công bố kết quả mà Người dự thi được gửi Phúc khảo. Hết thời hạn này thì Kết quả được Chốt.
_Avoid_: hạn khiếu nại

**Chốt kết quả** (`Finalize`):
Trạng thái Kết quả không còn thay đổi được, sau khi hết Thời hạn phúc khảo và mọi Phúc khảo đã được xử lý.
_Avoid_: khóa điểm
