#!/bin/sh
# PostgreSQL gọi script này (archive_command) cho MỖI đoạn WAL đã đầy: pg-archive-wal.sh %p %f (docs/plan/slice-6.md, Q351).
# Chạy TRONG container PostgreSQL; $STATE_DIR/pg-archive-wal.sh là bản chép của file này, gắn vào container chỉ đọc.
#
# Quy tắc (PostgreSQL chỉ xóa đoạn WAL gốc khi script trả 0, nên "thành công giả" là mất dữ liệu):
#   - Chỉ trả 0 khi file đã nằm đúng chỗ, nén xong, đã ghi xuống đĩa (sync).
#   - Ghi ra file tạm .<tên>.tmp rồi mới đổi tên: người đọc (script đẩy đi) không bao giờ thấy file dở.
#   - Không ghi đè: file đích đã có thì chỉ trả 0 nếu NỘI DUNG GIỐNG HỆT (PostgreSQL thử lại sau sự cố là bình thường),
#     còn khác thì trả 1 và báo lỗi (có gì đó sai nghiêm trọng, đừng che).
#   - Nén gzip mức 1: đoạn WAL luôn dài 16 MB dù ít ghi, nén xuống còn vài chục KB khi máy rảnh.
set -eu
src="$1"
name="$2"
dir=/wal-archive
dst="$dir/$name.gz"
tmp="$dir/.$name.gz.tmp"

if [ -e "$dst" ]; then
  if gzip -dc "$dst" | cmp -s - "$src"; then exit 0; fi
  echo "WAL $name đã có trong $dir nhưng KHÁC nội dung; không ghi đè." >&2
  exit 1
fi

trap 'rm -f "$tmp"' EXIT
gzip -1 -c "$src" >"$tmp"
# Đọc lại bản nén để chắc nó khớp nguồn trước khi coi là xong.
gzip -dc "$tmp" | cmp -s - "$src" || { echo "Bản nén của $name không khớp nguồn." >&2; exit 1; }
chmod 644 "$tmp"
sync "$tmp"
mv "$tmp" "$dst"
sync "$dir"
trap - EXIT
