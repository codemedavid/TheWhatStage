"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function NewActionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const type = searchParams.get("type") || "form";

  useEffect(() => {
    async function create() {
      const res = await fetch("/api/action-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title: `Untitled ${type}` }),
      });

      if (!res.ok) {
        setError("Failed to create action page");
        return;
      }

      const { actionPage } = await res.json();
      router.replace(`/app/actions/${actionPage.id}`);
    }
    create();
  }, [type, router]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-[var(--ws-text-muted)]">Creating action page...</p>
    </div>
  );
}
