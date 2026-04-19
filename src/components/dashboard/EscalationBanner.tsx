import { Bot, AlertTriangle, Pause, Play } from "lucide-react";
import Button from "@/components/ui/Button";

interface EscalationBannerProps {
  needsHuman: boolean;
  botPausedAt: string | null;
  onResume: () => void;
}

export default function EscalationBanner({ needsHuman, botPausedAt, onResume }: EscalationBannerProps) {
  if (botPausedAt) {
    return (
      <div className="flex items-center justify-between border-b border-blue-200 bg-blue-50 px-4 py-2">
        <div className="flex items-center gap-2">
          <Pause className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">Bot paused — you&apos;re in control</span>
        </div>
        <Button variant="secondary" onClick={onResume}>
          <Play className="h-3 w-3" />
          Resume Bot
        </Button>
      </div>
    );
  }

  if (needsHuman) {
    return (
      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-800">Waiting for human</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-4 py-2">
      <Bot className="h-4 w-4 text-green-600" />
      <span className="text-sm font-medium text-green-800">Bot is active</span>
    </div>
  );
}
