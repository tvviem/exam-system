import type { Key, ReactNode } from 'react';

// Danh sách thích ứng (docs/ui-design.md mục 10–11): thẻ dưới 768 px, bảng từ 768 px. Bảng rộng cuộn ngang trong chính nó
// và cột đầu (tên) đứng yên khi cuộn.
// Cột có `from: 'lg'` chỉ hiện từ 1024 px; ở 768–1023 px thông tin đó phải được gộp thành dòng phụ dưới tên (do nơi gọi dựng).

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (item: T) => ReactNode;
  /** Chỉ hiện từ cỡ màn hình này trở lên; mặc định hiện từ 768 px. */
  from?: 'lg';
  className?: string;
}

export function DataList<T>({
  items,
  rowKey,
  columns,
  card,
  selectionHeader,
  selectionCell,
}: {
  items: T[];
  rowKey: (item: T) => Key;
  columns: Column<T>[];
  /** Nội dung thẻ dưới 768 px. */
  card: (item: T) => ReactNode;
  /** Cột chọn dòng (ô tiêu đề cần nhãn ẩn cho trình đọc màn hình). */
  selectionHeader?: ReactNode;
  selectionCell?: (item: T) => ReactNode;
}) {
  const cellClass = (c: Column<T>) =>
    `px-4 py-3 pointer-fine:py-2.5 ${c.from === 'lg' ? 'hidden lg:table-cell' : ''} ${c.className ?? ''}`;
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li key={rowKey(item)}>{card(item)}</li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-fg-muted">
            <tr>
              {selectionCell && <th className="w-12 px-2 py-3">{selectionHeader}</th>}
              {columns.map((c) => (
                <th key={c.key} className={`${cellClass(c)} font-medium`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={rowKey(item)}
                className="group border-b border-border align-top last:border-0 hover:bg-bg"
              >
                {selectionCell && <td className="px-2 py-1">{selectionCell(item)}</td>}
                {columns.map((c, index) => (
                  <td
                    key={c.key}
                    className={`${cellClass(c)} ${index === 0 && !selectionCell ? 'sticky left-0 bg-surface group-hover:bg-bg' : ''}`}
                  >
                    {c.cell(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
