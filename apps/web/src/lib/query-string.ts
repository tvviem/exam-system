/** Chuỗi truy vấn `?a=1&b=2` từ các tham số; bỏ qua giá trị `undefined` và chuỗi rỗng. */
export const queryString = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};
