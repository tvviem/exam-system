import sharp from 'sharp';

/** Hình do bên gọi cung cấp (đọc từ kho ảnh); biến thể của hệ thống là WebP, còn PNG và JPEG cũng nhận. */
export interface PaperImage {
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
}

interface ReadyImage {
  bytes: Uint8Array;
  extension: 'png' | 'jpeg';
  widthPx: number;
  heightPx: number;
}

/** Hình nội tuyến thành một lượt chữ Word, hoặc không có nếu hình chưa được cung cấp. */
export interface ImageSource {
  drawing(illustrationId: string, alt: string): string | undefined;
}

const EMU_PER_PX = 9525; // 96 dpi
const EMU_PER_MM = 36000;
/** Trần kích thước hình (Q418, điều chỉnh 20/11 sau khi xem bản Word: 120x90 mm quá to): rộng 100 mm, cao 60 mm, giữ tỉ lệ, không phóng to hình nhỏ. */
const MAX_WIDTH_EMU = 100 * EMU_PER_MM;
const MAX_HEIGHT_EMU = 60 * EMU_PER_MM;

const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** Word 2019 không đọc WebP trong .docx: đổi WebP (và định dạng lạ) thành PNG; PNG và JPEG giữ nguyên byte. */
async function toWordFormat(image: PaperImage): Promise<ReadyImage> {
  if (isPng(image.bytes)) return { ...image, extension: 'png' };
  if (isJpeg(image.bytes)) return { ...image, extension: 'jpeg' };
  return {
    ...image,
    extension: 'png',
    bytes: new Uint8Array(await sharp(image.bytes).png().toBuffer()),
  };
}

export interface UsedMedia {
  /** Tên phần trong gói, ví dụ `media/image1.png`. */
  target: string;
  relationshipId: string;
  bytes: Uint8Array;
}

/** Gom các hình đã dùng: mỗi hình một phần media (dùng lại nhiều lần vẫn chỉ một phần). */
export class MediaRegistry implements ImageSource {
  private readonly used = new Map<string, UsedMedia>();
  private drawingCount = 0;

  private constructor(private readonly ready: Map<string, ReadyImage>) {}

  static async from(images: Map<string, PaperImage> | undefined): Promise<MediaRegistry> {
    const ready = new Map<string, ReadyImage>();
    for (const [id, image] of images ?? []) ready.set(id, await toWordFormat(image));
    return new MediaRegistry(ready);
  }

  get media(): UsedMedia[] {
    return [...this.used.values()];
  }

  get extensions(): Set<string> {
    return new Set(this.media.map((m) => m.target.split('.').pop() as string));
  }

  drawing(illustrationId: string, alt: string): string | undefined {
    const image = this.ready.get(illustrationId);
    if (!image) return undefined;
    let media = this.used.get(illustrationId);
    if (!media) {
      const n = this.used.size + 1;
      media = {
        target: `media/image${n}.${image.extension}`,
        relationshipId: `rIdImg${n}`,
        bytes: image.bytes,
      };
      this.used.set(illustrationId, media);
    }
    const scale = Math.min(
      1,
      MAX_WIDTH_EMU / (image.widthPx * EMU_PER_PX),
      MAX_HEIGHT_EMU / (image.heightPx * EMU_PER_PX),
    );
    const cx = Math.round(image.widthPx * EMU_PER_PX * scale);
    const cy = Math.round(image.heightPx * EMU_PER_PX * scale);
    const id = ++this.drawingCount;
    const description = alt
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const name = media.target.split('/').pop();
    return (
      `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
      `<wp:docPr id="${id}" name="Hình ${id}" descr="${description}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>` +
      `<pic:nvPicPr><pic:cNvPr id="0" name="${name}" descr="${description}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${media.relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
    );
  }
}
