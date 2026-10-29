import type { TFunction } from 'i18next';
import { ApiError } from './api';

export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PASSWORD_POLICY') {
      const [first] = (error.details.violations as string[] | undefined) ?? [];
      return t(`passwordPolicy.${first}`, { defaultValue: t('errors.UNKNOWN') });
    }
    if (error.code === 'VALIDATION_FAILED') {
      const [first] = (error.details.issues as { code: string }[] | undefined) ?? [];
      return t(`errors.VALIDATION_${first?.code}`, { defaultValue: t('errors.VALIDATION_FAILED') });
    }
    if (error.code === 'CONFLICT') {
      return t(`errors.CONFLICT_${error.details.field}`, { defaultValue: t('errors.CONFLICT') });
    }
    return t(`errors.${error.code}`, { defaultValue: t('errors.UNKNOWN') });
  }
  return t('errors.UNKNOWN');
}
