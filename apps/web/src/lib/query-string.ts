/** Chuỗi truy vấn `?a=1&b=2` từ các tham số; mảng thành nhiều tham số cùng tên; bỏ qua `undefined` và chuỗi rỗng. */
export const queryString = (
  params: Record<string, string | number | readonly string[] | undefined>,
) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== '') search.append(key, String(item));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};
