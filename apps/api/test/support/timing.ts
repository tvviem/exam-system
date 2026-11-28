/** Trung vị của vài lần đo, để một lần máy khựng không quyết định kết quả của bài đo thời gian. */
export const median = (values: number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number;
