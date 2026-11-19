import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { readDocx } from './docx-reader.test-support';
import {
  buildPaperDocument,
  type PaperImage,
  type PaperItem,
  type PaperSpec,
} from './paper-document';

const baseSpec: PaperSpec = {
  school: 'Trường Đại học Bạc Liêu',
  unit: 'Khoa Kỹ thuật và Công nghệ',
  examCode: '132',
  heading: {
    title: 'THI KẾT THÚC HỌC PHẦN',
    examName: 'Bộ đề thử',
    course: 'Vật lý',
    date: '27/05/2026',
    form: 'Trắc nghiệm',
    duration: '60 phút',
  },
  sections: [],
};

const ID_A = '00000000-0000-4000-8000-00000000000a';
const ID_B = '00000000-0000-4000-8000-00000000000b';

const imageStem = (...images: { id: string; alt: string }[]) => ({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Quan sát hình' }] },
    ...images.map((image) => ({
      type: 'image',
      attrs: { illustrationId: image.id, alt: image.alt },
    })),
  ],
});
const essay = (stem: unknown): PaperItem => ({ type: 'essay', stem, payload: {} });

const solid = (width: number, height: number) => ({
  create: { width, height, channels: 3 as const, background: { r: 200, g: 30, b: 30 } },
});
const png = async (width: number, height: number): Promise<PaperImage> => ({
  bytes: new Uint8Array(await sharp(solid(width, height)).png().toBuffer()),
  widthPx: width,
  heightPx: height,
});
const webp = async (width: number, height: number): Promise<PaperImage> => ({
  bytes: new Uint8Array(await sharp(solid(width, height)).webp().toBuffer()),
  widthPx: width,
  heightPx: height,
});

const build = async (images: Record<string, PaperImage>, stem: unknown) => {
  const { bytes, warnings } = await buildPaperDocument({
    ...baseSpec,
    images: new Map(Object.entries(images)),
    sections: [{ title: null, items: [essay(stem)] }],
  });
  const docx = await readDocx(bytes);
  return { docx, warnings, document: await docx.part('word/document.xml') };
};

/** Kích thước (EMU) của các hình nội tuyến, theo thứ tự trong tệp. */
const extents = (xml: string) =>
  [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);

describe('hình minh họa trong .docx', () => {
  it('hình PNG thành hình nội tuyến: byte nguyên vẹn trong phần media, quan hệ đúng, văn bản thay thế vào docPr, không cảnh báo', async () => {
    const image = await png(200, 100);
    const { docx, document, warnings } = await build(
      { [ID_A]: image },
      imageStem({ id: ID_A, alt: 'Đồ thị hàm số' }),
    );

    const embed = document.xml.match(/<a:blip r:embed="([^"]+)"/)?.[1] as string;
    expect(embed).toBeTruthy();
    const rels = (await docx.part('word/_rels/document.xml.rels')).xml;
    const target = rels.match(new RegExp(`Id="${embed}"[^>]*Target="([^"]+)"`))?.[1] as string;
    expect(target).toMatch(/^media\/.+\.png$/);
    expect(await docx.binary(`word/${target}`)).toEqual(image.bytes);

    expect(document.xml).toMatch(/<wp:docPr [^>]*descr="Đồ thị hàm số"/);
    expect(document.xml).not.toContain('[Hình minh họa');
    expect(warnings).toEqual([]);
  });

  it('kích thước theo tỉ lệ: hình nhỏ giữ cỡ gốc (96 dpi), hình rộng bị chặn 120 mm, hình cao bị chặn 90 mm', async () => {
    const { document } = await build(
      { [ID_A]: await png(100, 50), [ID_B]: await png(2000, 1000) },
      imageStem({ id: ID_A, alt: 'nhỏ' }, { id: ID_B, alt: 'rộng' }),
    );
    // 1 px = 9525 EMU (96 dpi); 1 mm = 36000 EMU
    expect(extents(document.xml)).toEqual([
      [100 * 9525, 50 * 9525],
      [120 * 36000, 60 * 36000],
    ]);

    const tall = await build(
      { [ID_A]: await png(1000, 2000) },
      imageStem({ id: ID_A, alt: 'cao' }),
    );
    expect(extents(tall.document.xml)).toEqual([[45 * 36000, 90 * 36000]]);
  });

  it('biến thể WebP của hệ thống đổi thành PNG (Word 2019 không đọc WebP); JPEG giữ nguyên byte; loại nội dung khai báo đủ', async () => {
    const jpeg: PaperImage = {
      bytes: new Uint8Array(await sharp(solid(40, 30)).jpeg().toBuffer()),
      widthPx: 40,
      heightPx: 30,
    };
    const { docx, document } = await build(
      { [ID_A]: await webp(64, 32), [ID_B]: jpeg },
      imageStem({ id: ID_A, alt: 'webp' }, { id: ID_B, alt: 'jpeg' }),
    );

    const rels = (await docx.part('word/_rels/document.xml.rels')).xml;
    const targets = [...rels.matchAll(/Target="(media\/[^"]+)"/g)].map((m) => m[1] as string);
    expect(targets).toEqual(['media/image1.png', 'media/image2.jpeg']);
    const first = await docx.binary(`word/${targets[0]}`);
    expect([...first.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]); // chữ ký PNG
    expect(await docx.binary(`word/${targets[1]}`)).toEqual(jpeg.bytes);

    const types = (await docx.part('[Content_Types].xml')).xml;
    expect(types).toContain('<Default Extension="png" ContentType="image/png"/>');
    expect(types).toContain('<Default Extension="jpeg" ContentType="image/jpeg"/>');
    // kích thước lấy từ cỡ khai báo của hình, không đổi theo định dạng
    expect(extents(document.xml)[0]).toEqual([64 * 9525, 32 * 9525]);
  });

  it('một hình dùng nhiều lần chỉ một phần media; mỗi lần dùng một mã hình riêng; văn bản thay thế có ký tự XML được thoát', async () => {
    const { docx, document } = await build(
      { [ID_A]: await png(50, 50) },
      imageStem({ id: ID_A, alt: 'a "b" <c> & d' }, { id: ID_A, alt: 'lần hai' }),
    );

    const media = docx.files.filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );
    expect(media).toEqual(['word/media/image1.png']);
    const ids = [...document.xml.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['1', '2']);
    expect(document.xml).toContain('descr="a &quot;b&quot; &lt;c&gt; &amp; d"');
  });

  it('hình đứng riêng một đoạn, canh giữa', async () => {
    const { document } = await build(
      { [ID_A]: await png(50, 50) },
      imageStem({ id: ID_A, alt: 'x' }),
    );
    const paragraph = document.xml.match(
      /<w:p>(?:(?!<\/w:p>)[\s\S])*<w:drawing>[\s\S]*?<\/w:p>/,
    )?.[0] as string;
    expect(paragraph).toContain('<w:jc w:val="center"/>');
    expect(paragraph.match(/<w:t[ >]/g)).toBeNull(); // không lẫn chữ
  });

  it('Phương án có hình hoặc công thức riêng dòng: cả câu xếp mỗi Phương án một dòng, nội dung dựng đủ ngay dưới nhãn (Q419)', async () => {
    const paragraph = (value: string) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: value }],
    });
    const item: PaperItem = {
      type: 'single_choice',
      stem: { type: 'doc', content: [paragraph('Chọn hình đúng')] },
      payload: {
        options: [
          { id: 'o1', content: { type: 'doc', content: [paragraph('1')] } },
          {
            id: 'o2',
            content: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'math', attrs: { latex: '\\frac{a}{b}', display: true } }],
                },
              ],
            },
          },
          {
            id: 'o3',
            content: {
              type: 'doc',
              content: [{ type: 'image', attrs: { illustrationId: ID_A, alt: 'hình C' } }],
            },
          },
          { id: 'o4', content: { type: 'doc', content: [paragraph('4')] } },
        ],
      },
    };
    const { bytes, warnings } = await buildPaperDocument({
      ...baseSpec,
      images: new Map([[ID_A, await png(40, 40)]]),
      sections: [{ title: null, items: [item] }],
    });
    const document = await (await readDocx(bytes)).part('word/document.xml');

    // mỗi Phương án một đoạn nhãn (không gộp bốn Phương án vào một hàng)
    expect(document.paragraphs().filter((p) => /^[A-D]\./.test(p))).toEqual([
      'A. 1',
      'B. ',
      'C. ',
      'D. 4',
    ]);
    const order = (needle: string) => document.xml.indexOf(needle);
    expect(order('<m:oMathPara>')).toBeGreaterThan(order('>B.<'));
    expect(order('<m:oMathPara>')).toBeLessThan(order('>C.<'));
    expect(order('<w:drawing>')).toBeGreaterThan(order('>C.<'));
    expect(order('<w:drawing>')).toBeLessThan(order('>D.<'));
    expect(warnings).toEqual([]);
  });
});
