import { QUESTION_TYPES, type QuestionType } from '@exam/shared';
import type { Element } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import { readDocx } from './docx-reader.test-support';
import { buildPaperDocument, type PaperItem, type PaperSpec } from './paper-document';

const baseSpec: PaperSpec = {
  school: 'Trường Đại học Bạc Liêu',
  unit: 'Khoa Kỹ thuật và Công nghệ',
  examCode: '132',
  heading: {
    title: 'THI KẾT THÚC HỌC PHẦN',
    examName: 'Bộ đề cuối kỳ K17',
    course: 'Nguyên lý XD PM',
    date: '27/05/2026',
    form: 'Trắc nghiệm',
    duration: '60 phút',
  },
  sections: [],
};

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const richText = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const singleChoice = (stem: string, options: string[]): PaperItem => ({
  type: 'single_choice',
  stem: richText(stem),
  payload: { options: options.map((o, i) => ({ id: `o${i + 1}`, content: richText(o) })) },
});

describe('buildPaperDocument: Mẫu Trường', () => {
  it('có đầu trang tên trường (nghiêng, canh phải) và chân trang Đơn vị với "Trang X/Y - Mã đề thi N"', async () => {
    const { bytes } = await buildPaperDocument(baseSpec);
    const docx = await readDocx(bytes);

    const header = await docx.part('word/header1.xml');
    expect(header.text()).toBe('Trường Đại học Bạc Liêu');
    expect(header.attr(header.all('jc')[0] as Element, 'val')).toBe('right');
    expect(header.all('i')).not.toHaveLength(0);

    const footer = await docx.part('word/footer1.xml');
    expect(footer.text()).toContain('Khoa Kỹ thuật và Công nghệ');
    expect(footer.text()).toContain('Mã đề thi 132');
    // Số trang là trường tự cập nhật của Word, không phải chữ cố định.
    expect(footer.xml).toMatch(/PAGE/);
    expect(footer.xml).toMatch(/NUMPAGES/);
  });

  it('khổ A4 dọc, lề trái khoảng 9 mm, lề phải khoảng 8 mm như đề mẫu (mục 3.2)', async () => {
    const { bytes } = await buildPaperDocument(baseSpec);
    const doc = await (await readDocx(bytes)).part('word/document.xml');

    const pgSz = doc.all('pgSz')[0] as Element;
    const pgMar = doc.all('pgMar')[0] as Element;
    const mm = (twips: string | null) => (Number(twips) * 25.4) / 1440;

    expect(mm(doc.attr(pgSz, 'w'))).toBeCloseTo(210, 0);
    expect(mm(doc.attr(pgSz, 'h'))).toBeCloseTo(297, 0);
    expect(mm(doc.attr(pgMar, 'left'))).toBeCloseTo(9, 0);
    expect(mm(doc.attr(pgMar, 'right'))).toBeCloseTo(8, 0);
  });

  it('mỗi câu chọn một in "Câu N:" và nhãn "A." đậm màu xanh #0000FF, nội dung câu và Phương án theo thứ tự gốc', async () => {
    const { bytes } = await buildPaperDocument({
      ...baseSpec,
      sections: [
        {
          title: null,
          items: [
            singleChoice('Thủ đô của Việt Nam là gì?', ['Hà Nội', 'Huế', 'Cần Thơ', 'Bạc Liêu']),
            singleChoice('Một cộng một bằng mấy?', ['1', '2', '3', '4']),
          ],
        },
      ],
    });
    const doc = await (await readDocx(bytes)).part('word/document.xml');

    const text = doc.text();
    expect(text.indexOf('Câu 1:')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Câu 1:')).toBeLessThan(text.indexOf('Thủ đô của Việt Nam là gì?'));
    expect(text.indexOf('Thủ đô của Việt Nam là gì?')).toBeLessThan(text.indexOf('A.'));
    expect(text.indexOf('Bạc Liêu')).toBeLessThan(text.indexOf('Câu 2:'));

    // Nhãn "Câu N:" và "A." dùng kiểu ký tự "Nhãn câu" (đậm, xanh #0000FF), không định dạng tay (dễ sửa một chỗ).
    const styles = await (await readDocx(bytes)).part('word/styles.xml');
    const names = styles.styleNames();
    const labelStyle = styles
      .all('style')
      .find(
        (style) =>
          styles.attr(style, 'styleId') &&
          names.get(styles.attr(style, 'styleId') ?? '') === 'Nhãn câu',
      );
    expect(labelStyle).toBeDefined();
    expect(labelStyle?.getElementsByTagNameNS(W_NS, 'b')).toHaveLength(1);
    expect(
      styles
        .attr(labelStyle?.getElementsByTagNameNS(W_NS, 'color')[0] as Element, 'val')
        ?.toUpperCase(),
    ).toBe('0000FF');

    const labelId = styles.attr(labelStyle as Element, 'styleId');
    const labelled = doc
      .all('r')
      .filter((run) => {
        const ref = run.getElementsByTagNameNS(W_NS, 'rStyle')[0];
        return ref !== undefined && doc.attr(ref, 'val') === labelId;
      })
      .map((run) => run.textContent);
    expect(labelled).toEqual(expect.arrayContaining(['Câu 1:', 'A.', 'B.', 'C.', 'D.', 'Câu 2:']));
  });

  it('bốn Phương án ngắn cùng một đoạn, vừa thì hai đoạn hai cột, dài thì mỗi Phương án một đoạn (Q413)', async () => {
    const long = 'Thuật toán sắp xếp nổi bọt chạy trong thời gian bậc hai';
    const medium = 'Thuật toán sắp xếp nổi bọt chạy trong thời';
    const { bytes } = await buildPaperDocument({
      ...baseSpec,
      sections: [
        {
          title: null,
          items: [
            singleChoice('Câu ngắn', ['1', '2', '3', '4']),
            singleChoice('Câu vừa', [medium, '2', '3', '4']),
            singleChoice('Câu dài', [long, '2', '3', '4']),
          ],
        },
      ],
    });
    const paragraphs = (await (await readDocx(bytes)).part('word/document.xml'))
      .paragraphs()
      .filter((p) => /^[A-D]\./.test(p));

    // một hàng: một đoạn chứa A. B. C. D.; hai cột: hai đoạn (A. B.) và (C. D.); mỗi dòng: bốn đoạn
    expect(paragraphs.map((p) => p.match(/[A-D]\./g)?.join(''))).toEqual([
      'A.B.C.D.',
      'A.B.',
      'C.D.',
      'A.',
      'B.',
      'C.',
      'D.',
    ]);
  });

  it('trang đầu có khung thông tin kỳ thi, ô thí sinh, điểm, chữ ký coi thi và kết thúc bằng "HẾT"', async () => {
    const { bytes } = await buildPaperDocument({
      ...baseSpec,
      sections: [{ title: null, items: [singleChoice('Câu hỏi', ['1', '2', '3', '4'])] }],
    });
    const doc = await (await readDocx(bytes)).part('word/document.xml');

    // Khung là bảng Word thật (không dùng hộp văn bản, để Người ra đề dễ sửa).
    const cover = doc.all('tbl')[0] as Element;
    expect(doc.xml).not.toMatch(/txbxContent/);
    const cells = Array.from(cover.getElementsByTagNameNS(W_NS, 'tc')).map((tc) =>
      Array.from(tc.getElementsByTagNameNS(W_NS, 't'))
        .map((t) => t.textContent)
        .join(''),
    );
    const table = cells.join('|');
    for (const expected of [
      'THI KẾT THÚC HỌC PHẦN',
      'Học phần: Nguyên lý XD PM',
      'Ngày thi: 27/05/2026',
      'Hình thức thi: Trắc nghiệm',
      'Thời gian: 60 phút',
      'Bộ đề cuối kỳ K17',
      'Mã SV',
      'Họ và tên',
      'Lớp',
      'Mã đề: 132',
      'Điểm số',
      'Điểm chữ',
      'Cán bộ coi thi 1',
      'Cán bộ coi thi 2',
    ]) {
      expect(table).toContain(expected);
    }

    const paragraphs = doc.paragraphs();
    expect(paragraphs.at(-1)).toBe('----------- HẾT ----------');
    const endRun = doc.all('r').find((r) => r.textContent === '----------- HẾT ----------');
    expect(endRun?.getElementsByTagNameNS(W_NS, 'b')).toHaveLength(1); // in đậm như đề mẫu
    // khung nằm trước câu hỏi đầu tiên
    expect(doc.text().indexOf('THI KẾT THÚC HỌC PHẦN')).toBeLessThan(doc.text().indexOf('Câu 1:'));
  });

  it('lưới phiếu trả lời 17 cột: mỗi số câu một ô, bên dưới một ô trống, hết hàng thì xuống hàng; chỉ đếm câu chọn một (không đếm chọn nhiều, tự luận)', async () => {
    const items: PaperItem[] = [
      ...Array.from({ length: 20 }, (_, i) =>
        singleChoice(`Câu số ${i + 1}`, ['1', '2', '3', '4']),
      ),
      { type: 'essay', stem: richText('Trình bày'), payload: { maxLength: 100 } },
      {
        type: 'multiple_choice',
        stem: richText('Chọn nhiều'),
        payload: { options: [{ id: 'o1', content: richText('x') }] },
      },
    ];
    const { bytes } = await buildPaperDocument({ ...baseSpec, sections: [{ title: null, items }] });
    const doc = await (await readDocx(bytes)).part('word/document.xml');

    expect(doc.paragraphs()).toContain('PHẦN BÀI LÀM 20 CÂU TRẮC NGHIỆM');
    const grid = doc.all('tbl')[1] as Element;
    const rows = Array.from(grid.getElementsByTagNameNS(W_NS, 'tr')).map((tr) =>
      Array.from(tr.getElementsByTagNameNS(W_NS, 'tc')).map((tc) => tc.textContent ?? ''),
    );
    const blank = Array<string>(17).fill('');
    expect(rows).toEqual([
      Array.from({ length: 17 }, (_, i) => String(i + 1)),
      blank,
      [...['18', '19', '20'], ...Array<string>(14).fill('')],
      blank,
    ]);
  });

  it('bộ cài sẵn "Gọn" bỏ ô thí sinh, điểm, chữ ký coi thi và lưới trả lời nhưng giữ thông tin kỳ thi, đầu và chân trang, "HẾT"', async () => {
    const { bytes } = await buildPaperDocument({
      ...baseSpec,
      preset: 'compact',
      sections: [{ title: null, items: [singleChoice('Câu hỏi', ['1', '2', '3', '4'])] }],
    });
    const docx = await readDocx(bytes);
    const text = (await docx.part('word/document.xml')).text();

    for (const gone of [
      'Mã SV',
      'Họ và tên',
      'Điểm số',
      'Điểm chữ',
      'Cán bộ coi thi',
      'PHẦN BÀI LÀM',
    ]) {
      expect(text).not.toContain(gone);
    }
    for (const kept of [
      'THI KẾT THÚC HỌC PHẦN',
      'Học phần: Nguyên lý XD PM',
      'Thời gian: 60 phút',
      'HẾT',
    ]) {
      expect(text).toContain(kept);
    }
    expect((await docx.part('word/header1.xml')).text()).toBe('Trường Đại học Bạc Liêu');
    expect((await docx.part('word/footer1.xml')).text()).toContain('Mã đề thi 132');
  });

  it('Quốc hiệu và Tiêu ngữ mặc định tắt, bật bằng công tắc và nằm trước khung thông tin; mỗi công tắc độc lập với bộ cài sẵn (Q411, Q412)', async () => {
    const section = { title: null, items: [singleChoice('Câu hỏi', ['1', '2', '3', '4'])] };
    const textOf = async (spec: Partial<PaperSpec>) =>
      (
        await (
          await readDocx(
            (
              await buildPaperDocument({ ...baseSpec, sections: [section], ...spec })
            ).bytes,
          )
        ).part('word/document.xml')
      ).paragraphs();

    const byDefault = (await textOf({})).join('\n');
    expect(byDefault).not.toContain('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM');

    const withNational = await textOf({ blocks: { nationalHeader: true } });
    expect(withNational.slice(0, 2)).toEqual([
      'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
      'Độc lập - Tự do - Hạnh phúc',
    ]);

    // bộ "Gọn" cộng riêng một công tắc: bật lại lưới, các khối khác vẫn theo "Gọn"
    const compactWithGrid = (await textOf({ preset: 'compact', blocks: { grid: true } })).join(
      '\n',
    );
    expect(compactWithGrid).toContain('PHẦN BÀI LÀM 1 CÂU TRẮC NGHIỆM');
    expect(compactWithGrid).not.toContain('Mã SV');
  });

  describe('bảng đăng ký Loại câu hỏi', () => {
    const opt = (text: string, i: number) => ({ id: `o${i}`, content: richText(text) });
    const SAMPLE: Record<QuestionType, PaperItem> = {
      single_choice: singleChoice('Nội dung chọn một', ['1', '2', '3', '4']),
      multiple_choice: {
        type: 'multiple_choice',
        stem: richText('Nội dung chọn nhiều'),
        payload: { options: ['x', 'y', 'z', 'w'].map(opt) },
      },
      true_false_cluster: {
        type: 'true_false_cluster',
        stem: richText('Nội dung chùm đúng sai'),
        payload: {
          statements: [
            { id: 's1', content: richText('Mệnh đề thứ nhất') },
            { id: 's2', content: richText('Mệnh đề thứ hai') },
          ],
        },
      },
      essay: { type: 'essay', stem: richText('Nội dung tự luận'), payload: { maxLength: 100 } },
    };

    it.each(QUESTION_TYPES)('mọi Loại có bộ trình bày, không cảnh báo: %s', async (type) => {
      const { bytes, warnings } = await buildPaperDocument({
        ...baseSpec,
        sections: [{ title: null, items: [SAMPLE[type]] }],
      });
      const doc = await (await readDocx(bytes)).part('word/document.xml');
      expect(warnings).toEqual([]);
      expect(doc.text()).toContain('Câu 1:');
      expect(doc.text()).toContain('Nội dung');
    });

    it('chùm đúng/sai in từng Mệnh đề thành dòng a), b); chọn nhiều in đủ Phương án', async () => {
      const { bytes } = await buildPaperDocument({
        ...baseSpec,
        sections: [{ title: null, items: [SAMPLE.true_false_cluster, SAMPLE.multiple_choice] }],
      });
      const paragraphs = (await (await readDocx(bytes)).part('word/document.xml')).paragraphs();
      expect(paragraphs).toContain('a) Mệnh đề thứ nhất');
      expect(paragraphs).toContain('b) Mệnh đề thứ hai');
      expect(paragraphs.join('\n')).toMatch(/A\. x.*B\. y.*C\. z.*D\. w/s);
    });

    it('Loại chưa hỗ trợ: tệp vẫn dựng được, ghi một dòng cảnh báo tại chỗ và trả cảnh báo', async () => {
      const future = {
        type: 'matching',
        stem: richText('Nối cột'),
        payload: {},
      } as unknown as PaperItem;
      const { bytes, warnings } = await buildPaperDocument({
        ...baseSpec,
        sections: [{ title: null, items: [singleChoice('Một', ['1', '2', '3', '4']), future] }],
      });
      const paragraphs = (await (await readDocx(bytes)).part('word/document.xml')).paragraphs();
      expect(paragraphs).toContain('Câu 2: Loại matching chưa hỗ trợ xuất');
      expect(warnings).toEqual(['Câu 2: Loại matching chưa hỗ trợ xuất']);
    });
  });

  it('chuỗi có ký tự XML (< > & ") trong thông tin và nội dung được thoát đúng; tệp vẫn mở được và chữ giữ nguyên', async () => {
    const hostile = `</w:t><w:p>X</w:p> & "Tom" <b>`;
    const { bytes } = await buildPaperDocument({
      ...baseSpec,
      school: hostile,
      unit: hostile,
      examCode: hostile,
      heading: { ...baseSpec.heading, course: hostile, examName: hostile },
      sections: [{ title: null, items: [singleChoice(hostile, [hostile, '2', '3', '4'])] }],
    });
    const docx = await readDocx(bytes);

    // bộ đọc ném lỗi nếu XML sai cấu trúc; chữ đọc lại phải y nguyên chuỗi gốc
    expect((await docx.part('word/header1.xml')).text()).toBe(hostile);
    expect((await docx.part('word/footer1.xml')).text()).toContain(hostile);
    const doc = await docx.part('word/document.xml');
    expect(doc.text()).toContain(`Học phần: ${hostile}`);
    expect(doc.text()).toContain(`Câu 1: ${hostile}`);
    expect(doc.paragraphs().filter((p) => p === 'X')).toEqual([]); // không chèn được đoạn mới
  });

  it('dùng kiểu có tên của Word (Tiêu đề đề thi, Câu hỏi, Phương án, Ghi chú, Chữ ký) thay cho định dạng tay, để đổi phông ở một kiểu là cả tệp đổi (Q407, mục 14)', async () => {
    const { bytes } = await buildPaperDocument({
      ...baseSpec,
      sections: [{ title: null, items: [singleChoice('Nội dung câu', ['1', '2', '3', '4'])] }],
    });
    const docx = await readDocx(bytes);
    const stylesPart = await docx.part('word/styles.xml');
    const styles = stylesPart.styleNames();
    // phông và cỡ chữ mặc định theo đề mẫu: Times New Roman 12 pt (w:sz tính theo nửa điểm)
    expect(stylesPart.attr(stylesPart.all('rFonts')[0] as Element, 'ascii')).toBe(
      'Times New Roman',
    );
    expect(stylesPart.attr(stylesPart.all('sz')[0] as Element, 'val')).toBe('24');
    expect([...styles.values()]).toEqual(
      expect.arrayContaining([
        'Normal',
        'Tiêu đề đề thi',
        'Câu hỏi',
        'Phương án',
        'Ghi chú',
        'Chữ ký',
        'Nhãn câu',
      ]),
    );

    const doc = await docx.part('word/document.xml');
    const styleOfParagraph = (text: string) => {
      const p = doc.all('p').find((p) => (p.textContent ?? '').startsWith(text));
      const ref = p?.getElementsByTagNameNS(W_NS, 'pStyle')[0];
      return ref ? styles.get(doc.attr(ref, 'val') ?? '') : undefined;
    };
    expect(styleOfParagraph('THI KẾT THÚC HỌC PHẦN')).toBe('Tiêu đề đề thi');
    expect(styleOfParagraph('Câu 1:')).toBe('Câu hỏi');
    expect(styleOfParagraph('A. 1')).toBe('Phương án');
    expect(styleOfParagraph('*Chọn phương án')).toBe('Ghi chú');
    expect(styleOfParagraph('Cán bộ coi thi 1')).toBe('Chữ ký');
  });

  it('văn bản có định dạng: đậm, nghiêng, gạch chân, chỉ số trên và dưới, xuống dòng, danh sách; nhiều đoạn trong câu', async () => {
    const text = (value: string, ...marks: string[]) => ({
      type: 'text',
      text: value,
      marks: marks.map((type) => ({ type })),
    });
    const stem = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            text('đậm', 'bold'),
            text(' nghiêng', 'italic'),
            text(' gạch', 'underline'),
            text('2', 'superscript'),
            text('i', 'subscript'),
            { type: 'hardBreak' },
            text('sau dòng'),
          ],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [text('ý một')] }] },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [text('ý ba')] }] },
          ],
        },
        { type: 'paragraph', content: [text('đoạn cuối')] },
      ],
    };
    const item: PaperItem = { type: 'essay', stem, payload: {} };
    const { bytes, warnings } = await buildPaperDocument({
      ...baseSpec,
      sections: [{ title: null, items: [item] }],
    });
    const doc = await (await readDocx(bytes)).part('word/document.xml');

    const runOf = (value: string) => doc.all('r').find((r) => r.textContent === value) as Element;
    const has = (r: Element, tag: string) => r.getElementsByTagNameNS(W_NS, tag).length > 0;
    expect(has(runOf('đậm'), 'b')).toBe(true);
    expect(has(runOf(' nghiêng'), 'i')).toBe(true);
    expect(has(runOf(' gạch'), 'u')).toBe(true);
    const vertical = (value: string) =>
      doc.attr(runOf(value).getElementsByTagNameNS(W_NS, 'vertAlign')[0] as Element, 'val');
    expect(vertical('2')).toBe('superscript');
    expect(vertical('i')).toBe('subscript');
    expect(doc.all('br')).toHaveLength(1);

    const paragraphs = doc.paragraphs();
    expect(paragraphs).toContain('• ý một');
    expect(paragraphs).toContain('3. ý ba');
    expect(paragraphs.at(-2)).toBe('đoạn cuối');
    expect(warnings).toEqual([]);
  });

  it('công thức và hình chưa xuất được (làm ở PR X2): giữ chỗ nhìn thấy trong tệp và có cảnh báo theo câu, mỗi loại một lần', async () => {
    const math = (latex: string) => ({ type: 'math', attrs: { latex, display: false } });
    const stem = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Tính ' }, math('\\frac{1}{2}'), math('x^2')],
        },
        {
          type: 'image',
          attrs: { illustrationId: '00000000-0000-4000-8000-000000000001', alt: 'Đồ thị hàm số' },
        },
      ],
    };
    const { bytes, warnings } = await buildPaperDocument({
      ...baseSpec,
      sections: [
        {
          title: null,
          items: [
            singleChoice('Không có gì đặc biệt', ['1', '2', '3', '4']),
            { type: 'essay', stem, payload: {} },
          ],
        },
      ],
    });
    const paragraphs = (await (await readDocx(bytes)).part('word/document.xml')).paragraphs();

    expect(paragraphs).toContain('Câu 2: Tính [công thức: \\frac{1}{2}][công thức: x^2]');
    expect(paragraphs).toContain('[Hình minh họa: Đồ thị hàm số]');
    expect(warnings).toEqual([
      'Câu 2: công thức chưa hỗ trợ xuất, đã in mã LaTeX',
      'Câu 2: hình minh họa chưa hỗ trợ xuất',
    ]);
  });

  it('Phần có tiêu đề (kiểu "Tiêu đề Phần") và hướng dẫn (kiểu "Ghi chú") đứng trước các câu của Phần; số câu liên tục qua các Phần; Phần không tiêu đề không in gì thêm', async () => {
    const { bytes } = await buildPaperDocument({
      ...baseSpec,
      sections: [
        {
          title: 'PHẦN I. TRẮC NGHIỆM',
          instructions: richText('Chọn một phương án đúng.'),
          items: [singleChoice('Câu của phần một', ['1', '2', '3', '4'])],
        },
        { title: null, items: [singleChoice('Câu của phần hai', ['1', '2', '3', '4'])] },
      ],
    });
    const docx = await readDocx(bytes);
    const doc = await docx.part('word/document.xml');
    const styles = (await docx.part('word/styles.xml')).styleNames();
    const paragraphs = doc.paragraphs();

    const at = (text: string) => paragraphs.findIndex((p) => p.startsWith(text));
    expect(at('PHẦN I. TRẮC NGHIỆM')).toBeGreaterThan(-1);
    expect(at('PHẦN I. TRẮC NGHIỆM')).toBeLessThan(at('Chọn một phương án đúng.'));
    expect(at('Chọn một phương án đúng.')).toBeLessThan(at('Câu 1:'));
    expect(at('Câu 1:')).toBeLessThan(at('Câu 2:'));

    const styleOf = (text: string) => {
      const p = doc.all('p').find((p) => (p.textContent ?? '').startsWith(text));
      const ref = p?.getElementsByTagNameNS(W_NS, 'pStyle')[0];
      return ref ? styles.get(doc.attr(ref, 'val') ?? '') : undefined;
    };
    expect(styleOf('PHẦN I. TRẮC NGHIỆM')).toBe('Tiêu đề Phần');
    expect(styleOf('Chọn một phương án đúng.')).toBe('Ghi chú');
    // Phần không tiêu đề: giữa câu 1 và câu 2 chỉ có các đoạn Phương án
    const between = paragraphs.slice(at('Câu 1:') + 1, at('Câu 2:'));
    expect(between.every((p) => /^[A-D]\./.test(p))).toBe(true);
  });
});
