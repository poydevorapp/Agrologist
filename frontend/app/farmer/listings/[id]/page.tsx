import { ListingDetails } from '@/components/farmer/listing-details';

export default async function ListingDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListingDetails id={id} />;
}
