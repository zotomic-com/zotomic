import type { PaymentProvider } from "../types";

/** Structured stubs — the flow is wired, the API calls aren't implemented yet.
 *  validate() returns a clear "not available" so the UI can show it. */
function stub(id: string, name: string, fields: PaymentProvider["credentialFields"]): PaymentProvider {
  const notReady = { ok: false as const, error: `${name} is not available yet — coming soon.` };
  return {
    id,
    name,
    credentialFields: fields,
    async validate() {
      return notReady;
    },
    async init() {
      return { ok: false, error: notReady.error };
    },
    async verify() {
      return { status: "failed" };
    },
  };
}

export const nagad = stub("nagad", "Nagad", [
  { key: "merchant_id", label: "Merchant ID", type: "text" },
  { key: "public_key", label: "Merchant Public Key", type: "password" },
  { key: "private_key", label: "Merchant Private Key", type: "password" },
]);

export const sslcommerz = stub("sslcommerz", "SSLCommerz", [
  { key: "store_id", label: "Store ID", type: "text" },
  { key: "store_password", label: "Store Password", type: "password" },
]);
