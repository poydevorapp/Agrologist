import { ShipmentDetails } from '@/components/transporter/shipment-details';

export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShipmentDetails delivery id={id} />;
}
