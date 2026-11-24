import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react';

export interface TabItem {
  id: string;
  label: string;
  /**
   * Số kèm theo nhãn (ví dụ số Vi phạm chưa quyết), hiện thành huy hiệu và chỉ khi lớn hơn 0.
   * `badgeNote` là chữ đi kèm số cho trình đọc màn hình ("chưa quyết"): số không đứng một mình.
   */
  badge?: number;
  badgeNote?: string;
  content: ReactNode;
}

/** Tab theo mẫu WAI-ARIA (mũi tên trái/phải đổi tab). Mọi nội dung đều được dựng, tab không chọn chỉ bị ẩn (trình soạn không bị dựng lại, giữ nguyên nội dung đang gõ). */
export function Tabs({
  items,
  value,
  onChange,
  label,
  split = false,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  /**
   * Khi vùng chứa rộng từ 56 rem (896 px) thì bỏ thanh tab và trải các nội dung thành hai cột cạnh nhau
   * (mẫu Soạn, ui-design mục 10). Đo theo vùng chứa chứ không theo màn hình, nên ẩn thanh bên cũng đổi bố cục.
   */
  split?: boolean;
}) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = items[(index + step + items.length) % items.length];
    if (next) {
      onChange(next.id);
      refs.current[next.id]?.focus();
    }
  };
  const active = items.find((i) => i.id === value) ?? items[0];
  // Thanh tab cuộn ngang được khi hẹp: tab đang chọn luôn nằm trong khung nhìn của thanh (không cuộn cả trang).
  useEffect(() => {
    const el = active ? refs.current[active.id] : null;
    const bar = el?.parentElement;
    if (!el || !bar || bar.scrollWidth <= bar.clientWidth) return;
    const left = el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, left) });
  }, [active]);
  return (
    <div className={`flex flex-col gap-4 ${split ? '@container' : ''}`}>
      <div
        role="tablist"
        aria-label={label}
        className={`flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] [&::-webkit-scrollbar]:hidden ${split ? '@4xl:hidden' : ''}`}
      >
        {items.map((item, index) => {
          const selected = item.id === active?.id;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[item.id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-${item.id}-tab`}
              aria-selected={selected}
              aria-controls={`${base}-${item.id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              onKeyDown={(e) => move(e, index)}
              className={`inline-flex min-h-12 flex-1 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-semibold pointer-fine:min-h-10 sm:px-4 ${
                selected
                  ? 'border-primary text-on-primary-soft'
                  : 'border-transparent text-fg-muted hover:text-fg'
              }`}
            >
              {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <>
                  <span className="min-w-5 rounded-full bg-warning-soft px-1.5 text-center text-xs tabular-nums text-fg">
                    {item.badge}
                  </span>
                  {item.badgeNote && <span className="sr-only">{item.badgeNote}</span>}
                </>
              )}
            </button>
          );
        })}
      </div>
      <div
        className={
          split
            ? 'flex flex-col gap-4 @4xl:grid @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @4xl:items-start @4xl:gap-6'
            : ''
        }
      >
        {items.map((item) => (
          <div
            key={item.id}
            role="tabpanel"
            id={`${base}-${item.id}-panel`}
            aria-labelledby={`${base}-${item.id}-tab`}
            className={item.id === active?.id ? '' : split ? 'hidden @4xl:block' : 'hidden'}
          >
            {item.content}
          </div>
        ))}
      </div>
    </div>
  );
}
