#!/bin/sh
# Kiểm thử hook pre-commit (Biome) bằng chỉ mục git tạm: không đụng vùng chuẩn bị thật, không tạo commit.
# Chạy: sh .githooks/pre-commit.test.sh   (thoát 0 nếu đạt hết)
cd "$(git rev-parse --show-toplevel)" || exit 2
HOOK=.githooks/pre-commit
FAILED=0
PASSED=0
TMP_INDEX=$(mktemp)
BAD=apps/api/src/zz-hook-thu-canh-bao.ts   # có cảnh báo (toán tử phẩy)
BADFMT=apps/api/src/zz-hook-thu-dinh-dang.ts # sai định dạng (lỗi)
GOOD=apps/api/src/zz-hook-thu-sach.ts
cleanup() { rm -f "$TMP_INDEX" "$BAD" "$BADFMT" "$GOOD"; }
trap cleanup EXIT

# chạy hook với chỉ mục tạm chứa HEAD + các tệp đã `git add`
run_hook() {
  GIT_INDEX_FILE=$TMP_INDEX git read-tree HEAD
  for f in "$@"; do GIT_INDEX_FILE=$TMP_INDEX git add -f -- "$f"; done
  GIT_INDEX_FILE=$TMP_INDEX sh "$HOOK" >/dev/null 2>&1
}
expect() { # mô tả, mã mong đợi (0 = cho commit, khác 0 = từ chối), mã nhận được
  if { [ "$2" = 0 ] && [ "$3" = 0 ]; } || { [ "$2" != 0 ] && [ "$3" != 0 ]; }; then
    PASSED=$((PASSED + 1))
  else
    FAILED=$((FAILED + 1)); echo "✗ $1 (mong $2, nhận $3)"
  fi
}

printf 'export const a = 1;\n' >"$GOOD"
printf 'export const x = (1, 2);\n' >"$BAD"
printf 'export const   y   =  1 ;\n' >"$BADFMT"

[ -f "$HOOK" ] || { echo "✗ chưa có $HOOK"; echo "0/6 đạt"; exit 1; }

run_hook "$GOOD";            expect "tệp sạch: cho commit" 0 $?
run_hook "$BAD";             expect "có cảnh báo: từ chối" 1 $?
run_hook "$BADFMT";          expect "sai định dạng: từ chối" 1 $?
run_hook "$GOOD" "$BAD";     expect "một tệp sạch, một tệp có cảnh báo: từ chối" 1 $?
# Chỉ kiểm tệp ĐÃ đưa vào commit: tệp bẩn chưa `git add` không được cản commit của tệp sạch.
run_hook "$GOOD";            expect "tệp bẩn chưa add không cản commit tệp sạch" 0 $?
# Không có tệp nào Biome xử lý (chỉ tài liệu): vẫn cho commit.
printf '# ghi chú\n' >docs/zz-hook-thu.md
run_hook docs/zz-hook-thu.md; rc=$?; rm -f docs/zz-hook-thu.md
expect "chỉ có tệp tài liệu: cho commit" 0 $rc

TOTAL=6
echo "$PASSED/$TOTAL đạt"
[ "$FAILED" = 0 ]
