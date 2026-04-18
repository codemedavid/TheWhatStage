import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/queries/tenant";
import { getActionPages } from "@/lib/queries/actions";
import ActionsClient from "./ActionsClient";

export default async function ActionsPage() {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    redirect("/login");
  }

  const actionPages = await getActionPages(ctx.tenantId);

  return (
    <ActionsClient
      actionPages={actionPages.map((p) => ({
        id: p.id,
        slug: p.slug,
        type: p.type,
        title: p.title,
        published: p.published,
        createdAt: p.created_at,
      }))}
    />
  );
}
