"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import ConversationList, {
  type ConversationSummary,
} from "@/components/dashboard/ConversationList";
import MessageThread, {
  type Message,
  type ThreadHeader,
} from "@/components/dashboard/MessageThread";
import EmptyState from "@/components/ui/EmptyState";

interface ConvoWithStage extends ConversationSummary {
  stageName?: string;
  stageColor?: string;
}

export default function InboxClient({
  conversations,
  messagesByConvo,
}: {
  conversations: ConvoWithStage[];
  messagesByConvo: Record<string, Message[]>;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeConvo = conversations.find((c) => c.id === activeId) ?? null;
  const activeMessages = activeId ? messagesByConvo[activeId] ?? [] : [];

  const header: ThreadHeader | null = activeConvo
    ? {
        leadName: activeConvo.leadName,
        leadPic: activeConvo.leadPic,
        stageName: activeConvo.stageName,
        stageColor: activeConvo.stageColor,
      }
    : null;

  if (conversations.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description="Conversations will appear here when leads message your Facebook Page."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 border-r border-[var(--ws-border)] bg-white">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
        />
      </div>
      <div className="flex-1 bg-white">
        <MessageThread header={header} messages={activeMessages} />
      </div>
    </div>
  );
}
