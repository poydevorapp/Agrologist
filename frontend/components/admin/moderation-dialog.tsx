'use client';

import { useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { ApiError } from '@/lib/api';
import { AdminListing, adminApi } from '@/lib/admin-api';

export type ModerationAction = 'approve' | 'reject';

export function ModerationDialog({ listing, action, close, completed }: {
  listing: AdminListing;
  action: ModerationAction;
  close(): void;
  completed(action: ModerationAction): void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  async function confirm() {
    setWorking(true); setError('');
    try {
      if (action === 'approve') await adminApi.approveListing(listing.id);
      else await adminApi.rejectListing(listing.id, reason);
      completed(action);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
    finally { setWorking(false); }
  }
  return <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !working) close(); }}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="moderation-title"><div className="eyebrow">{t('admin.moderation.eyebrow')}</div><h2 id="moderation-title">{t(action === 'approve' ? 'admin.moderation.confirmApprove' : 'admin.moderation.confirmReject')}</h2><p>{t('admin.moderation.confirmBody', { title: listing.title })}</p>{action === 'reject' && <label>{t('admin.moderation.reason')} <span>{t('common.optional')}</span><textarea maxLength={1000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}{error && <div className="form-error" role="alert">{error}</div>}<div className="admin-modal-actions"><button className="button button-secondary" disabled={working} onClick={close} type="button">{t('admin.moderation.cancel')}</button><button className={`button ${action === 'reject' ? 'button-danger' : 'button-primary'}`} disabled={working} onClick={() => void confirm()} type="button">{working ? t('admin.moderation.processing') : t(action === 'approve' ? 'admin.moderation.approve' : 'admin.moderation.reject')}</button></div></section></div>;
}
