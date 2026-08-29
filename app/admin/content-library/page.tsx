import { requireAdmin } from "@/lib/admin-server";
import { PagePlaceholder } from "@/components/PagePlaceholder";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdmin();
  return <PagePlaceholder title="Content Library" phase="Phase 2 (P2)" />;
}
