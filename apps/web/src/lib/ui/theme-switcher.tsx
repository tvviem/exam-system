import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type ThemeChoice, useTheme } from '../theme';

const OPTIONS: { value: ThemeChoice; Icon: typeof Sun }[] = [
  { value: 'system', Icon: Monitor },
  { value: 'light', Icon: Sun },
  { value: 'dark', Icon: Moon },
];

/** Nút gạt 3 lựa chọn: Theo hệ thống, Sáng, Tối (Q71). */
export function ThemeSwitcher() {
  const { t } = useTranslation();
  const [choice, setChoice] = useTheme();
  return (
    <fieldset className="inline-flex rounded-lg border border-border p-0.5">
      <legend className="sr-only">{t('theme.label')}</legend>
      {OPTIONS.map(({ value, Icon }) => (
        <label
          key={value}
          title={t(`theme.${value}`)}
          className="inline-flex size-12 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors hover:text-fg has-checked:bg-primary-soft has-checked:text-on-primary-soft has-focus-visible:outline-2 has-focus-visible:outline-ring"
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={choice === value}
            onChange={() => setChoice(value)}
            className="sr-only"
          />
          <Icon aria-hidden className="size-5" />
          <span className="sr-only">{t(`theme.${value}`)}</span>
        </label>
      ))}
    </fieldset>
  );
}
