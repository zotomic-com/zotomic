import type { CourierProvider } from "../types";

function stub(id: string, name: string, fields: CourierProvider["credentialFields"]): CourierProvider {
  const err = `${name} integration is coming soon.`;
  return {
    id,
    name,
    credentialFields: fields,
    async validate() {
      return { ok: false, error: err };
    },
    async createShipment() {
      return { ok: false, error: err };
    },
    async getStatus() {
      return { status: "created" };
    },
  };
}

export const pathao = stub("pathao", "Pathao", [
  { key: "client_id", label: "Client ID", type: "text" },
  { key: "client_secret", label: "Client Secret", type: "password" },
  { key: "username", label: "Username", type: "text" },
  { key: "password", label: "Password", type: "password" },
  { key: "store_id", label: "Store ID", type: "text" },
]);

export const redx = stub("redx", "RedX", [
  { key: "api_token", label: "API Access Token", type: "password" },
]);
