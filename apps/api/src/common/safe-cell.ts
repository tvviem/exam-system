/** Ô bắt đầu bằng `= + - @` được thêm dấu nháy để Excel không hiểu thành công thức (Q304). Dùng cho mọi tệp Excel xuất ra. */
export const safeCell = (text: string): string => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text);
