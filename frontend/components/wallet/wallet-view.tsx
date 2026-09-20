'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/components/locale-provider';
import { ErrorState, LoadingState } from '@/components/farmer/async-state';
import { ApiError } from '@/lib/api';
import { DemoWallet, walletApi } from '@/lib/wallet-api';
import { walletAmount, walletOperationId } from '@/lib/wallet-input';

type Action = 'topUp' | 'cashOut';

export function WalletView() {
  const router = useRouter();
  const { ready, session } = useAuth();
  const { t, number } = useI18n();
  const [wallet, setWallet] = useState<DemoWallet | null>(null);
  const [amount, setAmount] = useState('');
  const [card, setCard] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const attempt = useRef<{ action: Action; amount: number; id: string } | null>(null);
  const load = useCallback(async () => {
    setError('');
    try { setWallet(await walletApi.mine()); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [t]);
  useEffect(() => { if (ready && !session) router.replace('/login'); else if (ready) void load(); }, [ready, session, router, load]);

  async function submit(next: Action) {
    if (action !== null) return;
    const parsed = walletAmount(amount);
    const digits = card.replace(/\s+/g, '');
    if (!/^\d{12,19}$/.test(digits) || parsed === null) {
      setError(t('wallet.invalidInput')); return;
    }
    setAction(next); setError(''); setSuccess('');
    try {
      if (!attempt.current || attempt.current.action !== next || attempt.current.amount !== parsed) {
        attempt.current = { action: next, amount: parsed, id: walletOperationId() };
      }
      const updated = next === 'topUp'
        ? await walletApi.topUp(parsed, attempt.current.id)
        : await walletApi.cashOut(parsed, attempt.current.id);
      setWallet(updated);
      setCard(''); setAmount(''); attempt.current = null;
      setSuccess(t(next === 'topUp' ? 'wallet.topUpSuccess' : 'wallet.cashOutSuccess'));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('common.errorTitle'));
    } finally { setAction(null); }
  }

  if (!ready || (session && !wallet && !error)) return <LoadingState />;
  if (!session) return null;
  if (!wallet) return <ErrorState message={error} retry={() => void load()} />;
  return <div className="wallet-page buyer-page">
    <header className="buyer-page-heading"><h1>{t('wallet.title')}</h1><p>{t('wallet.subtitle')}</p></header>
    <section className="wallet-balance-card"><span>{t('wallet.accountNumber')}</span><strong>{wallet.accountNumber}</strong><span>{t('wallet.balance')}</span><b>{number(wallet.balance)} UZS</b><small>{t('wallet.maximum')}</small></section>
    <section className="wallet-action-card"><h2>{t('wallet.actionTitle')}</h2><p>{t('wallet.cardNotice')}</p>
      <form onSubmit={(event) => { event.preventDefault(); void submit('topUp'); }}>
        <label>{t('wallet.cardNumber')}<input value={card} onChange={(event) => { setCard(event.target.value); attempt.current = null; }} inputMode="numeric" autoComplete="off" maxLength={23} placeholder="0000 0000 0000 0000" /></label>
        <label>{t('wallet.amount')}<input value={amount} onChange={(event) => { setAmount(event.target.value); attempt.current = null; }} inputMode="decimal" type="number" min="0.01" max="900000000" step="0.01" /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        {success && <div className="payment-success" role="status">{success}</div>}
        <div className="wallet-actions"><button className="button button-primary" type="submit" disabled={action !== null}>{action === 'topUp' ? t('wallet.processing') : t('wallet.topUp')}</button>
          <button className="button button-secondary" type="button" disabled={action !== null} onClick={() => void submit('cashOut')}>{action === 'cashOut' ? t('wallet.processing') : t('wallet.cashOut')}</button></div>
      </form>
    </section>
  </div>;
}
