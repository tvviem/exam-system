import type { ReactNode } from 'react';

/** Nhóm chip lọc kèm số liệu: tự xuống dòng thay vì co nhãn (docs/ui-design.md mục 11). */
export function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-wrap gap-2">
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
      className={`inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium whitespace-nowrap pointer-fine:min-h-9 ${
        active
          ? 'border-primary bg-primary-soft text-on-primary-soft'
          : 'border-border-strong bg-surface text-fg hover:bg-primary-soft'
      }`}
    >
      {children}
      {count !== undefined && (
        <>
          {' '}
          <span className="tabular-nums">({count})</span>
        </>
      )}
    </button>
  );
}
