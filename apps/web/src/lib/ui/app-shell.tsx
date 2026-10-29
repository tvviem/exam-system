import { Link, useMatches, useRouterState } from '@tanstack/react-router';
import {
  Building2,
  ClipboardList,
  Ellipsis,
  History,
  type LucideIcon,
  MailPlus,
  ScrollText,
  Users,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Me } from '../auth';
import { Dialog } from '.';
import { BrandMark } from './brand';

// Khung ứng dụng thích ứng (docs/ui-design.md mục 9): ≥ 1024 px thanh bên; dưới đó thanh tab dưới đáy.

export interface NavItem {
  to: string;
  /** Khóa i18n đầy đủ và nhãn ngắn cho thanh tab dưới đáy. */
  label: string;
  short: string;
  icon: LucideIcon;
}

export function navFor(me: Me): NavItem[] {
  if (me.isAdmin) {
    return [
      { to: '/admin/users', label: 'admin.nav.users', short: 'nav.short.users', icon: Users },
      {
        to: '/admin/account-requests',
        label: 'nav.accountRequests',
        short: 'nav.short.accountRequests',
        icon: ClipboardList,
      },
      {
        to: '/admin/invitations',
        label: 'admin.nav.invitations',
        short: 'nav.short.invitations',
        icon: MailPlus,
      },
      { to: '/admin/units', label: 'admin.nav.units', short: 'nav.short.units', icon: Building2 },
      {
        to: '/admin/login-events',
        label: 'admin.nav.loginEvents',
        short: 'nav.short.loginEvents',
        icon: History,
      },
      {
        to: '/admin/audit-logs',
        label: 'admin.nav.auditLogs',
        short: 'nav.short.auditLogs',
        icon: ScrollText,
      },
    ];
  }
  if (me.roleTags.includes('examiner')) {
    return [
      {
        to: '/examiner/account-requests',
        label: 'nav.accountRequests',
        short: 'nav.short.accountRequests',
        icon: ClipboardList,
      },
    ];
  }
  return [];
}

const linkBase =
  'inline-flex items-center gap-3 rounded-lg px-3 text-sm font-medium text-fg-muted hover:bg-primary-soft hover:text-fg [&.active]:bg-primary-soft [&.active]:text-on-primary-soft';

/** Thanh trên cùng, thanh bên (≥ 1024 px), thanh tab dưới đáy (< 1024 px). */
export function AppShell({
  items,
  actions,
  children,
}: {
  items: NavItem[];
  /** Chuông thông báo và menu tài khoản. */
  actions: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  // Thanh tab tối đa 5 mục (Material): nhiều hơn thì mục cuối là "Thêm" mở danh sách còn lại.
  const bottomItems = items.length > 5 ? items.slice(0, 4) : items;
  const overflow = items.length > 5 ? items.slice(4) : [];
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const moreActive = overflow.some((item) => pathname.startsWith(item.to));
  // Trang khai báo `staticData: { wide: true }` thì nội dung được rộng tới 1600 px (Q107).
  const wide = useMatches({ select: (matches) => matches.some((m) => m.staticData?.wide) });

  return (
    <>
      {items.length > 0 && (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
          <Brand className="h-(--app-header-h) px-5" />
          <nav
            aria-label={t('nav.main')}
            className="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
          >
            {items.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className={`${linkBase} min-h-12 pointer-fine:min-h-10`}>
                <Icon aria-hidden className="size-5 shrink-0" />
                {t(label)}
              </Link>
            ))}
          </nav>
        </aside>
      )}

      <div className={items.length > 0 ? 'lg:pl-64' : ''}>
        <header className="sticky top-0 z-20 border-b border-border bg-surface">
          <div className="flex h-(--app-header-h) items-center gap-3 px-4 md:px-6 lg:px-8">
            <Brand className={items.length > 0 ? 'lg:hidden' : ''} />
            <div className="ml-auto flex items-center gap-1">{actions}</div>
          </div>
        </header>
        <main
          className={`mx-auto px-4 py-6 pb-[calc(var(--app-tabbar-h)+3rem)] md:px-6 lg:px-8 lg:pb-10 ${wide ? 'max-w-[100rem]' : 'max-w-6xl'}`}
        >
          {children}
        </main>
      </div>

      {items.length > 0 && (
        <nav
          aria-label={t('nav.main')}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <ul className="mx-auto grid max-w-xl grid-flow-col auto-cols-fr">
            {bottomItems.map(({ to, short, icon: Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="flex min-h-(--app-tabbar-h) flex-col items-center justify-center gap-1 px-1 text-[13px] font-medium text-fg-muted [&.active]:text-primary"
                >
                  <Icon aria-hidden className="size-6" />
                  <span className="text-center leading-tight">{t(short)}</span>
                </Link>
              </li>
            ))}
            {overflow.length > 0 && (
              <li>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen(true)}
                  className={`flex min-h-(--app-tabbar-h) w-full cursor-pointer flex-col items-center justify-center gap-1 px-1 text-[13px] font-medium ${moreActive ? 'text-primary' : 'text-fg-muted'}`}
                >
                  <Ellipsis aria-hidden className="size-6" />
                  {t('nav.more')}
                </button>
              </li>
            )}
          </ul>
        </nav>
      )}
      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')}>
        <ul className="flex flex-col gap-1">
          {overflow.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                onClick={() => setMoreOpen(false)}
                className={`${linkBase} min-h-12 w-full text-base`}
              >
                <Icon aria-hidden className="size-5 shrink-0" />
                {t(label)}
              </Link>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}

function Brand({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`flex min-w-0 items-center ${className}`}>
      <BrandMark />
    </Link>
  );
}
