import { apiRequest } from './api';

export type AdminPage<T> = {
  data: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};

export type AdminUser = {
  id: string; phone: string; email: string | null; fullName: string; status: string; roles: string[]; createdAt: string; updatedAt: string;
};

export type AdminListing = {
  id: string; title: string; description: string | null; originalQuantity: number; availableQuantity: number;
  unit: string; pricePerUnit: number; status: string;
  location: { region: string; district: string; latitude: number | null; longitude: number | null };
  product: { id: string; name: string; category: { id: string; name: string } };
  farmer: { id: string; fullName: string; farmName: string | null };
  createdAt: string; updatedAt: string;
};

export type AdminOrder = {
  id: string; status: string; subtotal: number; deliveryFee: number; totalAmount: number; itemCount: number;
  buyer: { id: string; fullName: string }; farmer: { id: string; fullName: string };
  createdAt: string; updatedAt: string;
};

export type AdminShipment = {
  id: string; status: string; order: { id: string; status: string; totalAmount: number };
  transporter: null | { id: string; fullName: string };
  vehicle: null | { id: string; type: string; plateNumber: string | null };
  pickup: { latitude: number | null; longitude: number | null; time: string | null };
  destination: { latitude: number | null; longitude: number | null; deliveredAt: string | null };
  createdAt: string; updatedAt: string;
};

export type AdminDispute = {
  id: string; reason: string; description: string; status: string; resolution: string | null;
  order: { id: string; status: string }; openedBy: { id: string; fullName: string };
  resolvedBy: null | { id: string; fullName: string }; createdAt: string; resolvedAt: string | null;
};

export type AdminResource = 'users' | 'listings' | 'orders' | 'shipments' | 'disputes';
export type AdminRecord = AdminUser | AdminListing | AdminOrder | AdminShipment | AdminDispute;
export type AdminTurnover = { amount: string; paidOrders: number; currency: 'UZS'; demo: true };
export type AdminTurnoverAnalytics = {
  daily: Array<{ period: string; amount: string }>;
  monthly: Array<{ period: string; amount: string }>;
  breakdown: { goods: string; delivery: string; platformFee: string };
  weekly: Array<{ period: string; goods: string; delivery: string; platformFee: string }>;
  currency: 'UZS'; demo: true;
};

function query(page: number, filters: Record<string, string | undefined>, pageSize = 12) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params;
}

export const adminApi = {
  turnover: () => apiRequest<AdminTurnover>('/admin/turnover'),
  turnoverAnalytics: () => apiRequest<AdminTurnoverAnalytics>('/admin/turnover-analytics'),
  users: (page = 1, filters: { status?: string; role?: string } = {}, pageSize = 12) =>
    apiRequest<AdminPage<AdminUser>>(`/admin/users?${query(page, filters, pageSize)}`),
  banUser: (id: string) => apiRequest<{ id: string; status: 'SUSPENDED' }>(`/admin/users/${encodeURIComponent(id)}/ban`, {
    method: 'POST', body: JSON.stringify({}),
  }),
  listings: (page = 1, filters: { status?: string; region?: string } = {}, pageSize = 12) =>
    apiRequest<AdminPage<AdminListing>>(`/admin/listings?${query(page, filters, pageSize)}`),
  orders: (page = 1, filters: { status?: string } = {}, pageSize = 12) =>
    apiRequest<AdminPage<AdminOrder>>(`/admin/orders?${query(page, filters, pageSize)}`),
  shipments: (page = 1, filters: { status?: string } = {}, pageSize = 12) =>
    apiRequest<AdminPage<AdminShipment>>(`/admin/shipments?${query(page, filters, pageSize)}`),
  disputes: (page = 1, filters: { status?: string } = {}, pageSize = 12) =>
    apiRequest<AdminPage<AdminDispute>>(`/admin/disputes?${query(page, filters, pageSize)}`),
  approveListing: (id: string) => apiRequest(`/admin/listings/${encodeURIComponent(id)}/approve`, {
    method: 'POST', body: JSON.stringify({}),
  }),
  rejectListing: (id: string, reason?: string) => apiRequest(`/admin/listings/${encodeURIComponent(id)}/reject`, {
    method: 'POST', body: JSON.stringify(reason?.trim() ? { reason: reason.trim() } : {}),
  }),
};
