'use client';

import { useI18n } from '@/components/locale-provider';
import { AdminTurnoverAnalytics } from '@/lib/admin-api';

const colors = { goods: '#3486ae', delivery: '#edaa53', platformFee: '#59a989' };

export function TurnoverCharts({ data }: { data: AdminTurnoverAnalytics }) {
  const { t, number, locale } = useI18n();
  const money = (value: number) => `${number(value, { maximumFractionDigits: 2 })} UZS`;
  const day = (period: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(`${period}T12:00:00`));
  const month = (period: string) => new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(`${period}-01T12:00:00`));
  const daily = data.daily.map(item => Number(item.amount));
  const monthly = data.monthly.map(item => Number(item.amount));
  const dailyMax = Math.max(...daily, 1);
  const monthMax = Math.max(...monthly, 1);
  const points = daily.map((value, index) => `${24 + index * 552 / Math.max(daily.length - 1, 1)},${160 - value * 130 / dailyMax}`).join(' ');
  const goods = Number(data.breakdown.goods);
  const delivery = Number(data.breakdown.delivery);
  const platformFee = Number(data.breakdown.platformFee);
  const total = goods + delivery + platformFee;
  const goodsPercent = total ? goods / total * 100 : 0;
  const deliveryPercent = total ? delivery / total * 100 : 0;
  const weeklyMax = Math.max(...data.weekly.map(item => Number(item.goods) + Number(item.delivery) + Number(item.platformFee)), 1);
  return (
    <section className="analytics-section" aria-label={t('admin.analytics.title')}>
      <div className="analytics-heading"><h2>{t('admin.analytics.title')}</h2><p>{t('admin.analytics.subtitle')}</p></div>
      <div className="analytics-grid">
        <article className="analytics-card"><h3>{t('admin.analytics.daily')}</h3>
          {daily.some(Boolean) ? <><svg className="turnover-line" viewBox="0 0 600 190" role="img" aria-label={t('admin.analytics.daily')}>
            <line x1="24" x2="576" y1="160" y2="160" stroke="#cfd9e5" />
            <line x1="24" x2="576" y1="95" y2="95" stroke="#e6ebf0" />
            <polyline points={points} fill="none" stroke={colors.goods} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          </svg><div className="analytics-axis"><span>{day(data.daily[0]!.period)}</span><span>{day(data.daily.at(-1)!.period)}</span></div></> : <p className="analytics-empty">{t('admin.analytics.empty')}</p>}
          <small>{t('admin.analytics.peak')}: {money(dailyMax === 1 && !daily.some(Boolean) ? 0 : dailyMax)}</small>
        </article>
        <article className="analytics-card"><h3>{t('admin.analytics.monthly')}</h3>
          {monthly.some(Boolean) ? <div className="monthly-scroll"><div className="monthly-bars" role="img" aria-label={t('admin.analytics.monthly')}>
            {data.monthly.map((item, index) => <div className="monthly-column" key={item.period} title={`${item.period}: ${money(monthly[index]!)}`}><div style={{ height: `${Math.max(monthly[index]! / monthMax * 100, monthly[index] ? 2 : 0)}%` }} /><span>{month(item.period)}</span></div>)}
          </div></div> : <p className="analytics-empty">{t('admin.analytics.empty')}</p>}
          <small>{t('admin.analytics.peak')}: {money(monthMax === 1 && !monthly.some(Boolean) ? 0 : monthMax)}</small>
        </article>
        <article className="analytics-card"><h3>{t('admin.analytics.breakdown')}</h3>
          {total > 0 ? <div className="donut-layout"><div className="turnover-donut" role="img" aria-label={t('admin.analytics.breakdown')} style={{ background: `conic-gradient(${colors.goods} 0 ${goodsPercent}%, ${colors.delivery} ${goodsPercent}% ${goodsPercent + deliveryPercent}%, ${colors.platformFee} ${goodsPercent + deliveryPercent}% 100%)` }}><span>{money(total)}</span></div><div className="analytics-legend">
            {([['goods', goods], ['delivery', delivery], ['platformFee', platformFee]] as const).map(([part, amount]) => <div key={part}><i style={{ background: colors[part] }} /><span>{t(`admin.analytics.${part}`)}</span><strong>{money(amount)}</strong></div>)}
          </div></div> : <p className="analytics-empty">{t('admin.analytics.empty')}</p>}
        </article>
        <article className="analytics-card"><h3>{t('admin.analytics.weekly')}</h3>
          {data.weekly.some(item => Number(item.goods) + Number(item.delivery) + Number(item.platformFee) > 0) ? <div className="weekly-bars">
            {data.weekly.map(item => { const parts = [Number(item.goods), Number(item.delivery), Number(item.platformFee)]; const sum = parts.reduce((a, b) => a + b, 0); return <div className="weekly-row" key={item.period}><span>{day(item.period)}</span><div className="weekly-track" title={`${item.period}: ${money(sum)}`}><i style={{ width: `${parts[0]! / weeklyMax * 100}%`, background: colors.goods }} /><i style={{ width: `${parts[1]! / weeklyMax * 100}%`, background: colors.delivery }} /><i style={{ width: `${parts[2]! / weeklyMax * 100}%`, background: colors.platformFee }} /></div><strong>{money(sum)}</strong></div>; })}
          </div> : <p className="analytics-empty">{t('admin.analytics.empty')}</p>}
          <div className="analytics-legend analytics-legend-inline">{(['goods', 'delivery', 'platformFee'] as const).map(part => <div key={part}><i style={{ background: colors[part] }} /><span>{t(`admin.analytics.${part}`)}</span></div>)}</div>
        </article>
      </div>
    </section>
  );
}
