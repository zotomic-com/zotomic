"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ListPlus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { addRecommendationTask } from "@/app/app/tasks/actions";

/** "Add to tasks" on a weekly-report recommendation. */
export function AddToTasksButton({ title, impact }: { title: string; impact?: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [added, setAdded] = useState(false);

  const add = () =>
    start(async () => {
      const res = await addRecommendationTask(title, impact ?? null);
      if ("error" in res) return toast(res.error, "error");
      setAdded(true);
      toast(res.already ? "Already on your task list" : "Added to your tasks", "success");
      router.refresh();
    });

  return (
    <button
      type="button"
      onClick={add}
      disabled={pending || added}
      className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs font-medium text-fg-muted hover:border-primary hover:text-fg disabled:opacity-60"
    >
      {added ? <Check className="h-3.5 w-3.5" /> : <ListPlus className="h-3.5 w-3.5" />}
      {added ? "Added" : "Add to tasks"}
    </button>
  );
}
