export type Mode = "sandbox" | "live";

export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password";
  help?: string;
}

// ── payment ────────────────────────────────────────────────────────────────

export interface PaymentInitInput {
  amount: number;
  currency: string;
  orderNumber: string;
  /** where the gateway sends the customer back */
  callbackUrl: string;
  customerName: string;
  customerPhone: string;
}

export interface PaymentInitResult {
  ok: boolean;
  /** URL to send the customer to */
  redirectUrl?: string;
  /** provider's payment id/reference to persist */
  providerRef?: string;
  error?: string;
}

export interface PaymentVerifyResult {
  status: "paid" | "pending" | "failed" | "cancelled";
  amount?: number;
  providerRef?: string;
  raw?: unknown;
}

export interface PaymentProvider {
  id: string;
  name: string;
  credentialFields: CredentialField[];
  validate(creds: Record<string, string>, mode: Mode): Promise<{ ok: boolean; error?: string }>;
  init(creds: Record<string, string>, mode: Mode, input: PaymentInitInput): Promise<PaymentInitResult>;
  verify(
    creds: Record<string, string>,
    mode: Mode,
    params: Record<string, string>,
  ): Promise<PaymentVerifyResult>;
}

// ── courier ────────────────────────────────────────────────────────────────

export interface ShipmentInput {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  address: string;
  city: string;
  amountToCollect: number; // COD amount, 0 for prepaid
  itemCount: number;
  weightKg?: number;
  note?: string;
}

export interface ShipmentResult {
  ok: boolean;
  consignmentId?: string;
  trackingCode?: string;
  cost?: number;
  labelUrl?: string;
  raw?: unknown;
  error?: string;
}

export type ShipmentStatus =
  | "created"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "returned"
  | "cancelled"
  | "failed";

export interface CourierProvider {
  id: string;
  name: string;
  credentialFields: CredentialField[];
  validate(creds: Record<string, string>, mode: Mode): Promise<{ ok: boolean; error?: string }>;
  createShipment(
    creds: Record<string, string>,
    mode: Mode,
    input: ShipmentInput,
  ): Promise<ShipmentResult>;
  getStatus(
    creds: Record<string, string>,
    mode: Mode,
    consignmentId: string,
  ): Promise<{ status: ShipmentStatus; raw?: unknown }>;
}
