"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { addTask, toggleTask } from "./actions";

export interface Task {
  id: string;
  title: string;
  priority: string;
  status: string;
  source: string;
}

const TONE = { high: "danger", medium: "warning", low: "neutral" } as const;

export function TasksClient({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");

  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const fd = new FormData();
    fd.set("title", title);
    fd.set("priority", priority);
    start(async () => {
      await addTask(fd);
      setTitle("");
      router.refresh();
    });
  };

  const toggle = (id: string, done: boolean) =>
    start(async () => {
      await toggleTask(id, done);
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 sm:max-w-md"
        />
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-28">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </Select>
        <Button type="submit" disabled={pending}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      {open.length === 0 && done.length === 0 ? (
        <EmptyState
          title="No tasks"
          description="Add tasks here, or let your weekly report create them from its recommendations."
        />
      ) : (
        <div className="card divide-y divide-border">
          {open.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={false}
                onChange={() => toggle(t.id, true)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              <span className="flex-1 text-sm text-fg">{t.title}</span>
              {t.source === "assistant" && <Badge tone="primary">assistant</Badge>}
              <Badge tone={TONE[t.priority as keyof typeof TONE] ?? "neutral"}>{t.priority}</Badge>
            </label>
          ))}
          {done.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-3 px-4 py-3 opacity-60">
              <input
                type="checkbox"
                checked
                onChange={() => toggle(t.id, false)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              <span className="flex-1 text-sm text-fg line-through">{t.title}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
