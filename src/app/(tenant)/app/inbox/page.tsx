import { redirect } from "next/navigation";
import { requireTenantContext, getStages } from "@/lib/queries/tenant";
import { getLeads } from "@/lib/queries/leads";
import { getConversations, getMessagesByConversations } from "@/lib/queries/conversations";
import InboxClient from "./InboxClient";

export default async function InboxPage() {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    redirect("/login");
  }

  const [conversations, leads, stages] = await Promise.all([
    getConversations(ctx.tenantId),
    getLeads(ctx.tenantId),
    getStages(ctx.tenantId),
  ]);

  const convoIds = conversations.map((c) => c.id);
  const allMessages = await getMessagesByConversations(convoIds);

  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const messagesByConvo = new Map<string, typeof allMessages>();
  for (const msg of allMessages) {
    const arr = messagesByConvo.get(msg.conversation_id) ?? [];
    arr.push(msg);
    messagesByConvo.set(msg.conversation_id, arr);
  }

  const convoSummaries = conversations.map((c) => {
    const lead = leadMap.get(c.lead_id);
    const msgs = messagesByConvo.get(c.id) ?? [];
    const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    return {
      id: c.id,
      leadId: c.lead_id,
      leadName: lead?.fb_name ?? null,
      leadPic: lead?.fb_profile_pic ?? null,
      lastMessage: lastMsg?.text ?? null,
      lastMessageAt: c.last_message_at,
      stageName: lead?.stage_id ? stageMap.get(lead.stage_id)?.name : undefined,
      stageColor: lead?.stage_id ? stageMap.get(lead.stage_id)?.color : undefined,
    };
  });

  const serializedMessages: Record<
    string,
    { id: string; direction: "in" | "out"; text: string | null; createdAt: string }[]
  > = {};
  for (const [convoId, msgs] of messagesByConvo) {
    serializedMessages[convoId] = msgs.map((m) => ({
      id: m.id,
      direction: m.direction,
      text: m.text,
      createdAt: m.created_at,
    }));
  }

  return (
    <InboxClient
      conversations={convoSummaries}
      messagesByConvo={serializedMessages}
    />
  );
}
