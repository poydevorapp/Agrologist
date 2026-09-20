'use client';

import { useI18n } from '@/components/locale-provider';
import { MessageKey } from '@/i18n/messages';

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const key = `status.${status}` as MessageKey;
  return <span className={`listing-status status-${status.toLowerCase().replaceAll('_', '-')}`}>{t(key)}</span>;
}
