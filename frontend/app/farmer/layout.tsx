import { FarmerShell } from '@/components/farmer/farmer-shell';

export default function FarmerLayout({ children }: { children: React.ReactNode }) {
  return <FarmerShell>{children}</FarmerShell>;
}
