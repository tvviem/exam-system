import { CircleAlert, X } from 'lucide-react';
import { type ComponentProps, type ReactNode, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// Component dùng chung (docs/ui-design.md mục 6): phần tử HTML gốc, chỉ dùng token màu.

const fieldClass =
  'h-12 w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-fg outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-danger';

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1 text-sm text-danger">
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint: unknown, error: unknown) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export function TextField({
  label,
  id,
  hint,
  error,
  ...input
}: { label: string; id: string; hint?: ReactNode; error?: ReactNode } & ComponentProps<'input'>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={fieldClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...input}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  id,
  hint,
  error,
  children,
  ...select
}: { label: string; id: string; hint?: ReactNode; error?: ReactNode } & ComponentProps<'select'>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        className={fieldClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...select}
      >
        {children}
      </select>
    </FieldShell>
  );
}

const buttonBase =
  'inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const buttonVariants = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-primary-soft',
  danger: 'bg-danger text-on-danger hover:opacity-90',
  ghost: 'text-primary hover:bg-primary-soft',
} as const;

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...button
}: { variant?: keyof typeof buttonVariants } & ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={`${buttonBase} ${buttonVariants[variant]} ${className}`}
      {...button}
    />
  );
}

export function PrimaryButton(props: ComponentProps<'button'>) {
  return <Button variant="primary" {...props} />;
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

const badgeTones = {
  neutral: 'bg-bg text-fg-muted border border-border',
  primary: 'bg-primary-soft text-on-primary-soft',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
} as const;

export function Badge({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: keyof typeof badgeTones;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * Hộp thoại dùng <dialog> gốc: có sẵn bẫy focus, phím Esc và lớp phủ. Trên điện thoại nằm sát đáy
 * như bottom sheet. `dismissible = false` buộc người dùng bấm nút trong hộp thoại mới đóng được.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  dismissible?: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      className="m-0 mt-auto w-full max-w-none rounded-t-2xl bg-surface-raised p-0 text-fg sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col gap-4 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {dismissible && (
              <button
                type="button"
                aria-label={t('common.close')}
                className="-m-2 inline-flex size-12 cursor-pointer items-center justify-center rounded-lg text-fg-muted hover:bg-primary-soft"
                onClick={onClose}
              >
                <X aria-hidden className="size-5" />
              </button>
            )}
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
