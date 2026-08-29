"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { money } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { createManualOrder } from "./actions";

interface V {
  id: string;
  name: string;
  price: number;
  salePrice: number | null;
}
interface P {
  id: string;
  name: string;
  price: number;
  salePrice: number | null;
  variants: V[];
}

export function NewOrderClient({ products, currency }: { products: P[]; currency: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [cust, setCust] = useState({ name: "", phone: "", email: "", city: "", address: "", note: "" });
  const [lines, setLines] = useState<{ productId: string; variantId?: string; qty: number }[]>([]);
  const [shipping, setShipping] = useState(60);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "bkash" | "other">("cod");
  const [paymentStatus, setPaymentStatus] = useState<"unpaid" | "paid">("unpaid");
  const [status, setStatus] = useState("confirmed");

  const eff = (price: number, sale: number | null) =>
    sale != null && sale < price ? sale : price;
  const priceOf = (productId: string, variantId?: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return 0;
    if (variantId) {
      const v = p.variants.find((x) => x.id === variantId);
      if (v) return eff(v.price, v.salePrice);
    }
    return eff(p.price, p.salePrice);
  };
  const subtotal = lines.reduce((s, l) => s + priceOf(l.productId, l.variantId) * (l.qty || 0), 0);
  const total = Math.max(0, subtotal + shipping - discount);

  const addLine = () => setLines((l) => [...l, { productId: products[0]?.id ?? "", qty: 1 }]);
  const setLine = (i: number, patch: Partial<{ productId: string; variantId?: string; qty: number }>) =>
    setLines((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = () =>
    start(async () => {
      const res = await createManualOrder({
        customer: cust,
        items: lines
          .filter((l) => l.productId && l.qty > 0)
          .map((l) => ({ productId: l.productId, qty: l.qty, variantId: l.variantId ?? null })),
        shipping,
        discount,
        paymentMethod,
        paymentStatus,
        status,
      });
      if ("error" in res) toast(res.error, "error");
      else {
        toast("Order created", "success");
        router.push(`/app/orders/${res.orderId}`);
      }
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} />
            </Field>
            <Field label="Email (optional)">
              <Input value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} />
            </Field>
            <Field label="City">
              <Input value={cust.city} onChange={(e) => setCust({ ...cust, city: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address">
                <Input value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Note (optional)">
                <Input value={cust.note} onChange={(e) => setCust({ ...cust, note: e.target.value })} />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
            <Button size="sm" variant="outline" onClick={addLine} disabled={!products.length}>
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </CardHeader>
          <CardBody className="space-y-2">
            {lines.length === 0 && <p className="text-sm text-fg-subtle">No items yet.</p>}
            {lines.map((l, i) => {
              const prod = products.find((p) => p.id === l.productId);
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select
                    value={l.productId}
                    onChange={(e) => setLine(i, { productId: e.target.value, variantId: undefined })}
                    className="min-w-[160px] flex-1"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {money(priceOf(p.id), currency)}
                      </option>
                    ))}
                  </Select>
                  {prod && prod.variants.length > 0 && (
                    <Select
                      value={l.variantId ?? ""}
                      onChange={(e) => setLine(i, { variantId: e.target.value || undefined })}
                      className="min-w-[130px]"
                    >
                      <option value="">Choose option…</option>
                      {prod.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} — {money(priceOf(prod.id, v.id), currency)}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Input
                    type="number"
                    min={1}
                    value={l.qty}
                    onChange={(e) => setLine(i, { qty: Number(e.target.value) || 1 })}
                    className="w-20"
                  />
                  <button onClick={() => setLines((x) => x.filter((_, j) => j !== i))} className="text-fg-subtle hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-fg-muted">Subtotal</span>
            <span>{money(subtotal, currency)}</span>
          </div>
          <Field label={`Shipping (${currency})`}>
            <Input type="number" min={0} value={shipping} onChange={(e) => setShipping(Number(e.target.value) || 0)} />
          </Field>
          <Field label={`Discount (${currency})`}>
            <Input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} />
          </Field>
          <div className="flex justify-between border-t border-border pt-2 font-bold">
            <span>Total</span>
            <span>{money(total, currency)}</span>
          </div>
          <Field label="Order status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {["pending", "confirmed", "processing", "shipped", "delivered"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Payment">
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as "cod" | "bkash" | "other")}>
                <option value="cod">COD</option>
                <option value="bkash">bKash</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Paid?">
              <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as "unpaid" | "paid")}>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </Select>
            </Field>
          </div>
          <Button onClick={submit} disabled={pending || lines.length === 0} className="w-full">
            {pending ? "Creating…" : "Create order"}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
