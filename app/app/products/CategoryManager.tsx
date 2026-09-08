"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Pencil, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createCategory, deleteCategory, renameCategory, reorderCategory } from "./category-actions";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  sort: number;
  productCount: number;
}

export function CategoryManager({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast(res.error, "error");
      else {
        router.refresh();
      }
    });

  return (
    <Modal open={open} onClose={onClose} title="Product categories">
      <div className="space-y-3">
        <form
          className="flex gap-2"
          action={() =>
            run(async () => {
              const r = await createCategory(newName);
              if ("ok" in r) setNewName("");
              return r;
            })
          }
        >
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category name" />
          <Button type="submit" disabled={pending || newName.trim().length < 2}>
            Add
          </Button>
        </form>

        {categories.length === 0 ? (
          <p className="text-sm text-fg-subtle">No categories yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-sm border border-border">
            {categories.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                {editId === c.id ? (
                  <>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 flex-1" />
                    <button
                      className="text-primary"
                      onClick={() =>
                        run(async () => {
                          const r = await renameCategory(c.id, editName);
                          if ("ok" in r) setEditId(null);
                          return r;
                        })
                      }
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button className="text-fg-subtle" onClick={() => setEditId(null)}>
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-fg">{c.name}</span>
                    <span className="text-xs text-fg-subtle">{c.productCount} product{c.productCount === 1 ? "" : "s"}</span>
                    <button
                      className="text-fg-subtle hover:text-fg disabled:opacity-30"
                      disabled={i === 0 || pending}
                      onClick={() => run(() => reorderCategory(c.id, "up"))}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      className="text-fg-subtle hover:text-fg disabled:opacity-30"
                      disabled={i === categories.length - 1 || pending}
                      onClick={() => run(() => reorderCategory(c.id, "down"))}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      className="text-fg-subtle hover:text-fg"
                      onClick={() => {
                        setEditId(c.id);
                        setEditName(c.name);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="text-fg-subtle hover:text-danger"
                      onClick={() => {
                        if (window.confirm(`Delete "${c.name}"? Its ${c.productCount} product(s) become Uncategorised.`))
                          run(() => deleteCategory(c.id));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-fg-subtle">
          Deleting a category never deletes products — they just show as Uncategorised until you re-assign them.
        </p>
      </div>
    </Modal>
  );
}
