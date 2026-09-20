import { ListingForm } from '@/components/farmer/listing-form';

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ListingForm listingId={id} />;
}
