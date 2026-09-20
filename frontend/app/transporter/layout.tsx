import { TransporterShell } from '@/components/transporter/transporter-shell';

export default function TransporterLayout({ children }: { children: React.ReactNode }) {
  return <TransporterShell>{children}</TransporterShell>;
}
