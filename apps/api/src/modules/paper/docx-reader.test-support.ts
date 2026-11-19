import { DOMParser, type Document, type Element } from '@xmldom/xmldom';
import JSZip from 'jszip';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

export interface DocxPart {
  /** Mọi phần tử cùng tên (không kể tiền tố), theo thứ tự trong tệp. */
  all(localName: string): Element[];
  /** Mọi phần tử OMML (`m:`) cùng tên, theo thứ tự trong tệp. */
  allMath(localName: string): Element[];
  /** Giá trị thuộc tính `m:<name>` của một phần tử OMML. */
  mathAttr(element: Element, name: string): string | null;
  /** Giá trị thuộc tính `w:<name>` của một phần tử. */
  attr(element: Element, name: string): string | null;
  /** Chữ liền mạch của cả phần (nối các `w:t`). */
  text(): string;
  /** Chữ của từng đoạn (`w:p`), theo thứ tự; `w:tab` thành "\t". */
  paragraphs(): string[];
  /** Tên hiển thị (`w:name`) của kiểu theo mã (`w:styleId`), chỉ có ở `word/styles.xml`. */
  styleNames(): Map<string, string>;
  xml: string;
}

function parse(xml: string): Document {
  return new DOMParser({
    onError: (level, message) => {
      throw new Error(`XML không hợp lệ (${level}): ${message}`);
    },
  }).parseFromString(xml, 'text/xml');
}

function wrap(xml: string): DocxPart {
  const doc = parse(xml);
  const all = (name: string) => Array.from(doc.getElementsByTagNameNS(W_NS, name));
  return {
    xml,
    all,
    attr: (element, name) => element.getAttributeNS(W_NS, name),
    allMath: (name) => Array.from(doc.getElementsByTagNameNS(M_NS, name)),
    mathAttr: (element, name) => element.getAttributeNS(M_NS, name),
    text: () =>
      all('t')
        .map((t) => t.textContent ?? '')
        .join(''),
    styleNames: () =>
      new Map(
        all('style').map((style) => [
          doc.documentElement ? (style.getAttributeNS(W_NS, 'styleId') ?? '') : '',
          style.getElementsByTagNameNS(W_NS, 'name')[0]?.getAttributeNS(W_NS, 'val') ?? '',
        ]),
      ),
    paragraphs: () =>
      all('p').map((p) =>
        Array.from(p.getElementsByTagNameNS(W_NS, '*'))
          // `w:tab` trong `w:tabs` (vị trí dừng) không phải ký tự tab; chỉ tính `w:tab` nằm trong lượt chữ.
          .filter(
            (node) =>
              node.localName === 't' ||
              (node.localName === 'tab' && node.parentNode?.localName === 'r'),
          )
          .map((node) => (node.localName === 'tab' ? '\t' : (node.textContent ?? '')))
          .join(''),
      ),
  };
}

/** Bộ đọc .docx độc lập với bộ dựng: mở zip, đọc từng phần như một trình đọc Word sẽ làm. */
export async function readDocx(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const part = async (name: string): Promise<DocxPart> => {
    const file = zip.file(name);
    if (!file)
      throw new Error(`Thiếu phần ${name} trong .docx (có: ${Object.keys(zip.files).join(', ')})`);
    return wrap(await file.async('string'));
  };
  const binary = async (name: string): Promise<Uint8Array> => {
    const file = zip.file(name);
    if (!file) throw new Error(`Thiếu phần ${name} trong .docx`);
    return file.async('uint8array');
  };
  return { files: Object.keys(zip.files), part, binary };
}
