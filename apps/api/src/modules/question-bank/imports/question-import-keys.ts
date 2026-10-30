/** Khóa file Excel đang chờ đọc của một lô nhập trong MediaStore; xóa ngay sau khi đọc xong (Q146). */
export const importUploadKeyOf = (batchId: string) => `uploads/question-imports/${batchId}`;
