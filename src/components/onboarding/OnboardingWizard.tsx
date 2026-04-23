"use client";

import { useReducer, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  STEP_ORDER,
  INITIAL_STATE,
  type OnboardingState,
  type OnboardingAction,
  type OnboardingStep,
  type BusinessType,
  type BotGoal,
} from "@/lib/onboarding/types";

import OnboardingProgress from "./OnboardingProgress";
import ProfileStep from "./steps/ProfileStep";
import IndustryStep from "./steps/IndustryStep";
import GoalStep from "./steps/GoalStep";
import BusinessInfoStep from "./steps/BusinessInfoStep";
import WebsiteStep from "./steps/WebsiteStep";
import GenerationStep from "./steps/GenerationStep";
import FacebookStep from "./steps/FacebookStep";
import PreviewStep from "./steps/PreviewStep";

function reducer(
  state: OnboardingState,
  action: OnboardingAction
): OnboardingState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };

    case "NEXT_STEP": {
      const idx = STEP_ORDER.indexOf(state.currentStep);
      if (idx < STEP_ORDER.length - 1) {
        return {
          ...state,
          currentStep: STEP_ORDER[idx + 1],
          direction: 1,
        };
      }
      return state;
    }

    case "PREV_STEP": {
      const idx = STEP_ORDER.indexOf(state.currentStep);
      if (idx > 0) {
        return {
          ...state,
          currentStep: STEP_ORDER[idx - 1],
          direction: -1,
        };
      }
      return state;
    }

    case "GO_TO_STEP":
      return {
        ...state,
        currentStep: action.step,
        direction:
          STEP_ORDER.indexOf(action.step) >
          STEP_ORDER.indexOf(state.currentStep)
            ? 1
            : -1,
      };

    default:
      return state;
  }
}

export default function OnboardingWizard() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("fb_connected") === "true") {
      dispatch({ type: "GO_TO_STEP", step: "preview" });
    }
    if (searchParams.get("step") === "facebook") {
      dispatch({ type: "GO_TO_STEP", step: "facebook" });
    }
  }, [searchParams]);

  // Step navigation handlers
  function handleProfileNext(patch: {
    firstName: string;
    lastName: string;
    businessName: string;
    slug: string;
  }) {
    dispatch({ type: "SET_FIELD", field: "firstName", value: patch.firstName });
    dispatch({ type: "SET_FIELD", field: "lastName", value: patch.lastName });
    dispatch({
      type: "SET_FIELD",
      field: "businessName",
      value: patch.businessName,
    });
    dispatch({ type: "SET_FIELD", field: "slug", value: patch.slug });
    dispatch({ type: "NEXT_STEP" });
  }

  function handleIndustryNext(industry: BusinessType) {
    dispatch({ type: "SET_FIELD", field: "industry", value: industry });
    dispatch({ type: "NEXT_STEP" });
  }

  function handleGoalNext(goal: BotGoal) {
    dispatch({ type: "SET_FIELD", field: "botGoal", value: goal });
    dispatch({ type: "NEXT_STEP" });
  }

  function handleBack() {
    dispatch({ type: "PREV_STEP" });
  }

  // Show error state for generation step
  if (state.currentStep === "generation" && generationError) {
    return (
      <div className="min-h-screen bg-[var(--ws-page)] flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-[var(--ws-text-primary)] mb-2">
            Oops, something went wrong
          </h2>
          <p className="text-sm text-[var(--ws-text-muted)] mb-6">
            {generationError} Your progress has been saved.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setRetryKey((k) => k + 1); setGenerationError(null); }}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground"
            >
              Retry
            </button>
            <button
              onClick={() => {
                dispatch({ type: "SET_FIELD", field: "generationId", value: "" });
                setRetryKey((k) => k + 1);
                setGenerationError(null);
              }}
              className="px-4 py-2 text-sm rounded-md border opacity-60"
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  const animClass =
    state.direction === 1
      ? "onboarding-step-forward"
      : "onboarding-step-backward";

  return (
    <div className="min-h-screen bg-[var(--ws-page)]">
      <OnboardingProgress currentStep={state.currentStep} />

      <main className="flex items-start justify-center px-4 pt-8 pb-16">
        <div className="w-full max-w-lg">
          <div key={state.currentStep} className={animClass}>
            {renderStep(state.currentStep)}
          </div>
        </div>
      </main>
    </div>
  );

  function renderStep(step: OnboardingStep) {
    switch (step) {
      case "profile":
        return (
          <ProfileStep
            data={{
              firstName: state.firstName,
              lastName: state.lastName,
              businessName: state.businessName,
              slug: state.slug,
            }}
            onNext={handleProfileNext}
          />
        );
      case "industry":
        return (
          <IndustryStep
            selected={state.industry}
            onNext={handleIndustryNext}
            onBack={handleBack}
          />
        );
      case "goal":
        return (
          <GoalStep
            selected={state.botGoal}
            industry={state.industry}
            onNext={handleGoalNext}
            onBack={handleBack}
          />
        );
      case "business-info":
        return (
          <BusinessInfoStep
            businessDescription={state.businessDescription}
            mainAction={state.mainAction}
            differentiator={state.differentiator}
            qualificationCriteria={state.qualificationCriteria}
            onNext={(data) => {
              dispatch({ type: "SET_FIELD", field: "businessDescription", value: data.businessDescription });
              dispatch({ type: "SET_FIELD", field: "mainAction", value: data.mainAction });
              dispatch({ type: "SET_FIELD", field: "differentiator", value: data.differentiator });
              dispatch({ type: "SET_FIELD", field: "qualificationCriteria", value: data.qualificationCriteria });
              dispatch({ type: "NEXT_STEP" });
            }}
            onBack={handleBack}
          />
        );
      case "website":
        return (
          <WebsiteStep
            websiteUrl={state.websiteUrl}
            onNext={(data) => {
              dispatch({ type: "SET_FIELD", field: "websiteUrl", value: data.websiteUrl });
              dispatch({ type: "NEXT_STEP" });
            }}
            onBack={handleBack}
          />
        );
      case "generation":
        return (
          <GenerationStep
            key={retryKey}
            formData={{
              businessType: state.industry,
              botGoal: state.botGoal,
              businessDescription: state.businessDescription,
              mainAction: state.mainAction,
              differentiator: state.differentiator,
              qualificationCriteria: state.qualificationCriteria,
              websiteUrl: state.websiteUrl || undefined,
              firstName: state.firstName,
              lastName: state.lastName,
              tenantName: state.businessName,
              tenantSlug: state.slug,
            }}
            retryGenerationId={state.generationId || undefined}
            onComplete={(preview, generationId) => {
              if (generationId) dispatch({ type: "SET_FIELD", field: "generationId", value: generationId });
              dispatch({ type: "SET_FIELD", field: "previewData", value: preview });
              dispatch({ type: "NEXT_STEP" });
            }}
            onError={(errorMsg, generationId) => {
              if (generationId) dispatch({ type: "SET_FIELD", field: "generationId", value: generationId });
              setGenerationError(errorMsg);
            }}
          />
        );
      case "facebook":
        return (
          <FacebookStep
            onNext={() => dispatch({ type: "NEXT_STEP" })}
            onBack={() => dispatch({ type: "PREV_STEP" })}
          />
        );
      case "preview":
        if (!state.previewData) return null;
        return <PreviewStep preview={state.previewData} />;
    }
  }
}
