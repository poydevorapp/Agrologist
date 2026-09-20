import { MarketplaceDetails } from '@/components/buyer/marketplace-details';

export default async function BuyerListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MarketplaceDetails id={id} />;
}
