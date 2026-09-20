'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type CartItem = { listingId: string; quantity: number };
type CartContextValue = {
  items: CartItem[];
  ready: boolean;
  add(listingId: string, quantity: number): void;
  update(listingId: string, quantity: number): void;
  remove(listingId: string): void;
  removeMany(listingIds: string[]): void;
  clear(): void;
};
const KEY = 'agrologistik.buyer.cart';
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      const parsed = stored ? JSON.parse(stored) as CartItem[] : [];
      setItems(Array.isArray(parsed) ? parsed.filter((item) => item.listingId && item.quantity > 0) : []);
    } catch { window.localStorage.removeItem(KEY); }
    setReady(true);
  }, []);
  function commit(next: CartItem[]) {
    setItems(next);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  }
  const value = useMemo<CartContextValue>(() => ({
    items, ready,
    add(listingId, quantity) {
      const current = items.find((item) => item.listingId === listingId);
      commit(current ? items.map((item) => item.listingId === listingId ? { ...item, quantity: item.quantity + quantity } : item) : [...items, { listingId, quantity }]);
    },
    update(listingId, quantity) { commit(items.map((item) => item.listingId === listingId ? { ...item, quantity } : item).filter((item) => item.quantity > 0)); },
    remove(listingId) { commit(items.filter((item) => item.listingId !== listingId)); },
    removeMany(listingIds) { const removed = new Set(listingIds); commit(items.filter((item) => !removed.has(item.listingId))); },
    clear() { commit([]); },
  }), [items, ready]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside CartProvider');
  return value;
}
