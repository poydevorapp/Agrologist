import { apiRequest } from './api';
import type { CatalogCategory, ListingUnit } from './farmer-api';

export type MarketplaceListing = {
  id: string;
  title: string;
  status: 'ACTIVE';
  description: string | null;
  availableQuantity: number;
  unit: ListingUnit;
  pricePerUnit: number;
  location: { region: string; district: string; latitude: number | null; longitude: number | null };
  product: { id: string; name: string; unitType: ListingUnit; category: { id: string; name: string } };
  farmer: { farmName: string | null; region: string; district: string; verificationStatus: string };
  createdAt: string;
  updatedAt: string;
};

export type MarketplacePage = {
  data: MarketplaceListing[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  sort: { field: string; order: string };
};

export type BuyerOrderSummary = {
  id: string; status: string; subtotal: number; deliveryFee: number; totalAmount: number;
  farmer: { id: string; fullName: string }; itemCount: number;
  shipmentStatus: string | null; paymentStatus: string | null; createdAt: string; updatedAt: string;
};

export type BuyerOrder = {
  id: string; status: string; subtotal: number; deliveryFee: number; totalAmount: number;
  demoPaymentQuote: { platformFee: number; payableTotal: number };
  farmer: { id: string; fullName: string };
  items: Array<{ id: string; listingId: string; listingTitle: string; productName: string; quantity: number; unitPrice: number; lineTotal: number }>;
  shipment: null | {
    id: string; status: string; pickupTime: string | null; deliveredTime: string | null;
    transporterName: string | null; vehicle: null | { type: string; plateNumber: string | null };
    pickup: { region: string; district: string; latitude: number | null; longitude: number | null };
    destination: { region: string; district: string; latitude: number | null; longitude: number | null };
    events: Array<{ id: string; type: string; latitude: number | null; longitude: number | null; createdAt: string }>;
  };
  payment: null | { provider: string; status: string; amount: number };
  escrow: null | { status: string; grossAmount: number; releasedAt: string | null };
  availableActions: { demoPay: boolean; acceptDelivery: boolean };
  createdAt: string; updatedAt: string;
};

export type CreatedOrder = { id: string; status: string; totalAmount: number };

export const buyerApi = {
  marketplace: (params = new URLSearchParams()) => apiRequest<MarketplacePage>(`/marketplace/listings?${params}`),
  listing: (id: string) => apiRequest<MarketplaceListing>(`/marketplace/listings/${encodeURIComponent(id)}`),
  catalog: () => apiRequest<{ categories: CatalogCategory[] }>('/marketplace/catalog'),
  createOrder: (listingId: string, quantity: number) => apiRequest<CreatedOrder>('/orders', {
    method: 'POST', body: JSON.stringify({ listing_id: listingId, quantity }),
  }),
  orders: () => apiRequest<BuyerOrderSummary[]>('/orders/my'),
  order: (id: string) => apiRequest<BuyerOrder>(`/orders/${encodeURIComponent(id)}`),
  demoPay: (id: string) => apiRequest(`/orders/${encodeURIComponent(id)}/demo-pay`, {
    method: 'POST', body: JSON.stringify({}),
  }),
  acceptDelivery: (id: string) => apiRequest(`/orders/${encodeURIComponent(id)}/accept-delivery`, {
    method: 'POST', body: JSON.stringify({}),
  }),
};
