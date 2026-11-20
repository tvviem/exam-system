// Rút câu theo Phần (docs/plan/rut-cau-theo-phan-thiet-ke.md mục 4.3). Hàm thuần: máy chủ dùng để rút lúc bắt đầu Lượt,
// giao diện dùng để hiện "mỗi người nhận bao nhiêu câu".

/**
 * Số câu rút của một Phần có `total` câu theo Tỷ lệ rút `percent` (0 đến 100, tối đa hai chữ số lẻ như cột `numeric(5,2)`):
 * `percent × total / 100` làm tròn **nửa lên**, tối thiểu 1 câu nếu `percent > 0`, tối đa `total`. Tính bằng số nguyên
 * (phần trăm × 100) nên không bị lệch số thực ở các ca đúng một nửa.
 */
export function drawCountOf(percent: number, total: number): number {
  if (total <= 0) return 0;
  const hundredths = Math.round(Math.min(Math.max(percent, 0), 100) * 100);
  if (hundredths === 0) return 0;
  const rounded = Math.floor((hundredths * total + 5000) / 10000);
  return Math.min(total, Math.max(1, rounded));
}

/** Băm chuỗi 53 bit (cyrb53): đủ phân tán cho hạt giống, không cần mật mã học và chạy được cả ở trình duyệt. */
function hash53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Hạt giống rút của một người trong một Phần (Q389 a): băm từ mã Phiên thi, mã người dự thi và mã Phần, **không phải** `seed`
 * của Lượt. Nên cố định cho người đó qua mọi Lượt (không cần bảng lưu riêng) và khác nhau giữa người với người. Số nguyên
 * dưới 2^48, khớp hạt giống 48 bit của `layoutOf`. Ba mã được ghi dạng mảng JSON nên ranh giới giữa chúng luôn được tính.
 */
export function drawSeedOf(sessionId: string, userId: string, sectionId: string): number {
  return hash53(JSON.stringify([sessionId, userId, sectionId])) % 2 ** 48;
}
