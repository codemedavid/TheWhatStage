import { redirect } from "next/navigation";
import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";
import { requireTenantContext, getTenant, getStages } from "@/lib/queries/tenant";
import { getLeads, getLeadEvents } from "@/lib/queries/leads";
import { countActiveConversations } from "@/lib/queries/conversations";
import { countActionPages } from "@/lib/queries/actions";
import StatCard from "@/components/ui/StatCard";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ActivityFeed, { type ActivityEvent } from "@/components/dashboard/ActivityFeed";
import StageBar, { type StageSegment } from "@/components/dashboard/StageBar";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardHomePage() {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    redirect("/login");
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [tenant, leads, stages, events, actionPageCount, activeConvoCount] =
    await Promise.all([
      getTenant(ctx.tenantId),
      getLeads(ctx.tenantId),
      getStages(ctx.tenantId),
      getLeadEvents(ctx.tenantId, 20),
      countActionPages(ctx.tenantId),
      countActiveConversations(ctx.tenantId),
    ]);

  const totalLeads = leads.length;
  const newThisWeek = leads.filter((l) => l.created_at >= weekAgo).length;

  const customerStage = stages.find(
    (s) => s.name.toLowerCase() === "customer"
  );
  const customerCount = customerStage
    ? leads.filter((l) => l.stage_id === customerStage.id).length
    : 0;
  const conversionRate =
    totalLeads > 0 ? Math.round((customerCount / totalLeads) * 100) : 0;

  const stageSegments: StageSegment[] = stages.map((stage) => ({
    name: stage.name,
    color: stage.color,
    count: leads.filter((l) => l.stage_id === stage.id).length,
  }));

  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const activityEvents: ActivityEvent[] = events.map((e) => {
    const lead = leadMap.get(e.lead_id);
    return {
      id: e.id,
      type: e.type,
      leadName: lead?.fb_name ?? null,
      leadPic: lead?.fb_profile_pic ?? null,
      leadId: e.lead_id,
      payload: (e.payload ?? {}) as Record<string, unknown>,
      createdAt: e.created_at,
    };
  });

  // Priority action — the most important thing for the tenant to do next
  const priority = !tenant?.fb_page_id
    ? { message: "Connect your Facebook Page to start receiving leads", href: "/app/settings", label: "Connect Page" }
    : actionPageCount === 0
    ? { message: "Create your first action page to capture leads from Messenger", href: "/app/actions", label: "Create Action Page" }
    : totalLeads === 0
    ? { message: "Your bot is ready. Send a message to your Facebook Page to test it", href: "/app/bot", label: "Test Your Bot" }
    : null;

  return (
    <div className="p-6 pt-14 md:pt-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--ws-text-primary)]">
          {getGreeting()}
        </h1>
        <p className="text-sm text-[var(--ws-text-muted)]">
          {now.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Priority Banner */}
      {priority && (
        <Card className="mb-6 flex items-center justify-between gap-4 border-[var(--ws-accent)]/20 bg-[var(--ws-accent-subtle)] p-4">
          <p className="text-sm text-[var(--ws-text-secondary)]">
            {priority.message}
          </p>
          <Link href={priority.href}>
            <Button variant="primary" className="shrink-0">
              {priority.label}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </Card>
      )}

      {/* Stats Row */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Leads" value={totalLeads} />
        <StatCard label="New This Week" value={newThisWeek} />
        <StatCard label="Active Conversations" value={activeConvoCount} />
        <StatCard label="Conversion Rate" value={`${conversionRate}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Activity Feed */}
        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium text-[var(--ws-text-tertiary)]">
            Recent Activity
          </h2>
          {activityEvents.length > 0 ? (
            <ActivityFeed events={activityEvents} />
          ) : (
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="Leads will appear here once your bot is live."
            />
          )}
        </Card>

        {/* Stage Distribution */}
        <Card className="p-4">
          <h2 className="mb-4 text-sm font-medium text-[var(--ws-text-tertiary)]">
            Pipeline
          </h2>
          {stageSegments.some((s) => s.count > 0) ? (
            <StageBar stages={stageSegments} />
          ) : (
            <p className="py-8 text-center text-sm text-[var(--ws-text-muted)]">
              No leads in pipeline yet
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
