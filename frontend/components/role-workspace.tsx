'use client';

import Link from 'next/link';
import { useAuth } from './auth-provider';
import { useI18n } from './locale-provider';

type RoleWorkspaceProps = {
  role: 'FARMER' | 'BUYER' | 'TRANSPORTER' | 'ADMIN';
  title: string;
  description: string;
  nextFeatures: string[];
};

export function RoleWorkspace({ role, title, description, nextFeatures }: RoleWorkspaceProps) {
  const { session, ready } = useAuth();
  const { t } = useI18n();
  return (
    <section className="page-container workspace">
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">{t('workspace.label', { role: t(`role.${role}`) })}</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span className="status-pill">{t('workspace.ready')}</span>
      </div>
      {!ready ? <div className="notice">{t('workspace.checking')}</div> : !session ? (
        <div className="notice">
          <strong>{t('common.authenticationRequired')}</strong>
          <span>{t('workspace.signInBefore')}</span>
          <Link className="button button-primary" href="/login">{t('nav.signIn')}</Link>
        </div>
      ) : (
        <div className="notice notice-success">
          <strong>{t('workspace.signedInAs', { name: session.user.fullName })}</strong>
          <span>{t('workspace.security')}</span>
        </div>
      )}
      <div className="panel-grid">
        {nextFeatures.map((feature, index) => (
          <article className="feature-panel" key={feature}>
            <span className="feature-number">0{index + 1}</span>
            <h2>{feature}</h2>
            <p>{t('workspace.reserved')}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
