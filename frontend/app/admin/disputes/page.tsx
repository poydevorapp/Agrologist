import { AdminResourceView } from '@/components/admin/admin-resource-view';

export default async function AdminDisputesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  return <AdminResourceView initialStatus={status} resource="disputes" />;
}
