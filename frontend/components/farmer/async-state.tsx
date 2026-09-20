'use client';

import { useI18n } from '@/components/locale-provider';

export function LoadingState() {
  const { t } = useI18n();
  return <div className="state-panel" role="status"><span className="spinner" />{t('common.loading')}</div>;
}

export function ErrorState({ message, retry }: { message: string; retry(): void }) {
  const { t } = useI18n();
  return <div className="state-panel state-error"><strong>{t('common.errorTitle')}</strong><span>{message}</span><button className="button button-secondary" onClick={retry} type="button">{t('common.retry')}</button></div>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="state-panel state-empty"><strong>{title}</strong><span>{body}</span>{action}</div>;
}
