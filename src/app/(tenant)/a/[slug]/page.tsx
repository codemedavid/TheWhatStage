import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyActionPageSignature } from "@/lib/fb/signature";
import type { Database } from "@/types/database";

type ActionPage = Database["public"]["Tables"]["action_pages"]["Row"];
type Tenant = Database["public"]["Tables"]["tenants"]["Row"];

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ psid?: string; sig?: string }>;
}

export default async function ActionPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { psid, sig } = await searchParams;
  const tenantCtx = await getTenantContext();

  if (!tenantCtx) notFound();

  const supabase = createServiceClient();

  const pageRes = await supabase
    .from("action_pages")
    .select("id, tenant_id, slug, type, title, config, published, version, created_at")
    .eq("tenant_id", tenantCtx.tenantId)
    .eq("slug", slug)
    .eq("published", true)
    .single();

  const page = pageRes.data as ActionPage | null;
  if (!page) notFound();

  // Verify PSID signature to prevent lead ID forgery
  if (!psid || !sig) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-800">{page.title}</h1>
          <p className="text-gray-500 mt-2">
            Please open this page from Messenger to continue.
          </p>
        </div>
      </div>
    );
  }

  const tenantRes = await supabase
    .from("tenants")
    .select("id, slug, name, business_type, bot_goal, fb_page_id, fb_page_token, fb_app_secret, fb_verify_token, created_at")
    .eq("id", tenantCtx.tenantId)
    .single();

  const tenant = tenantRes.data as Tenant | null;

  const sigValid = tenant?.fb_app_secret
    ? verifyActionPageSignature(psid, sig, tenant.fb_app_secret)
    : false;

  if (!sigValid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center text-red-600">
          <p>Invalid link. Please return to Messenger and tap the button again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{page.title}</h1>
        {/* Action page blocks rendered based on page.type and page.config */}
        <p className="text-gray-500 text-sm">
          Page type: <strong>{page.type}</strong>
        </p>
        <p className="text-gray-400 text-xs mt-1">Full renderer coming in Phase 3.</p>
      </div>
    </div>
  );
}
