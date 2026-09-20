import { AppRole } from '../authorization/authorization.types.js';

export const OrderAction = {
  CONFIRM: 'CONFIRM',
  REQUEST_TRANSPORT: 'REQUEST_TRANSPORT',
  ASSIGN_TRANSPORT: 'ASSIGN_TRANSPORT',
  START_TRANSIT: 'START_TRANSIT',
  MARK_DELIVERED: 'MARK_DELIVERED',
  COMPLETE: 'COMPLETE',
  CANCEL: 'CANCEL',
  DISPUTE: 'DISPUTE',
} as const;

export type OrderAction = (typeof OrderAction)[keyof typeof OrderAction];
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'TRANSPORT_PENDING'
  | 'TRANSPORT_ASSIGNED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

export type OrderRelation = 'BUYER' | 'FARMER' | 'PARTICIPANT' | 'ASSIGNED_TRANSPORTER' | 'ADMIN';
export type TransitionRule = {
  from: readonly OrderStatus[];
  to: OrderStatus;
  roles: readonly AppRole[];
  relation: OrderRelation;
};

export const ORDER_TRANSITIONS: Record<OrderAction, TransitionRule> = {
  CONFIRM: { from: ['PENDING'], to: 'CONFIRMED', roles: ['FARMER'], relation: 'FARMER' },
  REQUEST_TRANSPORT: {
    from: ['CONFIRMED'], to: 'TRANSPORT_PENDING', roles: ['FARMER'], relation: 'FARMER',
  },
  ASSIGN_TRANSPORT: {
    from: ['TRANSPORT_PENDING'], to: 'TRANSPORT_ASSIGNED', roles: ['ADMIN'], relation: 'ADMIN',
  },
  START_TRANSIT: {
    from: ['TRANSPORT_ASSIGNED'], to: 'IN_TRANSIT', roles: ['TRANSPORTER'], relation: 'ASSIGNED_TRANSPORTER',
  },
  MARK_DELIVERED: {
    from: ['IN_TRANSIT'], to: 'DELIVERED', roles: ['TRANSPORTER'], relation: 'ASSIGNED_TRANSPORTER',
  },
  COMPLETE: { from: ['DELIVERED'], to: 'COMPLETED', roles: ['BUYER'], relation: 'BUYER' },
  CANCEL: {
    from: ['PENDING', 'CONFIRMED'], to: 'CANCELLED', roles: ['BUYER', 'FARMER'], relation: 'PARTICIPANT',
  },
  DISPUTE: {
    from: ['DELIVERED', 'COMPLETED'], to: 'DISPUTED', roles: ['BUYER', 'FARMER'], relation: 'PARTICIPANT',
  },
};
