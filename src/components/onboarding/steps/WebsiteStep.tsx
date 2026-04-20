"use client";

import { useState } from "react";

interface WebsiteStepProps {
  websiteUrl: string;
  onNext: (data: { websiteUrl: string }) => void;
  onBack: () => void;
}

export default function WebsiteStep({ websiteUrl: initial, onNext, onBack }: WebsiteStepProps) {
  const [websiteUrl, setWebsiteUrl] = useState(initial);
  const [error, setError] = useState("");

  function validate(url: string): boolean {
    if (!url) return true;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = websiteUrl.trim();
    if (trimmed && !validate(trimmed)) {
      setError("Please enter a valid URL (e.g., https://yourbusiness.com)");
      return;
    }
    onNext({ websiteUrl: trimmed });
  }

  function handleSkip() {
    onNext({ websiteUrl: "" });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Got a website? We'll learn from it.</h2>
        <p className="text-sm text-muted-foreground">
          If you have a website, we'll scan it to give your bot real knowledge about your products, services, and brand.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="websiteUrl" className="text-sm font-medium">
          Website URL
        </label>
        <input
          id="websiteUrl"
          type="url"
          value={websiteUrl}
          onChange={(e) => {
            setWebsiteUrl(e.target.value);
            setError("");
          }}
          placeholder="https://yourbusiness.com"
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          No website? No problem — we'll generate knowledge from what you told us.
        </p>
      </div>

      <div className="flex justify-end gap-3 mt-2">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm rounded-md border">
          Back
        </button>
        <button type="button" onClick={handleSkip} className="px-4 py-2 text-sm rounded-md border opacity-70">
          Skip
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground"
        >
          Continue
        </button>
      </div>
    </form>
  );
}
