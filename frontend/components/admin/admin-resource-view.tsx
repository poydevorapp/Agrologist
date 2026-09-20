'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/locale-provider';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, LoadingState } from '@/components/farmer/async-state';
import { StatusBadge } from '@/components/farmer/status-badge';
import { MessageKey } from '@/i18n/messages';
import { ApiError } from '@/lib/api';
import {
  AdminDispute, AdminListing, AdminOrder, AdminPage, AdminRecord, AdminResource,
  AdminShipment, AdminUser, adminApi,
} from '@/lib/admin-api';
import { ModerationAction, ModerationDialog } from './moderation-dialog';

const statusOptions: Record<AdminResource, string[]> = {
  users: ['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'],
  listings: ['DRAFT', 'PENDING', 'ACTIVE', 'RESERVED', 'SOLD', 'CANCELLED', 'REJECTED'],
  orders: ['PENDING', 'CONFIRMED', 'TRANSPORT_PENDING', 'TRANSPORT_ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPUTED'],
  shipments: ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'],
  disputes: ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
};

const roles = ['FARMER', 'BUYER', 'TRANSPORTER', 'ADMIN'];

export function AdminResourceView({ resource, initialStatus = '', moderationOnly = false }: {
  resource: AdminResource;
  initialStatus?: string;
  moderationOnly?: boolean;
}) {
  const { t, number, date } = useI18n();
  const { session } = useAuth();
  const fixedStatus = moderationOnly ? 'PENDING' : '';
  const safeInitialStatus = statusOptions[resource].includes(initialStatus) ? initialStatus : '';
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(fixedStatus || safeInitialStatus);
  const [role, setRole] = useState('');
  const [region, setRegion] = useState('');
  const [applied, setApplied] = useState({ status: fixedStatus || safeInitialStatus, role: '', region: '' });
  const [result, setResult] = useState<AdminPage<AdminRecord> | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [moderation, setModeration] = useState<{ listing: AdminListing; action: ModerationAction } | null>(null);
  const [banning, setBanning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      let next: AdminPage<AdminRecord>;
      if (resource === 'users') next = await adminApi.users(page, { status: applied.status, role: applied.role }) as AdminPage<AdminRecord>;
      else if (resource === 'listings') next = await adminApi.listings(page, { status: applied.status, region: applied.region }) as AdminPage<AdminRecord>;
      else if (resource === 'orders') next = await adminApi.orders(page, { status: applied.status }) as AdminPage<AdminRecord>;
      else if (resource === 'shipments') next = await adminApi.shipments(page, { status: applied.status }) as AdminPage<AdminRecord>;
      else next = await adminApi.disputes(page, { status: applied.status }) as AdminPage<AdminRecord>;
      setResult(next);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [applied, page, resource, t]);
  useEffect(() => { void load(); }, [load]);

  function applyFilters(event: FormEvent) {
    event.preventDefault(); setPage(1); setSuccess('');
    setApplied({ status: fixedStatus || status, role, region: region.trim() });
  }

  function moderationCompleted(action: ModerationAction) {
    setModeration(null);
    setSuccess(t(action === 'approve' ? 'admin.moderation.approvedSuccess' : 'admin.moderation.rejectedSuccess'));
    void load();
  }

  async function banUser(user: AdminUser) {
    if (!window.confirm(t('admin.users.confirmBan', { name: user.fullName, phone: user.phone }))) return;
    setBanning(user.id); setError(''); setSuccess('');
    try {
      await adminApi.banUser(user.id);
      await load();
      setSuccess(t('admin.users.bannedSuccess'));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('common.errorTitle'));
    } finally { setBanning(null); }
  }

  function renderRecord(record: AdminRecord) {
    if (resource === 'users') {
      const user = record as AdminUser;
      return <article className="admin-record" key={user.id}><header><div><span>{t('admin.users.user')}</span><strong>{user.fullName}</strong><small>{user.phone}{user.email ? ` · ${user.email}` : ''}</small></div><StatusBadge status={user.status} /></header><div className="admin-record-facts"><div><span>{t('admin.users.roles')}</span><strong>{user.roles.map((item) => t(`role.${item}` as MessageKey)).join(', ') || t('common.notAvailable')}</strong></div><div><span>{t('admin.common.created')}</span><strong>{date(user.createdAt)}</strong></div></div>{['ACTIVE', 'PENDING'].includes(user.status) && !user.roles.includes('ADMIN') && user.id !== session?.user.id && <footer className="admin-record-actions"><button className="button button-secondary" type="button" disabled={banning !== null} onClick={() => void banUser(user)}>{banning === user.id ? t('admin.users.banning') : t('admin.users.ban')}</button></footer>}</article>;
    }
    if (resource === 'listings') {
      const listing = record as AdminListing;
      return <article className="admin-record" key={listing.id}><header><div><span>{listing.product.category.name} · {listing.product.name}</span><strong>{listing.title}</strong></div><StatusBadge status={listing.status} /></header><div className="admin-record-facts admin-record-facts-four"><div><span>{t('admin.listings.farmer')}</span><strong>{listing.farmer.farmName || listing.farmer.fullName}</strong></div><div><span>{t('admin.listings.stock')}</span><strong>{number(listing.availableQuantity)} {t(`unit.${listing.unit}` as MessageKey)}</strong></div><div><span>{t('admin.listings.price')}</span><strong>{number(listing.pricePerUnit)} UZS</strong></div><div><span>{t('admin.listings.location')}</span><strong>{listing.location.district}, {listing.location.region}</strong></div></div>{listing.status === 'PENDING' && <footer className="admin-record-actions"><button className="button button-secondary" onClick={() => setModeration({ listing, action: 'reject' })}>{t('admin.moderation.reject')}</button><button className="button button-primary" onClick={() => setModeration({ listing, action: 'approve' })}>{t('admin.moderation.approve')}</button></footer>}</article>;
    }
    if (resource === 'orders') {
      const order = record as AdminOrder;
      return <article className="admin-record" key={order.id}><header><div><span>{t('admin.orders.order')}</span><strong>#{order.id.slice(0, 8)}</strong></div><StatusBadge status={order.status} /></header><div className="admin-record-facts admin-record-facts-four"><div><span>{t('admin.orders.buyer')}</span><strong>{order.buyer.fullName}</strong></div><div><span>{t('admin.orders.farmer')}</span><strong>{order.farmer.fullName}</strong></div><div><span>{t('admin.orders.items')}</span><strong>{number(order.itemCount)}</strong></div><div><span>{t('admin.orders.total')}</span><strong>{number(order.totalAmount)} UZS</strong></div></div></article>;
    }
    if (resource === 'shipments') {
      const shipment = record as AdminShipment;
      return <article className="admin-record" key={shipment.id}><header><div><span>{t('admin.shipments.shipment')}</span><strong>#{shipment.id.slice(0, 8)}</strong></div><StatusBadge status={shipment.status} /></header><div className="admin-record-facts admin-record-facts-four"><div><span>{t('admin.shipments.order')}</span><strong>#{shipment.order.id.slice(0, 8)}</strong></div><div><span>{t('admin.shipments.transporter')}</span><strong>{shipment.transporter?.fullName || t('admin.shipments.unassigned')}</strong></div><div><span>{t('admin.shipments.vehicle')}</span><strong>{shipment.vehicle ? `${t(`transporter.vehicle.type.${shipment.vehicle.type}` as MessageKey)} · ${shipment.vehicle.plateNumber ?? ''}` : t('admin.shipments.unassigned')}</strong></div><div><span>{t('admin.orders.total')}</span><strong>{number(shipment.order.totalAmount)} UZS</strong></div></div></article>;
    }
    const dispute = record as AdminDispute;
    return <article className="admin-record" key={dispute.id}><header><div><span>{t('admin.disputes.dispute')}</span><strong>{dispute.reason}</strong></div><StatusBadge status={dispute.status} /></header><p className="admin-record-description">{dispute.description}</p><div className="admin-record-facts"><div><span>{t('admin.disputes.openedBy')}</span><strong>{dispute.openedBy.fullName}</strong></div><div><span>{t('admin.disputes.order')}</span><strong>#{dispute.order.id.slice(0, 8)}</strong></div><div><span>{t('admin.common.created')}</span><strong>{date(dispute.createdAt)}</strong></div></div>{dispute.resolution && <div className="admin-resolution"><span>{t('admin.disputes.resolution')}</span><p>{dispute.resolution}</p></div>}</article>;
  }

  const titleKey = moderationOnly ? 'admin.moderation.title' : `admin.${resource}.title` as MessageKey;
  const subtitleKey = moderationOnly ? 'admin.moderation.subtitle' : `admin.${resource}.subtitle` as MessageKey;
  if (!result && !error) return <div className="admin-page"><LoadingState /></div>;
  return <div className="admin-page"><header className="admin-page-heading"><div><div className="eyebrow">{t('admin.dashboard.eyebrow')}</div><h1>{t(titleKey)}</h1><p>{t(subtitleKey)}</p></div><strong>{t('admin.common.total', { count: result?.pagination.totalItems ?? 0 })}</strong></header>{success && <div className="payment-success" role="status">{success}</div>}<form className="admin-filters" onSubmit={applyFilters}><label>{t('admin.filters.status')}<select disabled={moderationOnly} value={fixedStatus || status} onChange={(event) => setStatus(event.target.value)}><option value="">{t('admin.filters.allStatuses')}</option>{statusOptions[resource].map((item) => <option value={item} key={item}>{t(`status.${item}` as MessageKey)}</option>)}</select></label>{resource === 'users' && <label>{t('admin.filters.role')}<select value={role} onChange={(event) => setRole(event.target.value)}><option value="">{t('admin.filters.allRoles')}</option>{roles.map((item) => <option value={item} key={item}>{t(`role.${item}` as MessageKey)}</option>)}</select></label>}{resource === 'listings' && <label>{t('admin.filters.region')}<input value={region} onChange={(event) => setRegion(event.target.value)} /></label>}<button className="button button-primary" type="submit">{t('admin.filters.apply')}</button></form>{error ? <ErrorState message={error} retry={() => void load()} /> : result?.data.length === 0 ? <EmptyState title={t('admin.common.emptyTitle')} body={t('admin.common.emptyBody')} /> : <><div className="admin-record-list">{result?.data.map(renderRecord)}</div><nav className="pagination" aria-label={t('admin.common.pagination')}><button className="button button-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{t('buyer.pagination.previous')}</button><span>{t('buyer.pagination.page', { page, total: result?.pagination.totalPages ?? 1 })}</span><button className="button button-secondary" disabled={page >= (result?.pagination.totalPages ?? 1)} onClick={() => setPage((current) => current + 1)}>{t('buyer.pagination.next')}</button></nav></>}{moderation && <ModerationDialog action={moderation.action} listing={moderation.listing} close={() => setModeration(null)} completed={moderationCompleted} />}</div>;
}
