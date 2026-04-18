"use client";

import { useState } from "react";
import { generateSlug, validateSlug } from "@/lib/utils/slug";
import Button from "@/components/ui/Button";

interface ProfileStepProps {
  data: {
    firstName: string;
    lastName: string;
    businessName: string;
    slug: string;
  };
  onNext: (patch: {
    firstName: string;
    lastName: string;
    businessName: string;
    slug: string;
  }) => void;
}

export default function ProfileStep({ data, onNext }: ProfileStepProps) {
  const [firstName, setFirstName] = useState(data.firstName);
  const [lastName, setLastName] = useState(data.lastName);
  const [businessName, setBusinessName] = useState(data.businessName);
  const [slug, setSlug] = useState(data.slug);
  const [slugError, setSlugError] = useState<string | null>(null);

  function handleBusinessNameChange(value: string) {
    setBusinessName(value);
    const generated = generateSlug(value);
    setSlug(generated);
    setSlugError(null);
  }

  function handleSlugChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(cleaned);
    setSlugError(null);
  }

  function handleContinue() {
    const err = validateSlug(slug);
    if (err) {
      setSlugError(err);
      return;
    }
    onNext({ firstName, lastName, businessName, slug });
  }

  const canContinue = firstName.trim().length > 0 && businessName.trim().length > 0 && slug.length >= 3;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-[var(--ws-text-primary)]">
          Welcome to WhatStage
        </h2>
        <p className="text-sm text-[var(--ws-text-tertiary)] mt-1">
          Let&apos;s set up your account
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-[var(--ws-text-tertiary)] uppercase tracking-wider mb-1.5">
            First name
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="John"
            className="w-full px-3 py-2.5 text-sm bg-white border border-[var(--ws-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ws-focus-ring)] focus:border-[var(--ws-accent)] transition-colors text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--ws-text-tertiary)] uppercase tracking-wider mb-1.5">
            Last name
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Doe"
            className="w-full px-3 py-2.5 text-sm bg-white border border-[var(--ws-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ws-focus-ring)] focus:border-[var(--ws-accent)] transition-colors text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)]"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--ws-text-tertiary)] uppercase tracking-wider mb-1.5">
          Business name
        </label>
        <input
          type="text"
          value={businessName}
          onChange={(e) => handleBusinessNameChange(e.target.value)}
          placeholder="Acme Corp"
          className="w-full px-3 py-2.5 text-sm bg-white border border-[var(--ws-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ws-focus-ring)] focus:border-[var(--ws-accent)] transition-colors text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)]"
        />
      </div>

      {slug && (
        <div className="onboarding-scale-in">
          <label className="block text-xs font-medium text-[var(--ws-text-tertiary)] uppercase tracking-wider mb-1.5">
            Your workspace URL
          </label>
          <div className="flex items-center border border-[var(--ws-border)] rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-[var(--ws-focus-ring)] bg-white">
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              className="flex-1 px-3 py-2.5 text-sm focus:outline-none text-[var(--ws-text-primary)]"
            />
            <span className="px-3 py-2.5 bg-[var(--ws-page)] text-[var(--ws-text-muted)] text-sm border-l border-[var(--ws-border)]">
              .whatstage.app
            </span>
          </div>
          {slugError && (
            <p className="mt-1.5 text-xs text-[var(--ws-danger)]">{slugError}</p>
          )}
        </div>
      )}

      <Button
        onClick={handleContinue}
        disabled={!canContinue}
        className="w-full mt-4"
      >
        Continue
      </Button>
    </div>
  );
}
