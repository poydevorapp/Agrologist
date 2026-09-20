import { ShipmentDetails } from '@/components/transporter/shipment-details';

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShipmentDetails id={id} />;
}
