import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

type Order = { id: string; status: string; total_amount: string; subtotal: string; delivery_fee: string;
  farmer_id: string; platform_fee: string; payable_amount: string };
type Payment = { id: string; provider: string; status: string; amount: string; provider_transaction_id: string | null };
type Escrow = {
  id: string; status: string; gross_amount: string; platform_fee: string;
  farmer_amount: string; transporter_amount: string; released_at: Date | null;
};
type Event = {
  entry_type: string; amount: string; payment_id: string | null;
  escrow_id: string | null; event_key: string;
};
const cents = (value: string): bigint => BigInt(value.replace('.', ''));

@Injectable()
export class DeliveryAcceptanceService {
  constructor(private readonly database: DatabaseService) {}

  async accept(orderId: string, buyerId: string) {
    return this.database.transaction(async (client) => {
      const order = (await client.query<Order>(
        `SELECT id, status, total_amount, subtotal, delivery_fee, farmer_id,
                round(total_amount * 0.003, 2) AS platform_fee,
                total_amount + round(total_amount * 0.003, 2) AS payable_amount
         FROM orders WHERE id = $1 AND buyer_id = $2 FOR UPDATE`,
        [orderId, buyerId],
      )).rows[0];
      if (!order) throw new NotFoundException('Order not found');
      const conflict = () => new ConflictException('Order and demo escrow are not ready for delivery acceptance');
      if (!['DELIVERED', 'COMPLETED'].includes(order.status)) throw conflict();
      // Use the same lock order as demo-pay: order, payment, escrow.
      const payments = (await client.query<Payment>(
        'SELECT id, provider, status, amount, provider_transaction_id FROM payments WHERE order_id = $1 FOR UPDATE', [order.id],
      )).rows;
      let escrow = (await client.query<Escrow>(
        'SELECT id, status, gross_amount, platform_fee, farmer_amount, transporter_amount, released_at FROM escrow_accounts WHERE order_id = $1 FOR UPDATE',
        [order.id],
      )).rows[0];
      const payment = payments[0];
      const fundingKey = `demo-payment:${order.id}`;
      const legacy = payment?.amount === order.total_amount && escrow?.gross_amount === order.total_amount &&
        escrow.platform_fee === '0.00';
      const paidAmount = legacy ? order.total_amount : order.payable_amount;
      const fee = legacy ? '0.00' : order.platform_fee;
      if (payments.length !== 1 || !payment || payment.provider !== 'DEMO' || payment.status !== 'PAID' ||
          payment.provider_transaction_id !== fundingKey || payment.amount !== paidAmount ||
          !escrow || escrow.gross_amount !== paidAmount || escrow.platform_fee !== fee ||
          !Number.isFinite(Number(paidAmount)) || Number(paidAmount) <= 0 ||
          escrow.transporter_amount !== order.delivery_fee || escrow.farmer_amount !== order.subtotal) throw conflict();

      const events = (await client.query<Event>(
        'SELECT entry_type, amount, payment_id, escrow_id, event_key FROM financial_ledger WHERE order_id = $1',
        [order.id],
      )).rows;
      const matches = (type: string, amount: string, key: string) => events.filter(event =>
        event.entry_type === type && event.amount === amount && event.event_key === key &&
        event.payment_id === payment.id && event.escrow_id === escrow!.id).length === 1;
      if (!['BUYER_PAYMENT', 'ESCROW_FUNDED'].every(type =>
        matches(type, paidAmount, `${fundingKey}:${type}`))) throw conflict();
      const payouts = [
        { type: 'PLATFORM_FEE', amount: escrow.platform_fee },
        { type: 'FARMER_PAYOUT', amount: escrow.farmer_amount },
        { type: 'TRANSPORTER_PAYOUT', amount: escrow.transporter_amount },
      ];
      // Zero allocations are not financial movements; ledger CHECK requires amount > 0.
      const positive = payouts.filter(payout => cents(payout.amount) > 0n);
      const keyFor = (type: string) => `demo-release:${escrow!.id}:${type}`;
      if (order.status === 'COMPLETED') {
        if (escrow.status !== 'RELEASED' || !escrow.released_at ||
            events.length !== 2 + positive.length ||
            !positive.every(payout => matches(payout.type, payout.amount, keyFor(payout.type)))) throw conflict();
      } else {
        if (!['LOCKED', 'FUNDED'].includes(escrow.status) || escrow.released_at || events.length !== 2) throw conflict();
        const transporter = (await client.query<{ transporter_id: string | null }>(
          'SELECT transporter_id FROM shipments WHERE order_id = $1', [order.id],
        )).rows[0]?.transporter_id ?? null;
        if (cents(escrow.transporter_amount) > 0n && !transporter) throw conflict();
        const recipients = [order.farmer_id, ...(transporter && cents(escrow.transporter_amount) > 0n ? [transporter] : [])]
          .sort();
        for (const userId of recipients) {
          await client.query('INSERT INTO demo_wallets(user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
          await client.query('SELECT user_id FROM demo_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        }
        for (const payout of [
          { type: 'FARMER_PAYOUT', amount: escrow.farmer_amount, userId: order.farmer_id },
          { type: 'TRANSPORTER_PAYOUT', amount: escrow.transporter_amount, userId: transporter },
        ]) {
          if (cents(payout.amount) <= 0n) continue;
          const credit = await client.query(
            `UPDATE demo_wallets SET balance = balance + $2::numeric, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND balance + $2::numeric <= 900000000`,
            [payout.userId, payout.amount],
          );
          if (credit.rowCount !== 1) throw new ConflictException('Recipient demo wallet would exceed 900,000,000 UZS');
          await client.query(
            `INSERT INTO demo_wallet_events(user_id, order_id, event_type, direction, amount, event_key)
             VALUES ($1, $2, $3, 'CREDIT', $4, $5)`,
            [payout.userId, order.id, payout.type, payout.amount, `demo-release:${escrow.id}:${payout.type}:wallet`],
          );
        }
        if (cents(escrow.platform_fee) > 0n) {
          const credit = await client.query(
            `UPDATE demo_platform_wallet SET balance = balance + $1::numeric, updated_at = CURRENT_TIMESTAMP
             WHERE id = 1 AND balance + $1::numeric <= 900000000`, [escrow.platform_fee],
          );
          if (credit.rowCount !== 1) throw new ConflictException('Platform demo wallet would exceed 900,000,000 UZS');
          await client.query(
            `INSERT INTO demo_wallet_events(platform_id, order_id, event_type, direction, amount, event_key)
             VALUES (1, $1, 'PLATFORM_FEE', 'CREDIT', $2, $3)`,
            [order.id, escrow.platform_fee, `demo-release:${escrow.id}:PLATFORM_FEE:wallet`],
          );
        }
        await client.query("SELECT set_config('app.changed_by', $1, true)", [buyerId]);
        await client.query("SELECT set_config('app.status_note', $1, true)", ['Buyer accepted delivery; demo escrow released']);
        await client.query(
          "UPDATE orders SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [order.id],
        );
        escrow = (await client.query<Escrow>(
          "UPDATE escrow_accounts SET status = 'RELEASED', released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
          [escrow.id],
        )).rows[0]!;
        for (const payout of positive) {
          await client.query(
            'INSERT INTO financial_ledger (order_id, payment_id, escrow_id, entry_type, amount, event_key) VALUES ($1, $2, $3, $4, $5, $6)',
            [order.id, payment.id, escrow.id, payout.type, payout.amount, keyFor(payout.type)],
          );
        }
      }
      // Existing trigger must have recorded the completion in this same transaction.
      const history = await client.query(
        "SELECT id FROM order_status_history WHERE order_id = $1 AND previous_status = 'DELIVERED' AND new_status = 'COMPLETED' AND changed_by = $2",
        [order.id, buyerId],
      );
      if (history.rowCount !== 1) throw conflict();
      return {
        orderId: order.id, status: 'COMPLETED', demo: true,
        escrow: { id: escrow.id, status: escrow.status, grossAmount: escrow.gross_amount, releasedAt: escrow.released_at!.toISOString() },
        allocations: {
          platformFee: escrow.platform_fee, farmerPayout: escrow.farmer_amount, transporterPayout: escrow.transporter_amount,
        },
      };
    });
  }
}
