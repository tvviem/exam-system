import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

/** Ảnh có đường chéo và vùng màu để mã hóa lại có thay đổi đo được; `seed` làm hai ảnh khác nhau. */
function gradient(width: number, height: number, seed = 0): Buffer {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      data[i] = (x * 255) / width;
      data[i + 1] = (y * 255) / height;
      data[i + 2] = (x + y + seed * 37) % 256;
    }
  }
  return data;
}

const raw = (width: number, height: number, seed?: number) =>
  sharp(gradient(width, height, seed), { raw: { width, height, channels: 3 } });

export const jpeg = (width = 2000, height = 1500, seed?: number) =>
  raw(width, height, seed).jpeg({ quality: 95 }).toBuffer();

export const png = (width = 300, height = 200, seed?: number) =>
  raw(width, height, seed).png().toBuffer();

export const webp = (width = 300, height = 200) => raw(width, height).webp().toBuffer();

/** JPEG chụp xoay (Orientation 6) kèm EXIF bản quyền: sau xử lý phải đứng thẳng và không còn EXIF. */
export const jpegWithExif = (width = 600, height = 400) =>
  raw(width, height)
    .jpeg()
    .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'bí mật' } } })
    .toBuffer();

/** PNG toàn nhiễu: nén không ăn nhiều, dùng để thử hạn mức dung lượng. */
export const noisePng = (width = 200, height = 200) =>
  sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();

export const gif = () => Buffer.from('R0lGODlhAQABAAAAACw=', 'base64');
export const svg = () =>
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
/** Đầu file JPEG thật nhưng thân là rác: qua được kiểm magic bytes, hỏng khi giải mã. */
export const brokenJpeg = () =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(2_000)]);
