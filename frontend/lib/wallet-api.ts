import { apiRequest } from './api';

export type DemoWallet = { accountNumber: string; balance: number; currency: 'UZS'; demo: true };

export const walletApi = {
  mine: () => apiRequest<DemoWallet>('/wallet'),
  platform: () => apiRequest<DemoWallet>('/admin/platform-wallet'),
  topUp: (amount: number, operationId: string) => apiRequest<DemoWallet>('/wallet/demo-top-up', {
    method: 'POST', body: JSON.stringify({ amount, operationId }),
  }),
  cashOut: (amount: number, operationId: string) => apiRequest<DemoWallet>('/wallet/demo-cash-out', {
    method: 'POST', body: JSON.stringify({ amount, operationId }),
  }),
};
