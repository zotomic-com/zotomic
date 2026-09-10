/** Admin-assistant capability names + labels. Client-safe (no imports). */

export type AdminCapability = "media" | "files" | "git" | "git_merge" | "sql" | "deploy";

export interface AssistantCaps {
  media: boolean;
  files: boolean;
  git: boolean;
  git_merge: boolean;
  sql: boolean;
  deploy: boolean;
}

export const CAP_LABEL: Record<AdminCapability, string> = {
  media: "Understand images, voice & video",
  files: "Read & write the shared workspace",
  git: "Open a branch + pull request",
  git_merge: "Merge a pull request (→ production)",
  sql: "Run SQL migrations on the database",
  deploy: "Trigger a Vercel deployment",
};
