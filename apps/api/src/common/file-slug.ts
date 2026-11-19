/** Tên tệp tải về từ một tên tiếng Việt: bỏ dấu, chữ thường, gạch nối, tối đa 60 ký tự. */
export const fileSlug = (text: string, fallback: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || fallback;
