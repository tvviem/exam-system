import type { TFunction } from 'i18next';
import { ApiError } from './api';

export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PASSWORD_POLICY') {
      const [first] = (error.details.violations as string[] | undefined) ?? [];
      return t(`passwordPolicy.${first}`, { defaultValue: t('errors.UNKNOWN') });
    }
    return t(`errors.${error.code}`, { defaultValue: t('errors.UNKNOWN') });
  }
  return t('errors.UNKNOWN');
}
