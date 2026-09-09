"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { deleteProduct } from "../actions";

export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      className="text-danger"
      onClick={() => {
        if (!window.confirm(`Delete "${name}"? Products with orders are archived instead.`)) return;
        start(async () => {
          const res = await deleteProduct(id);
          if ("error" in res) return toast(res.error, "error");
          toast("archived" in res ? "Archived (product has orders)" : "Product deleted", "success");
          router.push("/app/products");
        });
      }}
    >
      <Trash2 className="h-4 w-4" /> Delete
    </Button>
  );
}
