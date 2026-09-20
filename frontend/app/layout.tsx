import type { Metadata } from 'next';
import { AuthProvider } from '@/components/auth-provider';
import { AppShell } from '@/components/app-shell';
import { LocaleProvider } from '@/components/locale-provider';
import 'leaflet/dist/leaflet.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Agrologistik Marketplace', template: '%s | Agrologistik' },
  description: 'Agricultural marketplace and logistics platform.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uz">
      <body>
        <LocaleProvider><AuthProvider><AppShell>{children}</AppShell></AuthProvider></LocaleProvider>
      </body>
    </html>
  );
}
