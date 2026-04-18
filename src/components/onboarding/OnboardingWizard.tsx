"use client";

import { useReducer, useState, useCallback } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import {
  STEP_ORDER,
  INITIAL_STATE,
  type OnboardingState,
  type OnboardingAction,
  type OnboardingStep,
  type BusinessType,
  type BotGoal,
  type BotTone,
  type ActionPageType,
} from "@/lib/onboarding/types";
import {
  getDefaultBotTone,
  getDefaultBotRules,
  getDefaultActionTypes,
} from "@/lib/onboarding/defaults";
import { buildTenantUrl } from "@/lib/auth/redirect";

import OnboardingProgress from "./OnboardingProgress";
import ProfileStep from "./steps/ProfileStep";
import IndustryStep from "./steps/IndustryStep";
import GoalStep from "./steps/GoalStep";
import BotSetupStep from "./steps/BotSetupStep";
import ActionSetupStep from "./steps/ActionSetupStep";
import FacebookStep from "./steps/FacebookStep";

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

    case "APPLY_DEFAULTS":
      return {
        ...state,
        botTone: action.defaults.botTone,
        botRules: action.defaults.botRules,
        selectedActionTypes: action.defaults.selectedActionTypes,
      };

    case "TOGGLE_RULE": {
      const rules = state.botRules.includes(action.rule)
        ? state.botRules.filter((r) => r !== action.rule)
        : [...state.botRules, action.rule];
      return { ...state, botRules: rules };
    }

    case "TOGGLE_ACTION_TYPE": {
      const types = state.selectedActionTypes.includes(action.actionType)
        ? state.selectedActionTypes.filter((t) => t !== action.actionType)
        : [...state.selectedActionTypes, action.actionType];
      return { ...state, selectedActionTypes: types };
    }

    default:
      return state;
  }
}

type SubmitPhase = "idle" | "creating" | "done";

export default function OnboardingWizard() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  // Track suggested rules for the current industry+goal combo
  const suggestedRules =
    state.industry && state.botGoal
      ? getDefaultBotRules(state.industry, state.botGoal)
      : [];

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSubmitPhase("creating");

    try {
      const response = await fetch("/api/onboarding/create-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: state.firstName,
          lastName: state.lastName,
          name: state.businessName,
          slug: state.slug,
          businessType: state.industry,
          botGoal: state.botGoal,
          botTone: state.botTone,
          botRules: state.botRules,
          customInstruction: state.customInstruction,
          actionTypes: state.selectedActionTypes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong");
        setSubmitPhase("idle");
        return;
      }

      setSubmitPhase("done");

      // Brief success state before redirect
      setTimeout(() => {
        window.location.href = buildTenantUrl(data.slug);
      }, 1500);
    } catch {
      setError("Network error. Please try again.");
      setSubmitPhase("idle");
    }
  }, [state]);

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

    // Apply smart defaults based on industry (and current goal if set)
    const tone = getDefaultBotTone(industry);
    const actions = getDefaultActionTypes(industry);
    const rules = state.botGoal
      ? getDefaultBotRules(industry, state.botGoal)
      : [];

    dispatch({
      type: "APPLY_DEFAULTS",
      defaults: { botTone: tone, botRules: rules, selectedActionTypes: actions },
    });
    dispatch({ type: "NEXT_STEP" });
  }

  function handleGoalNext(goal: BotGoal) {
    dispatch({ type: "SET_FIELD", field: "botGoal", value: goal });

    // Update rules based on the now-known goal + industry
    if (state.industry) {
      const rules = getDefaultBotRules(state.industry, goal);
      dispatch({ type: "SET_FIELD", field: "botRules", value: rules });
    }
    dispatch({ type: "NEXT_STEP" });
  }

  function handleBotSetupNext(patch: {
    botTone: BotTone;
    botRules: string[];
    customInstruction: string;
  }) {
    dispatch({ type: "SET_FIELD", field: "botTone", value: patch.botTone });
    dispatch({ type: "SET_FIELD", field: "botRules", value: patch.botRules });
    dispatch({
      type: "SET_FIELD",
      field: "customInstruction",
      value: patch.customInstruction,
    });
    dispatch({ type: "NEXT_STEP" });
  }

  function handleActionsNext(selected: ActionPageType[]) {
    dispatch({
      type: "SET_FIELD",
      field: "selectedActionTypes",
      value: selected,
    });
    dispatch({ type: "NEXT_STEP" });
  }

  function handleBack() {
    dispatch({ type: "PREV_STEP" });
  }

  // Submitting states
  if (submitPhase === "creating") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center onboarding-scale-in">
          <Loader2 className="w-10 h-10 text-[var(--ws-accent)] animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[var(--ws-text-primary)]">
            Creating your workspace...
          </h2>
          <p className="text-sm text-[var(--ws-text-muted)] mt-1">
            Setting up your bot and funnel
          </p>
        </div>
      </div>
    );
  }

  if (submitPhase === "done") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center onboarding-scale-in">
          <CheckCircle2 className="w-14 h-14 text-[var(--ws-accent)] mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-[var(--ws-text-primary)]">
            You&apos;re all set!
          </h2>
          <p className="text-sm text-[var(--ws-text-muted)] mt-1">
            Redirecting to your dashboard...
          </p>
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
          {error && (
            <div className="mb-6 p-3 bg-[var(--ws-danger-light)] border border-red-200 text-[var(--ws-danger)] rounded-lg text-sm">
              {error}
            </div>
          )}

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
      case "bot-setup":
        return (
          <BotSetupStep
            data={{
              botTone: state.botTone,
              botRules: state.botRules,
              customInstruction: state.customInstruction,
            }}
            suggestedRules={suggestedRules}
            onNext={handleBotSetupNext}
            onBack={handleBack}
          />
        );
      case "actions":
        return (
          <ActionSetupStep
            selected={state.selectedActionTypes}
            onNext={handleActionsNext}
            onBack={handleBack}
          />
        );
      case "facebook":
        return (
          <FacebookStep
            onConnect={() => {
              // Facebook OAuth — for now, skip with a TODO
              handleSubmit();
            }}
            onSkip={handleSubmit}
            onBack={handleBack}
            isSubmitting={submitPhase !== "idle"}
          />
        );
    }
  }
}
