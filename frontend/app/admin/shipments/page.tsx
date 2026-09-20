import { AdminResourceView } from '@/components/admin/admin-resource-view';

export default async function AdminShipmentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  return <AdminResourceView initialStatus={status} resource="shipments" />;
}
