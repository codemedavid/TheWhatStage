"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  GripVertical,
  UserPlus,
  AlertTriangle,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";

interface TenantInfo {
  name: string;
  slug: string;
  businessType: string;
  botGoal: string;
  fbPageId: string | null;
}

interface StageInfo {
  id: string;
  name: string;
  color: string;
  orderIndex: number;
}

interface MemberInfo {
  userId: string;
  role: "owner" | "admin" | "agent";
  createdAt: string;
}

const BUSINESS_TYPES = [
  { value: "ecommerce", label: "E-Commerce" },
  { value: "real_estate", label: "Real Estate" },
  { value: "digital_product", label: "Digital Product" },
  { value: "services", label: "Services" },
];

const BOT_GOALS = [
  { value: "qualify_leads", label: "Qualify Leads" },
  { value: "sell", label: "Sell" },
  { value: "understand_intent", label: "Understand Intent" },
  { value: "collect_lead_info", label: "Collect Lead Info" },
];

const STAGE_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#3b82f6",
  "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6",
];

export default function SettingsClient({
  tenant,
  stages: initialStages,
  members,
}: {
  tenant: TenantInfo | null;
  stages: StageInfo[];
  members: MemberInfo[];
}) {
  const [stages, setStages] = useState(initialStages);
  const [showInvite, setShowInvite] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const addStage = () => {
    setStages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        name: "",
        color: STAGE_COLORS[prev.length % STAGE_COLORS.length],
        orderIndex: prev.length,
      },
    ]);
  };

  const removeStage = (id: string) => {
    setStages((prev) => prev.filter((s) => s.id !== id));
  };

  const updateStage = (id: string, updates: Partial<StageInfo>) => {
    setStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  if (!tenant) return null;

  const inputClass =
    "w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]";

  return (
    <div className="p-6 pt-14 md:pt-6">
      <h1 className="mb-6 text-2xl font-semibold text-[var(--ws-text-primary)]">
        Settings
      </h1>

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Workspace */}
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-medium text-[var(--ws-text-tertiary)]">
            Workspace
          </h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">Name</label>
              <input type="text" defaultValue={tenant.name} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">Subdomain</label>
              <div className="flex items-center gap-0">
                <span className="rounded-l-lg border border-r-0 border-[var(--ws-border-strong)] bg-[var(--ws-page)] px-3 py-2 text-sm text-[var(--ws-text-muted)]">
                  https://
                </span>
                <input type="text" defaultValue={tenant.slug} disabled className="flex-1 border border-[var(--ws-border-strong)] bg-[var(--ws-border-subtle)] px-3 py-2 text-sm text-[var(--ws-text-tertiary)] outline-none" />
                <span className="rounded-r-lg border border-l-0 border-[var(--ws-border-strong)] bg-[var(--ws-page)] px-3 py-2 text-sm text-[var(--ws-text-muted)]">
                  .whatstage.app
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">Business Type</label>
                <select defaultValue={tenant.businessType} className={inputClass}>
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt.value} value={bt.value}>{bt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">Bot Goal</label>
                <select defaultValue={tenant.botGoal} className={inputClass}>
                  {BOT_GOALS.map((bg) => (
                    <option key={bg.value} value={bg.value}>{bg.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="primary">Save Changes</Button>
            </div>
          </div>
        </Card>

        {/* Facebook — moved to Integrations */}
        <Card className="p-6">
          <h2 className="mb-2 text-sm font-medium text-[var(--ws-text-tertiary)]">Facebook Pages</h2>
          <p className="mb-4 text-xs text-[var(--ws-text-muted)]">
            Manage your connected Facebook Pages from the Integrations page.
          </p>
          <a
            href="/app/integrations"
            className="text-sm font-medium text-[var(--ws-accent)] hover:underline"
          >
            Go to Integrations →
          </a>
        </Card>

        {/* Stages */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-[var(--ws-text-tertiary)]">Pipeline Stages</h2>
            <button
              onClick={addStage}
              className="flex items-center gap-1 text-sm text-[var(--ws-text-tertiary)] hover:text-[var(--ws-text-primary)]"
            >
              <Plus className="h-4 w-4" />
              Add Stage
            </button>
          </div>
          <div className="space-y-2">
            {stages.map((stage) => (
              <div
                key={stage.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--ws-border)] bg-white p-3"
              >
                <GripVertical className="h-4 w-4 text-[var(--ws-text-faint)]" />
                <input
                  type="color"
                  value={stage.color}
                  onChange={(e) => updateStage(stage.id, { color: e.target.value })}
                  className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                />
                <input
                  type="text"
                  value={stage.name}
                  onChange={(e) => updateStage(stage.id, { name: e.target.value })}
                  placeholder="Stage name"
                  className="flex-1 bg-transparent text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none"
                />
                <button
                  onClick={() => removeStage(stage.id)}
                  className="text-[var(--ws-text-muted)] hover:text-[var(--ws-danger)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* Team */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-[var(--ws-text-tertiary)]">Team Members</h2>
            <button
              onClick={() => setShowInvite(!showInvite)}
              className="flex items-center gap-1 text-sm text-[var(--ws-text-tertiary)] hover:text-[var(--ws-text-primary)]"
            >
              <UserPlus className="h-4 w-4" />
              Invite
            </button>
          </div>

          {showInvite && (
            <div className="mb-4 flex items-end gap-2 rounded-lg border border-[var(--ws-border)] bg-[var(--ws-page)] p-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-[var(--ws-text-muted)]">Email</label>
                <input
                  type="email"
                  placeholder="team@example.com"
                  className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ws-text-muted)]">Role</label>
                <select className="rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none">
                  <option value="admin">Admin</option>
                  <option value="agent">Agent</option>
                </select>
              </div>
              <Button variant="primary">Send Invite</Button>
            </div>
          )}

          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between rounded-lg border border-[var(--ws-border)] bg-white p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ws-accent-light)] text-xs font-medium text-[var(--ws-accent)]">
                    U
                  </div>
                  <span className="font-mono text-sm text-[var(--ws-text-secondary)]">
                    {member.userId.slice(0, 8)}...
                  </span>
                </div>
                <Badge
                  variant={
                    member.role === "owner" ? "success" : member.role === "admin" ? "default" : "muted"
                  }
                >
                  {member.role}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200 p-6">
          <h2 className="mb-2 text-sm font-medium text-[var(--ws-danger)]">Danger Zone</h2>
          <p className="mb-4 text-xs text-[var(--ws-text-muted)]">
            Permanently delete this workspace and all its data. This cannot be undone.
          </p>
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            Delete Workspace
          </Button>
        </Card>
      </div>

      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowDeleteConfirm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-sm p-6 shadow-[var(--ws-shadow-lg)]">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-full bg-[var(--ws-danger-light)] p-2">
                  <AlertTriangle className="h-5 w-5 text-[var(--ws-danger)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--ws-text-primary)]">
                  Delete Workspace?
                </h3>
              </div>
              <p className="mb-6 text-sm text-[var(--ws-text-tertiary)]">
                This will permanently delete{" "}
                <span className="font-medium text-[var(--ws-text-primary)]">{tenant.name}</span>{" "}
                and all associated data including leads, conversations, and workflows.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
                <Button variant="danger">Delete Forever</Button>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
