import { apiRequest } from './api';

export type ShipmentAction = 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED';

export type TransportVehicle = {
  id: string;
  type: string;
  plateNumber: string;
  capacityKg: number;
  refrigerated: boolean;
  status: string;
};

export type CreateVehicleInput = {
  vehicle_type: 'TRUCK' | 'VAN' | 'PICKUP' | 'MOTORCYCLE' | 'TRACTOR_TRAILER';
  plate_number: string;
  capacity_kg: number;
  refrigerated: boolean;
};

export type TransportShipment = {
  shipmentId: string;
  status: string;
  order: { id: string; status: string; totalAmount: number; itemCount: number };
  load: { summary: string; requiredCapacityKg: number | null; capacityKnown: boolean };
  pickup: { region: string; district: string; latitude: number | null; longitude: number | null; time?: string | null };
  destination: { region: string; district: string; latitude: number | null; longitude: number | null; deliveredTime?: string | null };
  vehicle?: null | { id: string; type: string | null; plateNumber: string | null; capacityKg: number | null; refrigerated: boolean | null };
  acceptedPrice?: number | null;
  availableAction?: ShipmentAction | null;
  createdAt: string;
  updatedAt?: string;
};

export type TransportShipmentDetail = TransportShipment & {
  ownOffer: null | { id: string; vehicleId: string; offeredPrice: number; status: string; createdAt: string };
  events: Array<{ id: string; type: string; latitude: number | null; longitude: number | null; createdAt: string }>;
};

export type AvailableShipmentsPage = {
  data: TransportShipment[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};

export type TransportQuote = {
  shipmentId: string;
  vehicleId: string;
  vehicleType: string;
  pricingVersion: string;
  distanceKm: number;
  weightKg: number;
  approximate: boolean;
  baseFare: number;
  perRoadKm: number;
  perKg: number;
  total: number;
  currency: 'UZS';
};

export const transporterApi = {
  available: (page = 1) => apiRequest<AvailableShipmentsPage>(`/transport/available?page=${page}&page_size=12`),
  vehicles: () => apiRequest<TransportVehicle[]>('/transport/vehicles'),
  createVehicle: (input: CreateVehicleInput) => apiRequest<TransportVehicle>('/transport/vehicles', {
    method: 'POST', body: JSON.stringify(input),
  }),
  deliveries: () => apiRequest<TransportShipment[]>('/transport/deliveries'),
  shipment: (id: string) => apiRequest<TransportShipmentDetail>(`/transport/shipments/${encodeURIComponent(id)}`),
  quote: (id: string, vehicleId: string) => apiRequest<TransportQuote>(
    `/transport/shipments/${encodeURIComponent(id)}/quote?vehicle_id=${encodeURIComponent(vehicleId)}`,
  ),
  createOffer: (shipmentId: string, vehicleId: string) => apiRequest('/transport/offers', {
    method: 'POST',
    body: JSON.stringify({ shipment_id: shipmentId, vehicle_id: vehicleId }),
  }),
  transition: (shipmentId: string, action: ShipmentAction) => {
    const path = action === 'PICKED_UP' ? 'picked-up' : action === 'IN_TRANSIT' ? 'in-transit' : 'delivered';
    return apiRequest(`/shipments/${encodeURIComponent(shipmentId)}/${path}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};
