"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { BusinessCategory } from "@/lib/business-categories";
import { createCategoryAction, updateCategoryAction, deleteCategoryAction, reorderCategoryAction } from "../actions";

export function CategoriesEditor({ categories }: { categories: BusinessCategory[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState("");

  const refresh = () => router.refresh();

  const add = () =>
    start(async () => {
      const res = await createCategoryAction(label);
      if ("error" in res) return toast(res.error, "error");
      toast("Added", "success");
      setLabel("");
      refresh();
    });

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {categories.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2.5 px-3 py-2.5 text-sm">
            <span className={`min-w-0 flex-1 truncate font-medium ${c.enabled ? "text-fg" : "text-fg-subtle line-through"}`}>{c.label}</span>
            <span className="flex items-center gap-1 text-fg-subtle">
              <button
                onClick={() => start(async () => { await reorderCategoryAction(c.id, "up"); refresh(); })}
                disabled={pending || i === 0}
                className="disabled:opacity-30 hover:text-fg"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => start(async () => { await reorderCategoryAction(c.id, "down"); refresh(); })}
                disabled={pending || i === categories.length - 1}
                className="disabled:opacity-30 hover:text-fg"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) => start(async () => { await updateCategoryAction(c.id, { enabled: e.target.checked }); refresh(); })}
                  disabled={pending}
                  className="h-3.5 w-3.5 accent-[var(--primary)]"
                />
                shown
              </label>
              <button
                onClick={() => {
                  if (!confirm(`Remove "${c.label}"?`)) return;
                  start(async () => {
                    await deleteCategoryAction(c.id);
                    toast("Removed", "success");
                    refresh();
                  });
                }}
                disabled={pending}
                className="hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          </li>
        ))}
        {categories.length === 0 && <li className="px-3 py-3 text-xs text-fg-subtle">No categories yet.</li>}
      </ul>

      <div className="flex gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Books & Stationery" className="max-w-xs" />
        <Button size="sm" disabled={pending || !label.trim()} onClick={add}>
          <Plus className="h-4 w-4" /> Add category
        </Button>
      </div>
    </div>
  );
}
