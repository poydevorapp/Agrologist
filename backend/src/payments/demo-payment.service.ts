import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

type Order = { id: string; status: string; total_amount: string; subtotal: string; delivery_fee: string; platform_fee: string; payable_amount: string };
type Payment = { id: string; provider: string; provider_transaction_id: string | null; status: string; amount: string };
type Escrow = { id: string; status: string; gross_amount: string; platform_fee: string; farmer_amount: string; transporter_amount: string };
const PAYABLE = new Set(['CONFIRMED', 'TRANSPORT_PENDING', 'TRANSPORT_ASSIGNED', 'IN_TRANSIT', 'DELIVERED']);

@Injectable()
export class DemoPaymentService {
  constructor(private readonly database: DatabaseService) {}

  async pay(orderId: string, buyerId: string) {
    return this.database.transaction(async (client) => {
      const orders = await client.query<Order>(
        `SELECT id, status, total_amount, subtotal, delivery_fee,
                round(total_amount * 0.003, 2) AS platform_fee,
                total_amount + round(total_amount * 0.003, 2) AS payable_amount
         FROM orders WHERE id = $1 AND buyer_id = $2 FOR UPDATE`,
        [orderId, buyerId],
      );
      const order = orders.rows[0];
      if (!order) throw new NotFoundException('Order not found');
      const key = `demo-payment:${order.id}`;
      const paymentRows = await client.query<Payment>(
        'SELECT id, provider, provider_transaction_id, status, amount FROM payments WHERE order_id = $1 FOR UPDATE',
        [order.id],
      );
      const escrowRows = await client.query<Escrow>(
        'SELECT id, status, gross_amount, platform_fee, farmer_amount, transporter_amount FROM escrow_accounts WHERE order_id = $1 FOR UPDATE',
        [order.id],
      );
      let payment = paymentRows.rows[0];
      let escrow = escrowRows.rows[0];
      const events = await client.query<{ entry_type: string; amount: string; payment_id: string; escrow_id: string; event_key: string }>(
        'SELECT entry_type, amount, payment_id, escrow_id, event_key FROM financial_ledger WHERE order_id = $1',
        [order.id],
      );
      const conflict = () => new ConflictException('Order financial state is incompatible with demo payment');
      const legacy = payment?.status === 'PAID' && payment.amount === order.total_amount &&
        escrow?.gross_amount === order.total_amount && escrow.platform_fee === '0.00';
      const paidAmount = legacy ? order.total_amount : order.payable_amount;
      const fee = legacy ? '0.00' : order.platform_fee;
      if (paymentRows.rows.length > 1 ||
          (payment && (payment.provider !== 'DEMO' || (payment.status === 'PAID' && payment.amount !== paidAmount) ||
            (payment.provider_transaction_id !== null && payment.provider_transaction_id !== key)))) throw conflict();
      if (escrow && (escrow.gross_amount !== paidAmount || escrow.platform_fee !== fee ||
          escrow.farmer_amount !== order.subtotal || escrow.transporter_amount !== order.delivery_fee)) throw conflict();

      if (payment?.status === 'PAID') {
        // A retry must observe the complete original operation, never repair partial funding.
        const fundingEvents = events.rows.filter(event => ['BUYER_PAYMENT', 'ESCROW_FUNDED'].includes(event.entry_type));
        if (!escrow || !['LOCKED', 'FUNDED', 'RELEASED'].includes(escrow.status) ||
            payment.provider_transaction_id !== key || fundingEvents.length !== 2 ||
            !['BUYER_PAYMENT', 'ESCROW_FUNDED'].every(type => events.rows.some(event =>
              event.entry_type === type && event.event_key === `${key}:${type}` &&
              event.amount === paidAmount && event.payment_id === payment!.id &&
              event.escrow_id === escrow!.id))) throw conflict();
        if (!legacy) {
          const debit = await client.query(
            `SELECT 1 FROM demo_wallet_events WHERE user_id = $1 AND order_id = $2
             AND event_type = 'ORDER_PAYMENT' AND amount = $3 AND event_key = $4`,
            [buyerId, order.id, paidAmount, `${key}:wallet`],
          );
          if (debit.rowCount !== 1) throw conflict();
        }
        return this.response(order.id, payment, escrow);
      }
      if (!PAYABLE.has(order.status)) throw new ConflictException('Order is not payable in its current status');
      if (!Number.isFinite(Number(order.payable_amount)) || Number(order.payable_amount) <= 0 ||
          Number(order.payable_amount) > 900000000) {
        throw new ConflictException('Demo payment requires a positive order total');
      }
      if (events.rows.length || (payment && !['PENDING', 'FAILED'].includes(payment.status)) ||
          (escrow && escrow.status !== 'CREATED')) throw conflict();

      await client.query('INSERT INTO demo_wallets(user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [buyerId]);
      const wallet = (await client.query<{ balance: string }>(
        'SELECT balance FROM demo_wallets WHERE user_id = $1 FOR UPDATE', [buyerId],
      )).rows[0]!;
      if (Number(wallet.balance) < Number(order.payable_amount)) {
        throw new ConflictException('Insufficient demo balance');
      }

      if (payment) {
        payment = (await client.query<Payment>(
          "UPDATE payments SET status = 'PAID', provider_transaction_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
          [payment.id, key],
        )).rows[0]!;
        await client.query('UPDATE payments SET amount = $2 WHERE id = $1', [payment.id, order.payable_amount]);
        payment.amount = order.payable_amount;
      } else {
        payment = (await client.query<Payment>(
          "INSERT INTO payments (order_id, provider, provider_transaction_id, amount, status) VALUES ($1, 'DEMO', $2, $3, 'PAID') RETURNING *",
          [order.id, key, order.payable_amount],
        )).rows[0]!;
      }
      if (escrow) {
        escrow = (await client.query<Escrow>(
          "UPDATE escrow_accounts SET status = 'LOCKED', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
          [escrow.id],
        )).rows[0]!;
      } else {
        escrow = (await client.query<Escrow>(
          "INSERT INTO escrow_accounts (order_id, gross_amount, platform_fee, farmer_amount, transporter_amount, status) VALUES ($1, $2, $3, $4, $5, 'LOCKED') RETURNING *",
          [order.id, order.payable_amount, order.platform_fee, order.subtotal, order.delivery_fee],
        )).rows[0]!;
      }
      await client.query(
        'UPDATE demo_wallets SET balance = balance - $2::numeric, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1',
        [buyerId, order.payable_amount],
      );
      await client.query(
        `INSERT INTO demo_wallet_events(user_id, order_id, event_type, direction, amount, event_key)
         VALUES ($1, $2, 'ORDER_PAYMENT', 'DEBIT', $3, $4)`,
        [buyerId, order.id, order.payable_amount, `${key}:wallet`],
      );
      for (const type of ['BUYER_PAYMENT', 'ESCROW_FUNDED']) {
        await client.query(
          'INSERT INTO financial_ledger (order_id, payment_id, escrow_id, entry_type, amount, event_key) VALUES ($1, $2, $3, $4, $5, $6)',
          [order.id, payment.id, escrow.id, type, order.payable_amount, `${key}:${type}`],
        );
      }
      return this.response(order.id, payment, escrow);
    });
  }

  private response(orderId: string, payment: Payment, escrow: Escrow) {
    return {
      orderId,
      demo: true,
      payment: { id: payment.id, provider: 'DEMO', status: payment.status, amount: payment.amount },
      escrow: { id: escrow.id, status: escrow.status, grossAmount: escrow.gross_amount,
        platformFee: escrow.platform_fee, farmerAmount: escrow.farmer_amount, transporterAmount: escrow.transporter_amount },
    };
  }
}
