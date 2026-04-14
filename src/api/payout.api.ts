/**
 * @file: src/api/payout.api.ts
 * @description: API для вывода средств.
 */

import { apiGet, apiPost } from './client';

export interface PayoutMethod {
  id: string;
  name: string;
  type: string;
  description: string | null;
  minAmount: number;
  maxAmount: number;
  commission: number;
}

export interface PayoutRequest {
  id: string;
  amount: number;
  commission: number;
  netAmount: number;
  status: string;
  requisites: string | null;
  createdAt: string;
  payoutMethod: { name: string };
}

export interface PayoutData {
  balance: number;
  methods: PayoutMethod[];
  requests: PayoutRequest[];
}

export async function getPayoutData(): Promise<PayoutData> {
  const res = await apiGet<{ data: PayoutData }>('driver/payout');
  return res.data;
}

export async function createPayoutRequest(data: {
  payoutMethodId: string;
  amount: number;
  requisites: string;
  comment?: string;
}): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>('driver/payout', data);
}
