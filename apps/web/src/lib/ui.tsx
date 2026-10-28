import type { ComponentProps, ReactNode } from 'react';

export function TextField({
  label,
  id,
  ...input
}: { label: string; id: string } & ComponentProps<'input'>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        className="h-12 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
        {...input}
      />
    </div>
  );
}

export function PrimaryButton({ children, ...button }: ComponentProps<'button'>) {
  return (
    <button
      className="h-12 rounded-lg bg-blue-700 px-4 text-base font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
      {...button}
    >
      {children}
    </button>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
      {children}
    </p>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">{children}</div>
  );
}
