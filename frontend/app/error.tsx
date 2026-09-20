'use client';

import { ErrorState } from '@/components/farmer/async-state';
import { useI18n } from '@/components/locale-provider';

export default function PageError({ reset }: { error: Error & { digest?: string }; reset(): void }) {
  const { t } = useI18n();
  return <ErrorState message={t('common.errorTitle')} retry={reset} />;
}
