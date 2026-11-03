import { ILLUSTRATION_VARIANT_SIDES, imageNodesOf, mathNodesOf, type RichText } from '@exam/shared';
import type { AttemptView } from '../take';

// Tải trước ảnh và KaTeX của đề lúc còn mạng (Q243): ảnh chỉ tải khi câu hiện ra, nên nếu để vậy thì câu ở sau chưa có
// ảnh trong bộ nhớ đệm khi mất mạng rồi tải lại trang.

/** Mọi nội dung trong đề: lời dẫn, stem, phương án, Mệnh đề. */
function docsOf(view: AttemptView): RichText[] {
  const docs: (RichText | null | undefined)[] = [view.exam.instructions];
  for (const section of view.sections) {
    docs.push(section.instructions);
    for (const item of section.items) {
      docs.push(item.stem);
      for (const option of item.payload.options ?? []) docs.push(option.content);
      for (const statement of item.payload.statements ?? []) docs.push(statement.content);
    }
  }
  return docs.filter((doc): doc is RichText => !!doc);
}

export type Formula = { latex: string; display: boolean };

export function mediaOf(view: AttemptView): { imageIds: string[]; formulas: Formula[] } {
  const docs = docsOf(view);
  const ids = new Set(docs.flatMap((doc) => imageNodesOf(doc).map((node) => node.illustrationId)));
  const formulas = new Map<string, Formula>();
  for (const node of docs.flatMap(mathNodesOf)) formulas.set(`${node.display}:${node.latex}`, node);
  return { imageIds: [...ids], formulas: [...formulas.values()] };
}

const SIZES = '(min-width: 768px) 640px, 100vw'; // giống IllustrationPicture: trình duyệt chọn đúng cỡ như khi hiển thị

/**
 * Tải ảnh (đúng cỡ trình duyệt sẽ chọn) vào bộ nhớ đệm, và đưa công thức của đề cho `warmFormulas` dựng thử: KaTeX
 * chỉ tải file phông khi công thức được vẽ, nên phải vẽ thử thì câu có công thức ở sau mới có phông khi mất mạng.
 * Lỗi thì bỏ qua, ảnh và phông sẽ tải lại khi hiện ra.
 */
export function warmMedia(view: AttemptView, warmFormulas: (formulas: Formula[]) => void) {
  const { imageIds, formulas } = mediaOf(view);
  if (formulas.length > 0) warmFormulas(formulas);
  const source = (id: string, side: number) => `${view.mediaBase}/${id}/${side}`;
  for (const id of imageIds) {
    const image = new Image();
    image.sizes = SIZES;
    image.srcset = ILLUSTRATION_VARIANT_SIDES.map((side) => `${source(id, side)} ${side}w`).join(
      ', ',
    );
    image.src = source(id, 960);
  }
}
