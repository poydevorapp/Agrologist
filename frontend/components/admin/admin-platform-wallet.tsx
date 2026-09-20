'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ErrorState, LoadingState } from '@/components/farmer/async-state';
import { ApiError } from '@/lib/api';
import { DemoWallet, walletApi } from '@/lib/wallet-api';

export function AdminPlatformWallet() {
  const { t, number } = useI18n();
  const [wallet, setWallet] = useState<DemoWallet | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setWallet(await walletApi.platform()); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);
  if (!wallet && !error) return <LoadingState />;
  if (!wallet) return <ErrorState message={error} retry={() => void load()} />;
  return <div className="admin-page"><header className="admin-page-heading"><div><div className="eyebrow">{t('admin.dashboard.eyebrow')}</div><h1>{t('admin.wallet.title')}</h1><p>{t('admin.wallet.subtitle')}</p></div></header>
    <section className="wallet-balance-card"><span>{t('wallet.accountNumber')}</span><strong>{wallet.accountNumber}</strong><span>{t('wallet.balance')}</span><b>{number(wallet.balance)} UZS</b><small>{t('wallet.maximum')}</small></section></div>;
}
