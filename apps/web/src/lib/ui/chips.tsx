import type { ReactNode } from 'react';

/** Nhóm chip lọc kèm số liệu: tự xuống dòng thay vì co nhãn (docs/ui-design.md mục 11); nhãn dài xuống dòng trong chip, chip không rộng hơn màn hình. */
export function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-wrap gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {children}
    </fieldset>
  );
}

export function Chip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-12 max-w-full cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-left text-sm font-medium pointer-fine:min-h-9 ${
        active
          ? 'border-primary bg-primary-soft text-on-primary-soft'
          : 'border-border-strong bg-surface text-fg hover:bg-primary-soft'
      }`}
    >
      <span className="min-w-0 break-words">{children}</span>
      {count !== undefined && <span className="shrink-0 tabular-nums">({count})</span>}
    </button>
  );
}
