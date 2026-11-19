/**
 * Cổng "file Hình minh họa" (docs/plan/xuat-bo-de-thiet-ke.md mục 6): `paper` cần byte của biến thể ảnh để nhúng vào tệp Word,
 * nhưng không biết kho ảnh của `question-bank`. `question-bank` cài đặt, nối ở `PaperPortsWiringModule`. Cổng không kiểm quyền:
 * người gọi chỉ hỏi các ảnh nằm trong bản chụp của Bộ đề mà mình đã được phép xuất.
 */
export const ILLUSTRATION_FILES = Symbol('ILLUSTRATION_FILES');

export interface IllustrationFiles {
  /** Byte của biến thể cạnh dài `side` px, hoặc `null` nếu không có (ảnh đã xóa hay chưa xử lý xong). */
  variant(illustrationId: string, side: number): Promise<Uint8Array | null>;
}
