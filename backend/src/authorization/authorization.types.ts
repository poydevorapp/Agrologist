export const APP_ROLES = ['FARMER', 'BUYER', 'TRANSPORTER', 'ADMIN'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export type AuthenticatedUser = {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  roles: AppRole[];
};

export type AuthenticatedRequest = {
  headers: { authorization?: string };
  params: Record<string, string | undefined>;
  user?: AuthenticatedUser;
};

export type OwnedResource =
  | 'SELF'
  | 'LISTING'
  | 'BUYER_ORDER'
  | 'FARMER_ORDER'
  | 'TRANSPORT_SHIPMENT'
  | 'TRANSPORT_VEHICLE';
