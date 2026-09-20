'use client';

import { useI18n } from '@/components/locale-provider';
import { FarmerSalesInsights } from '@/lib/farmer-api';

export function ProductSales({ products }: { products: FarmerSalesInsights['products'] }) {
  const { t, number } = useI18n();
  const max = Math.max(...products.map(item => Number(item.revenue)), 1);
  return <section className="farmer-section product-sales"><div className="farmer-section-heading"><h2>{t('farmer.sales.title')}</h2></div><p className="analytics-description">{t('farmer.sales.subtitle')}</p>
    {products.length ? <div className="product-sales-layout"><div className="sales-chart" role="img" aria-label={t('farmer.sales.chart')}>
      {products.map(item => <div className="sales-bar-row" key={`${item.productId}-${item.unit}`}><span title={item.productName}>{item.productName}</span><div className="sales-bar-track"><i style={{ width: `${Number(item.revenue) / max * 100}%` }} /></div><strong>{number(Number(item.revenue), { maximumFractionDigits: 0 })} UZS</strong></div>)}
    </div><div className="sales-table-scroll"><table className="sales-table"><caption>{t('farmer.sales.table')}</caption><thead><tr><th scope="col">#</th><th scope="col">{t('farmer.sales.product')}</th><th scope="col">{t('farmer.sales.quantity')}</th><th scope="col">{t('farmer.sales.orders')}</th><th scope="col">{t('farmer.sales.revenue')}</th></tr></thead><tbody>
      {products.map((item, index) => <tr key={`${item.productId}-${item.unit}`}><td>{index + 1}</td><td>{item.productName}</td><td>{number(Number(item.quantity))} {item.unit}</td><td>{number(item.orderCount)}</td><td>{number(Number(item.revenue), { maximumFractionDigits: 2 })} UZS</td></tr>)}
    </tbody></table></div></div> : <p className="analytics-empty">{t('farmer.sales.empty')}</p>}
  </section>;
}
