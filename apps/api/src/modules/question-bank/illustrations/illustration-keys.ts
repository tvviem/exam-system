// Khóa MediaStore của Hình minh họa: file tải lên tạm và các biến thể WebP.
export const uploadKeyOf = (id: string) => `tmp/illustrations/${id}`;
export const variantKeyOf = (id: string, side: number) => `illustrations/${id}/${side}.webp`;
