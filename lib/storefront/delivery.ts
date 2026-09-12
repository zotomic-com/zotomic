/**
 * Delivery zone pricing shared by the storefront (checkout, cart, product page,
 * assistant, llms.txt) and the owner editor.
 *
 * A store's delivery pricing is an owner-managed, ordered list of named zones
 * (e.g. "Inside Dhaka City", "Uttara (Free)", "Chattogram") each with their
 * own charge — 0 for a free zone the owner delivers to personally, any amount
 * otherwise. Anything not in the list falls back to `deliveryDefaultCharge`
 * ("Outside Dhaka / elsewhere"), which is always present so checkout always
 * has a price. BD_DIVISIONS is offered as a convenience list of names when
 * adding a zone — divisions further from Dhaka usually cost more to reach —
 * but a zone's name is free text, so an owner can also name their own local
 * free-delivery area.
 */

export const BD_DIVISIONS = [
  "Dhaka",
  "Chattogram",
  "Rajshahi",
  "Khulna",
  "Barishal",
  "Sylhet",
  "Rangpur",
  "Mymensingh",
] as const;

export interface DeliveryZone {
  id: string;
  name: string;
  charge: number;
}

export interface DeliveryChargeConfig {
  deliveryZones: DeliveryZone[];
  deliveryDefaultCharge: number;
}

export interface DeliveryCommerceConfig extends DeliveryChargeConfig {
  deliveryDefaultLabel: string;
}

/** The charge for a chosen zone id, or the store's own catch-all default if none matched. */
export function resolveDeliveryCharge(c: DeliveryChargeConfig, zoneId?: string | null): number {
  const zone = zoneId ? c.deliveryZones.find((z) => z.id === zoneId) : undefined;
  return zone ? zone.charge : c.deliveryDefaultCharge;
}

/** Human label for a chosen zone id, for storing on the order / showing to the owner. */
export function deliveryZoneName(c: DeliveryCommerceConfig, zoneId?: string | null): string {
  const zone = zoneId ? c.deliveryZones.find((z) => z.id === zoneId) : undefined;
  return zone ? zone.name : c.deliveryDefaultLabel;
}

export function newDeliveryZoneId(): string {
  return `z_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
