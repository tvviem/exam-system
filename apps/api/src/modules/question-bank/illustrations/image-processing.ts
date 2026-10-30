import { ILLUSTRATION_VARIANT_SIDES as VARIANT_SIDES } from '@exam/shared';
import sharp from 'sharp';

// Xử lý ảnh tải lên cho Hình minh họa (Q140): chỉ giữ các biến thể WebP đã bỏ EXIF, không giữ bản gốc.

export const MAX_ILLUSTRATION_UPLOAD_BYTES = 5 * 1024 * 1024;
export { VARIANT_SIDES };
export const MAX_IMAGE_SIDE = 8_000;

// Ảnh 8.000 x 8.000 px giải mã tốn cỡ 256 MB: không giữ bộ nhớ đệm giữa các ảnh để worker không phình dần.
sharp.cache(false);

type ImageType = 'jpeg' | 'png' | 'webp';

/** Nhận dạng bằng magic bytes, không tin đuôi file hay MIME của client. SVG và GIF không được nhận. */
export function sniffImage(data: Buffer): ImageType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'png';
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** Lý do ảnh `failed`; `error` là lỗi bất ngờ khi xử lý (ghi đĩa, hết bộ nhớ), tải lại ảnh sẽ xử lý lại. */
export type ImageFailureReason = 'dimensions_too_large' | 'corrupt' | 'error';

export class ImageProcessingError extends Error {
  constructor(readonly reason: ImageFailureReason) {
    super(reason);
  }
}

export interface ImageVariant {
  side: number;
  width: number;
  height: number;
  data: Buffer;
}

/** Cạnh dài của các biến thể cho ảnh có cạnh dài `longSide`: không phóng to, cỡ cuối là chính ảnh (tối đa 1600). */
export function variantSidesFor(longSide: number): number[] {
  const last = Math.min(longSide, VARIANT_SIDES[VARIANT_SIDES.length - 1] as number);
  return [...VARIANT_SIDES.filter((side) => side < last), last];
}

/**
 * Xoay đúng chiều, bỏ EXIF, mã hóa lại thành WebP. PNG (sơ đồ, ảnh chụp màn hình có chữ) nén không mất dữ liệu
 * để chữ không mờ; JPEG và WebP nén chất lượng 80.
 */
export async function makeVariants(input: Buffer): Promise<ImageVariant[]> {
  const type = sniffImage(input);
  if (!type) throw new ImageProcessingError('corrupt');
  const encoder = type === 'png' ? { lossless: true } : { quality: 80 };
  try {
    const source = sharp(input, {
      limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE,
      sequentialRead: true,
    });
    const meta = await source.metadata();
    const swap = (meta.orientation ?? 1) >= 5;
    const width = (swap ? meta.height : meta.width) ?? 0;
    const height = (swap ? meta.width : meta.height) ?? 0;
    if (!width || !height) throw new ImageProcessingError('corrupt');
    if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
      throw new ImageProcessingError('dimensions_too_large');
    }
    const oriented = source.rotate();
    const variants: ImageVariant[] = [];
    for (const side of variantSidesFor(Math.max(width, height))) {
      const { data, info } = await oriented
        .clone()
        .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
        .webp(encoder)
        .toBuffer({ resolveWithObject: true });
      variants.push({ side, width: info.width, height: info.height, data });
    }
    return variants;
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error;
    throw new ImageProcessingError(
      /pixel limit/i.test(String(error)) ? 'dimensions_too_large' : 'corrupt',
    );
  }
}
