"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewData, SSEMessage } from "@/lib/onboarding/generation-types";

type StepStatus = "pending" | "active" | "done" | "failed";

const GENERATION_STEPS = [
  { key: "context", label: "Building your business profile" },
  { key: "campaign", label: "Creating your campaign flow" },
  { key: "parallel", label: "Writing conversation prompts" },
  { key: "embeddings", label: "Generating knowledge base" },
  { key: "persisted", label: "Finalizing setup" },
];

interface GenerationStepProps {
  formData: Record<string, unknown>;
  onComplete: (preview: PreviewData, generationId?: string) => void;
  onError: (error: string, generationId: string) => void;
  retryGenerationId?: string;
}

export default function GenerationStep({
  formData,
  onComplete,
  onError,
  retryGenerationId,
}: GenerationStepProps) {
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>(() => {
    const initial: Record<string, StepStatus> = {};
    GENERATION_STEPS.forEach((s, i) => {
      initial[s.key] = i === 0 ? "active" : "pending";
    });
    return initial;
  });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const url = retryGenerationId
      ? "/api/onboarding/generate/retry"
      : "/api/onboarding/generate";

    const body = retryGenerationId
      ? { generationId: retryGenerationId }
      : formData;

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (response) => {
      if (!response.ok || !response.body) {
        onError("Failed to start generation", "");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const msg: SSEMessage = JSON.parse(line.slice(6));

          // Terminal completion signal — check before generic status branches
          if (msg.step === "complete" && msg.data?.preview) {
            setStepStatuses((prev) => {
              const next = { ...prev };
              GENERATION_STEPS.forEach(({ key }) => {
                if (next[key] !== "failed") next[key] = "done";
              });
              return next;
            });
            onComplete(msg.data.preview, msg.generationId);
            continue;
          }

          if (msg.status === "done") {
            setStepStatuses((prev) => {
              const next = { ...prev };
              if (next[msg.step] !== undefined) {
                next[msg.step] = "done";
              }
              const stepKeys = GENERATION_STEPS.map((s) => s.key);
              const doneIdx = stepKeys.indexOf(msg.step);
              if (doneIdx >= 0 && doneIdx + 1 < stepKeys.length) {
                const nextKey = stepKeys[doneIdx + 1];
                if (next[nextKey] === "pending") {
                  next[nextKey] = "active";
                }
              }
              return next;
            });
          } else if (msg.status === "failed") {
            setStepStatuses((prev) => {
              const next = { ...prev };
              for (const key of Object.keys(next)) {
                if (next[key] === "active") next[key] = "failed";
              }
              return next;
            });
            onError(msg.error ?? "Unknown error", msg.generationId ?? "");
          }
        }
      }
    });
  }, [formData, onComplete, onError, retryGenerationId]);

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <h2 className="text-xl font-semibold">Setting up your bot...</h2>

      <div className="w-full max-w-sm flex flex-col gap-4">
        {GENERATION_STEPS.map(({ key, label }) => {
          const status = stepStatuses[key] ?? "pending";
          return (
            <div key={key} className="flex items-center gap-3">
              <StepIndicator status={status} />
              <span
                className={
                  status === "active"
                    ? "text-foreground font-medium"
                    : status === "done"
                    ? "text-muted-foreground"
                    : status === "failed"
                    ? "text-destructive"
                    : "text-muted-foreground/50"
                }
              >
                {label}
                {status === "active" && "..."}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">This usually takes about 30 seconds</p>
    </div>
  );
}

function StepIndicator({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-sm text-white">
        ✓
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="w-6 h-6 rounded-full bg-primary animate-pulse flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-white" />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="w-6 h-6 rounded-full bg-destructive flex items-center justify-center text-sm text-white">
        ✗
      </div>
    );
  }
  return <div className="w-6 h-6 rounded-full border-2 border-muted opacity-40" />;
}
