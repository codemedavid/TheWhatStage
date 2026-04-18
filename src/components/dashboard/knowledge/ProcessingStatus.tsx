import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import Badge from "@/components/ui/Badge";

type ProcessingStatusProps = {
  status: "processing" | "ready" | "error";
  errorMessage?: string;
};

export default function ProcessingStatus({
  status,
  errorMessage,
}: ProcessingStatusProps) {
  if (status === "processing") {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <Badge variant="default">Processing</Badge>
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-[var(--ws-success)]" />
        <Badge variant="success">Ready</Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-[var(--ws-danger)]" />
        <Badge variant="danger">Error</Badge>
      </div>
      {errorMessage && (
        <p className="text-xs text-[var(--ws-text-muted)] ml-6">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
