/** Thoát `\`, `%`, `_` để từ khóa người dùng gõ được so khớp nguyên văn trong `LIKE`. */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
