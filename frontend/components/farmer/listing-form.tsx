'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/locale-provider';
import { ApiError } from '@/lib/api';
import { CatalogCategory, FarmerListing, ListingInput, ListingUnit, farmerApi } from '@/lib/farmer-api';
import { ErrorState, LoadingState } from './async-state';

type FormState = {
  productId: string; title: string; description: string; quantity: string;
  unit: ListingUnit; pricePerUnit: string; region: string; district: string;
  latitude: string; longitude: string;
};

const emptyForm: FormState = { productId: '', title: '', description: '', quantity: '', unit: 'KG', pricePerUnit: '', region: '', district: '', latitude: '', longitude: '' };

function fromListing(listing: FarmerListing): FormState {
  return {
    productId: listing.productId, title: listing.title, description: listing.description ?? '',
    quantity: String(listing.originalQuantity), unit: listing.unit,
    pricePerUnit: String(listing.pricePerUnit), region: listing.region, district: listing.district,
    latitude: listing.latitude === null ? '' : String(listing.latitude),
    longitude: listing.longitude === null ? '' : String(listing.longitude),
  };
}

export function ListingForm({ listingId }: { listingId?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<CatalogCategory[] | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageCount, setImageCount] = useState(0);
  const imageInput = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    setError('');
    try {
      const [catalogResult, listing] = await Promise.all([
        farmerApi.catalog(),
        listingId ? farmerApi.listing(listingId) : Promise.resolve(null),
      ]);
      setCatalog(catalogResult.categories);
      if (listing) {
        setForm(fromListing(listing));
        setCategoryId(catalogResult.categories.find((category) => category.products.some((product) => product.id === listing.productId))?.id ?? '');
      }
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
  }, [listingId, t]);
  useEffect(() => { void load(); }, [load]);
  const products = useMemo(() => catalog?.find((category) => category.id === categoryId)?.products ?? [], [catalog, categoryId]);
  function field<K extends keyof FormState>(name: K, value: FormState[K]) { setForm((current) => ({ ...current, [name]: value })); }
  function chooseCategory(nextId: string) {
    setCategoryId(nextId);
    const first = catalog?.find((category) => category.id === nextId)?.products[0];
    setForm((current) => ({ ...current, productId: first?.id ?? '', unit: first?.unit ?? 'KG' }));
  }
  function chooseProduct(productId: string) {
    const product = products.find((item) => item.id === productId);
    setForm((current) => ({ ...current, productId, unit: product?.unit ?? current.unit }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError('');
    const input: ListingInput = {
      productId: form.productId, title: form.title, quantity: Number(form.quantity), unit: form.unit,
      pricePerUnit: Number(form.pricePerUnit), region: form.region, district: form.district,
      ...(form.description.trim() ? { description: form.description.trim() } : { description: null }),
      ...(form.latitude ? { latitude: Number(form.latitude) } : listingId ? { latitude: null } : {}),
      ...(form.longitude ? { longitude: Number(form.longitude) } : listingId ? { longitude: null } : {}),
    };
    try {
      const saved = listingId ? await farmerApi.updateListing(listingId, input) : await farmerApi.createListing(input);
      router.push(`/farmer/listings/${saved.id}`);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : t('common.errorTitle')); }
    finally { setSaving(false); }
  }
  if (!catalog && !error) return <LoadingState />;
  if (!catalog && error) return <ErrorState message={error} retry={() => void load()} />;
  return (
    <div className="farmer-page form-page">
      <Link className="text-link" href={listingId ? `/farmer/listings/${listingId}` : '/farmer/listings'}>← {t('common.back')}</Link>
      <header className="farmer-page-heading"><div><h1>{t(listingId ? 'listings.edit' : 'listings.createTitle')}</h1><p>{t(listingId ? 'listings.editSubtitle' : 'listings.createSubtitle')}</p></div></header>
      <form className="listing-form" onSubmit={submit}>
        <section className="form-section"><div className="form-grid two-columns">
          <label>{t('listings.category')}<select required value={categoryId} onChange={(event) => chooseCategory(event.target.value)}><option value="">{t('listings.selectCategory')}</option>{catalog?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>{t('listings.product')}<select required value={form.productId} onChange={(event) => chooseProduct(event.target.value)} disabled={!categoryId}><option value="">{t('listings.selectProduct')}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <label className="full-column">{t('listings.titleField')}<input required minLength={1} maxLength={200} value={form.title} onChange={(event) => field('title', event.target.value)} /></label>
          <label className="full-column">{t('listings.description')} <span>{t('common.optional')}</span><textarea maxLength={5000} rows={5} value={form.description} onChange={(event) => field('description', event.target.value)} /></label>
        </div></section>
        <section className="form-section"><div className="form-grid three-columns">
          <label>{t('listings.quantity')}<input required type="number" min="0.01" step="0.01" value={form.quantity} onChange={(event) => field('quantity', event.target.value)} /></label>
          <label>{t('listings.unit')}<select value={form.unit} disabled><option value={form.unit}>{t(`unit.${form.unit}`)}</option></select></label>
          <label>{t('listings.price')}<input required type="number" min="0" step="0.01" value={form.pricePerUnit} onChange={(event) => field('pricePerUnit', event.target.value)} /></label>
          <label>{t('listings.region')}<input required maxLength={120} value={form.region} onChange={(event) => field('region', event.target.value)} /></label>
          <label>{t('listings.district')}<input required maxLength={120} value={form.district} onChange={(event) => field('district', event.target.value)} /></label>
        </div></section>
        <section className="form-section"><div className="form-grid two-columns">
          <label>{t('listings.latitude')} <span>{t('common.optional')}</span><input type="number" min="-90" max="90" step="0.000001" value={form.latitude} onChange={(event) => field('latitude', event.target.value)} /></label>
          <label>{t('listings.longitude')} <span>{t('common.optional')}</span><input type="number" min="-180" max="180" step="0.000001" value={form.longitude} onChange={(event) => field('longitude', event.target.value)} /></label>
        </div></section>
        <section className="form-section image-field"><label>{t('listings.images')} <span>{t('common.optional')}</span></label><input ref={imageInput} className="sr-only" type="file" accept="image/*" multiple aria-label={t('listings.images')} onChange={(event) => setImageCount(event.target.files?.length ?? 0)} /><button className="button button-secondary" type="button" onClick={() => imageInput.current?.click()}>{t('listings.chooseImages')}</button><p>{imageCount ? t('listings.selectedImages', { count: imageCount }) : t('listings.imagesHelp')}</p></section>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="form-actions"><Link className="button button-secondary" href="/farmer/listings">{t('common.back')}</Link><button className="button button-primary" type="submit" disabled={saving}>{saving ? t('listings.saving') : t('listings.save')}</button></div>
      </form>
    </div>
  );
}
