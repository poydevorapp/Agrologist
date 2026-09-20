import { BuyerShell } from '@/components/buyer/buyer-shell';
import { CartProvider } from '@/components/buyer/cart-provider';

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return <CartProvider><BuyerShell>{children}</BuyerShell></CartProvider>;
}
