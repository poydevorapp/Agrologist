import { apiRequest } from './api';

export type ListingUnit = 'KG' | 'TON' | 'PIECE';
export type ListingStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'RESERVED' | 'SOLD' | 'CANCELLED' | 'REJECTED';

export type FarmerListing = {
  id: string;
  productId: string;
  title: string;
  description: string | null;
  originalQuantity: number;
  availableQuantity: number;
  unit: ListingUnit;
  pricePerUnit: number;
  region: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
};

export type CatalogProduct = { id: string; name: string; unit: ListingUnit };
export type CatalogCategory = { id: string; name: string; products: CatalogProduct[] };
export type FarmerOrder = {
  id: string;
  status: string;
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  buyer: { id: string; fullName: string };
  items: Array<{
    id: string;
    listingId: string;
    productName: string;
    listingTitle: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type FarmerTransportOffer = {
  id: string; status: string; offeredPrice: number; createdAt: string;
  transporter: { id: string; fullName: string };
  vehicle: { id: string; type: string; plateNumber: string };
};

export type FarmerTransportOffers = {
  shipment: null | { id: string; status: string };
  offers: FarmerTransportOffer[];
};

export type FarmerSalesInsights = {
  products: Array<{ productId: string; productName: string; unit: ListingUnit;
    quantity: string; revenue: string; orderCount: number }>;
  currency: 'UZS';
};

export type ListingInput = {
  productId: string;
  title: string;
  description?: string | null;
  quantity: number;
  unit: ListingUnit;
  pricePerUnit: number;
  region: string;
  district: string;
  latitude?: number | null;
  longitude?: number | null;
};

export const farmerApi = {
  listings: () => apiRequest<FarmerListing[]>('/listings/my'),
  salesInsights: () => apiRequest<FarmerSalesInsights>('/listings/sales-insights'),
  listing: (id: string) => apiRequest<FarmerListing>(`/listings/${encodeURIComponent(id)}`),
  catalog: () => apiRequest<{ categories: CatalogCategory[] }>('/listings/catalog'),
  createListing: (input: ListingInput) => apiRequest<FarmerListing>('/listings', {
    method: 'POST', body: JSON.stringify(input),
  }),
  updateListing: (id: string, input: ListingInput) => apiRequest<FarmerListing>(
    `/listings/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) },
  ),
  cancelListing: (id: string) => apiRequest<FarmerListing>(
    `/listings/${encodeURIComponent(id)}/cancel`, { method: 'POST' },
  ),
  orders: () => apiRequest<FarmerOrder[]>('/orders/farmer'),
  transitionOrder: (id: string, action: 'CONFIRM' | 'REQUEST_TRANSPORT') => apiRequest(
    `/orders/${encodeURIComponent(id)}/actions/${action}`, { method: 'POST', body: JSON.stringify({}) },
  ),
  transportOffers: (id: string) => apiRequest<FarmerTransportOffers>(
    `/orders/${encodeURIComponent(id)}/transport-offers`,
  ),
  acceptTransportOffer: (id: string) => apiRequest(
    `/transport/offers/${encodeURIComponent(id)}/accept`, { method: 'POST', body: JSON.stringify({}) },
  ),
};
