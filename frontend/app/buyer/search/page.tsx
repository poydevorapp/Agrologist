import { MarketplaceSearch } from '@/components/buyer/marketplace-search';

type Params = Record<string, string | string[] | undefined>;
export default async function BuyerSearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const source = await searchParams;
  const value = (key: string) => typeof source[key] === 'string' ? source[key] as string : '';
  return <MarketplaceSearch initial={{
    category_id: value('category_id'), product_id: value('product_id'),
    region: value('region'), district: value('district'), min_price: value('min_price'),
    max_price: value('max_price'), page: value('page') || '1',
  }} />;
}
