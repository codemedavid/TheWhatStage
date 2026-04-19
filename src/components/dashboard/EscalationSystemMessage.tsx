import { AlertCircle } from "lucide-react";

const REASON_LABELS: Record<string, string> = {
  low_confidence: "Bot had low confidence in its response",
  empty_response: "Bot couldn't generate a response",
  llm_decision: "Bot decided to escalate this conversation",
};

interface EscalationSystemMessageProps {
  reason: string | null;
}

export default function EscalationSystemMessage({ reason }: EscalationSystemMessageProps) {
  const label = reason
    ? REASON_LABELS[reason] ?? "Bot escalated this conversation"
    : "Bot escalated this conversation";

  return (
    <div className="mx-auto my-3 flex max-w-md items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
      <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
      <span className="text-xs font-medium text-amber-800">{label}</span>
    </div>
  );
}
