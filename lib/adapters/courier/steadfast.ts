import type { CourierProvider, Mode, ShipmentInput, ShipmentResult, ShipmentStatus } from "../types";

// Steadfast has one base; "sandbox" here just means the owner is testing.
const BASE = "https://portal.packzy.com/api/v1";

function headers(creds: Record<string, string>) {
  return {
    "Content-Type": "application/json",
    "Api-Key": creds.api_key ?? "",
    "Secret-Key": creds.secret_key ?? "",
  };
}

const STATUS_MAP: Record<string, ShipmentStatus> = {
  pending: "created",
  delivered_approval_pending: "in_transit",
  partial_delivered_approval_pending: "in_transit",
  cancelled_approval_pending: "in_transit",
  unknown_approval_pending: "in_transit",
  delivered: "delivered",
  partial_delivered: "delivered",
  cancelled: "cancelled",
  hold: "in_transit",
  in_review: "created",
  unknown: "failed",
};

export const steadfast: CourierProvider = {
  id: "steadfast",
  name: "Steadfast",
  credentialFields: [
    { key: "api_key", label: "API Key", type: "text" },
    { key: "secret_key", label: "Secret Key", type: "password" },
  ],

  async validate(creds) {
    try {
      const res = await fetch(`${BASE}/get_balance`, { headers: headers(creds), signal: AbortSignal.timeout(12000) });
      const data = await res.json();
      return data.status === 200 ? { ok: true } : { ok: false, error: data.message || "Invalid credentials" };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async createShipment(creds, _mode: Mode, input: ShipmentInput): Promise<ShipmentResult> {
    try {
      const res = await fetch(`${BASE}/create_order`, {
        method: "POST",
        headers: headers(creds),
        body: JSON.stringify({
          invoice: input.orderNumber,
          recipient_name: input.customerName,
          recipient_phone: input.customerPhone,
          recipient_address: `${input.address}${input.city ? ", " + input.city : ""}`,
          cod_amount: Math.max(0, Math.round(input.amountToCollect)),
          note: input.note ?? "",
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (data.status !== 200 || !data.consignment) {
        return { ok: false, error: data.message || "Steadfast rejected the order" };
      }
      return {
        ok: true,
        consignmentId: String(data.consignment.consignment_id),
        trackingCode: data.consignment.tracking_code,
        raw: data.consignment,
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async getStatus(creds, _mode, consignmentId) {
    try {
      const res = await fetch(`${BASE}/status_by_cid/${consignmentId}`, {
        headers: headers(creds),
        signal: AbortSignal.timeout(12000),
      });
      const data = await res.json();
      return { status: STATUS_MAP[data.delivery_status] ?? "created", raw: data };
    } catch {
      return { status: "created" };
    }
  },
};
