import { OrderTracking } from '@/components/buyer/order-tracking';

export default async function BuyerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderTracking id={id} />;
}
