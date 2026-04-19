"use client";

import { useState, useCallback } from "react";
import { MessageSquare } from "lucide-react";
import ConversationList, {
  type ConversationSummary,
} from "@/components/dashboard/ConversationList";
import MessageThread, {
  type Message,
  type ThreadHeader,
} from "@/components/dashboard/MessageThread";
import EmptyState from "@/components/ui/EmptyState";
import { useInboxPolling, type InboxConversation } from "@/hooks/useInboxPolling";

interface ConvoWithStage extends ConversationSummary {
  stageName?: string;
  stageColor?: string;
}

export default function InboxClient({
  initialConversations,
  messagesByConvo,
}: {
  initialConversations: (ConvoWithStage & {
    needsHuman?: boolean;
    botPausedAt?: string | null;
    escalationReason?: string | null;
    escalationMessageId?: string | null;
  })[];
  messagesByConvo: Record<string, Message[]>;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const { conversations: polledConversations } = useInboxPolling();

  // Merge polled escalation data into initial conversations
  const polledMap = new Map(
    polledConversations.map((c) => [c.id, c])
  );

  const conversations = initialConversations.map((c) => {
    const polled = polledMap.get(c.id);
    if (polled) {
      return {
        ...c,
        needsHuman: polled.needsHuman,
        botPausedAt: polled.botPausedAt,
        escalationReason: polled.escalationReason,
        escalationMessageId: polled.escalationMessageId,
      };
    }
    return c;
  });

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

  const handleSendWithImage = useCallback(
    async (text: string, imageUrl: string | null) => {
      if (!activeId) return;
      try {
        await fetch("/api/inbox/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: activeId,
            text: text || undefined,
            imageUrl: imageUrl || undefined,
          }),
        });
      } catch {
        // TODO: surface error to user
      }
    },
    [activeId]
  );

  const handleResume = useCallback(async () => {
    if (!activeId) return;
    try {
      await fetch("/api/inbox/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId }),
      });
    } catch {
      // TODO: surface error to user
    }
  }, [activeId]);

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
        <MessageThread
          header={header}
          messages={activeMessages}
          needsHuman={activeConvo?.needsHuman}
          botPausedAt={activeConvo?.botPausedAt}
          escalationReason={activeConvo?.escalationReason}
          escalationMessageId={activeConvo?.escalationMessageId}
          onResume={handleResume}
          onSendWithImage={handleSendWithImage}
        />
      </div>
    </div>
  );
}
