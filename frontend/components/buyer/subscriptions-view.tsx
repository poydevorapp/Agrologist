'use client';

import Link from 'next/link';
import { useI18n } from '@/components/locale-provider';
import { EmptyState } from '@/components/farmer/async-state';

export function SubscriptionsView() {
  const { t } = useI18n();
  return <div className="buyer-page"><header className="buyer-page-heading"><h1>{t('buyer.subscriptions.title')}</h1><p>{t('buyer.subscriptions.subtitle')}</p></header><EmptyState title={t('buyer.subscriptions.emptyTitle')} body={t('buyer.subscriptions.emptyBody')} action={<Link className="button button-primary" href="/buyer/search">{t('buyer.home.browse')}</Link>} /></div>;
}
