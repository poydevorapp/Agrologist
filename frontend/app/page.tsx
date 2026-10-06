'use client';

import Link from 'next/link';
import { useI18n } from '@/components/locale-provider';

const roles = [
  { href: '/farmer', name: 'role.FARMER', text: 'home.farmer' },
  { href: '/buyer', name: 'role.BUYER', text: 'home.buyer' },
  { href: '/transporter', name: 'role.TRANSPORTER', text: 'home.transporter' },
] as const;

export default function HomePage() {
  const { t } = useI18n();
  return (
    <>
      <section className="hero page-container">
        <div className="hero-copy">
          <div className="eyebrow">{t('home.eyebrow')}</div>
          <h1>{t('home.title')}</h1>
          <p>{t('home.subtitle')}</p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/register">{t('home.start')}</Link>
            <Link className="button button-secondary" href="/login">{t('nav.signIn')}</Link>
          </div>
        </div>
        <aside className="hero-card">
          <span className="hero-card-label">{t('home.foundation')}</span>
          <strong>{t('home.connected')}</strong>
          <p>{t('home.features')}</p>
          <div className="metric-row"><span>3</span><small>{t('home.workspaces')}</small></div>
        </aside>
      </section>
      <section className="page-container role-section">
        <div className="section-heading"><div><div className="eyebrow">{t('home.choose')}</div><h2>{t('home.participants')}</h2></div></div>
        <div className="role-grid">
          {roles.map((role) => <Link className="role-card" href={role.href} key={role.href}><h3>{t(role.name)}</h3><p>{t(role.text)}</p><span>{t('home.open')} →</span></Link>)}
        </div>
        <div className="home-proof-grid">
          <article className="feature-panel"><span className="feature-number">01 / {t('role.FARMER')}</span><h2>{t('home.farmer')}</h2><p>{t('home.features')}</p></article>
          <article className="feature-panel feature-panel-accent"><span className="feature-number">02 / {t('role.BUYER')}</span><h2>{t('home.buyer')}</h2><p>{t('home.connected')}</p></article>
          <article className="feature-panel"><span className="feature-number">03 / {t('role.TRANSPORTER')}</span><h2>{t('home.transporter')}</h2><p>{t('home.subtitle')}</p></article>
        </div>
      </section>
    </>
  );
}
