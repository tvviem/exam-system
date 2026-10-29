import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react';

export interface TabItem {
  id: string;
  label: string;
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
  /** Từ 1024 px bỏ thanh tab và trải các nội dung thành các cột cạnh nhau (mẫu Soạn, ui-design mục 10). */
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
  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={label}
        className={`flex gap-1 border-b border-border ${split ? 'lg:hidden' : ''}`}
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
              className={`min-h-12 flex-1 cursor-pointer border-b-2 px-4 text-sm font-semibold pointer-fine:min-h-10 ${
                selected
                  ? 'border-primary text-on-primary-soft'
                  : 'border-transparent text-fg-muted hover:text-fg'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        className={
          split ? 'flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6' : ''
        }
      >
        {items.map((item) => (
          <div
            key={item.id}
            role="tabpanel"
            id={`${base}-${item.id}-panel`}
            aria-labelledby={`${base}-${item.id}-tab`}
            className={item.id === active?.id ? '' : split ? 'hidden lg:block' : 'hidden'}
          >
            {item.content}
          </div>
        ))}
      </div>
    </div>
  );
}
