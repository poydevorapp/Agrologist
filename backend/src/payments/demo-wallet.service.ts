import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

type Wallet = { user_id: string; balance: string };
type WalletEvent = { user_id: string; event_type: string; amount: string };
const MAX_BALANCE = 900000000;

@Injectable()
export class DemoWalletService {
  constructor(private readonly database: DatabaseService) {}

  async mine(userId: string) {
    const wallet = await this.database.transaction(async (client) => {
      await client.query('INSERT INTO demo_wallets(user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
      return (await client.query<Wallet>('SELECT user_id, balance FROM demo_wallets WHERE user_id = $1', [userId])).rows[0]!;
    });
    return this.response(wallet);
  }

  async platform() {
    const result = await this.database.query<{ balance: string }>('SELECT balance FROM demo_platform_wallet WHERE id = 1');
    return { accountNumber: 'DEMO-PLATFORM', balance: Number(result.rows[0]!.balance), currency: 'UZS', demo: true };
  }

  topUp(userId: string, amount: number, operationId: string) {
    return this.move(userId, amount, operationId, 'TOP_UP');
  }

  cashOut(userId: string, amount: number, operationId: string) {
    return this.move(userId, amount, operationId, 'CASH_OUT');
  }

  private async move(userId: string, amount: number, operationId: string, type: 'TOP_UP' | 'CASH_OUT') {
    // The card field is never sent to this API. All funds are fictional.
    const key = `demo-wallet:${operationId}`;
    return this.database.transaction(async (client) => {
      await client.query('INSERT INTO demo_wallets(user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
      const wallet = (await client.query<Wallet>(
        'SELECT user_id, balance FROM demo_wallets WHERE user_id = $1 FOR UPDATE', [userId],
      )).rows[0]!;
      const existing = (await client.query<WalletEvent>(
        'SELECT user_id, event_type, amount FROM demo_wallet_events WHERE event_key = $1', [key],
      )).rows[0];
      const formatted = amount.toFixed(2);
      if (existing) {
        if (existing.user_id !== userId || existing.event_type !== type || existing.amount !== formatted) {
          throw new ConflictException('Demo wallet operation ID was already used');
        }
        return this.response(wallet);
      }
      const next = Number(wallet.balance) + (type === 'TOP_UP' ? amount : -amount);
      if (next < 0) throw new ConflictException('Insufficient demo balance');
      if (next > MAX_BALANCE) throw new ConflictException('Demo balance cannot exceed 900,000,000 UZS');
      const updated = (await client.query<Wallet>(
        `UPDATE demo_wallets SET balance = balance ${type === 'TOP_UP' ? '+' : '-'} $2::numeric,
         updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 RETURNING user_id, balance`,
        [userId, formatted],
      )).rows[0]!;
      await client.query(
        `INSERT INTO demo_wallet_events(user_id, event_type, direction, amount, event_key)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, type, type === 'TOP_UP' ? 'CREDIT' : 'DEBIT', formatted, key],
      );
      return this.response(updated);
    });
  }

  private response(wallet: Wallet) {
    return { accountNumber: `DEMO-${wallet.user_id}`, balance: Number(wallet.balance), currency: 'UZS', demo: true };
  }
}
