import type { Mode, PaymentInitInput, PaymentInitResult, PaymentProvider, PaymentVerifyResult } from "../types";

const BASE: Record<Mode, string> = {
  sandbox: "https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout",
  live: "https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout",
};

async function grantToken(creds: Record<string, string>, mode: Mode): Promise<string> {
  const res = await fetch(`${BASE[mode]}/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      username: creds.username ?? "",
      password: creds.password ?? "",
    },
    body: JSON.stringify({ app_key: creds.app_key, app_secret: creds.app_secret }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!data.id_token) throw new Error(data.statusMessage || data.message || "bKash token grant failed");
  return data.id_token as string;
}

async function authed(
  creds: Record<string, string>,
  mode: Mode,
  path: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const token = await grantToken(creds, mode);
  const res = await fetch(`${BASE[mode]}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: token,
      "X-APP-Key": creds.app_key ?? "",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  return res.json();
}

export const bkash: PaymentProvider = {
  id: "bkash",
  name: "bKash",
  credentialFields: [
    { key: "app_key", label: "App Key", type: "text" },
    { key: "app_secret", label: "App Secret", type: "password" },
    { key: "username", label: "Username", type: "text" },
    { key: "password", label: "Password", type: "password" },
  ],

  async validate(creds, mode) {
    try {
      await grantToken(creds, mode);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async init(creds, mode, input: PaymentInitInput): Promise<PaymentInitResult> {
    try {
      const data = await authed(creds, mode, "/create", {
        mode: "0011",
        payerReference: input.customerPhone.slice(0, 30) || input.orderNumber,
        callbackURL: input.callbackUrl,
        amount: input.amount.toFixed(2),
        currency: input.currency || "BDT",
        intent: "sale",
        merchantInvoiceNumber: input.orderNumber,
      });
      if (!data.bkashURL || !data.paymentID) {
        return { ok: false, error: (data.statusMessage as string) || "bKash could not start the payment" };
      }
      return { ok: true, redirectUrl: data.bkashURL as string, providerRef: data.paymentID as string };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async verify(creds, mode, params): Promise<PaymentVerifyResult> {
    const paymentID = params.paymentID;
    if (!paymentID) return { status: "failed" };
    try {
      // If the customer completed the flow, execute; otherwise query status.
      let data: Record<string, unknown>;
      if (params.status === "success") {
        data = await authed(creds, mode, "/execute", { paymentID });
        if (!data.transactionStatus) data = await authed(creds, mode, "/payment/status", { paymentID });
      } else {
        data = await authed(creds, mode, "/payment/status", { paymentID });
      }
      const ts = String(data.transactionStatus ?? "").toLowerCase();
      const status: PaymentVerifyResult["status"] =
        ts === "completed" ? "paid" : ts === "initiated" ? "pending" : params.status === "cancel" ? "cancelled" : "failed";
      return {
        status,
        amount: data.amount ? Number(data.amount) : undefined,
        providerRef: (data.trxID as string) ?? paymentID,
        raw: data,
      };
    } catch {
      return { status: "failed" };
    }
  },
};
