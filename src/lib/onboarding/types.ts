import type { MainAction, PreviewData } from "@/lib/onboarding/generation-types";

export type OnboardingStep =
  | "profile"
  | "industry"
  | "goal"
  | "business-info"
  | "website"
  | "generation"
  | "facebook"
  | "preview";

export const STEP_ORDER: OnboardingStep[] = [
  "profile",
  "industry",
  "goal",
  "business-info",
  "website",
  "generation",
  "facebook",
  "preview",
];

export const STEP_LABELS: Record<OnboardingStep, string> = {
  profile: "Profile",
  industry: "Industry",
  goal: "Goal",
  "business-info": "Business Info",
  website: "Website",
  generation: "Setup",
  facebook: "Facebook",
  preview: "Preview",
};

export type BotTone = "friendly" | "professional" | "casual";

export type ActionPageType = "form" | "calendar" | "sales" | "product_catalog";

export type BusinessType =
  | "ecommerce"
  | "real_estate"
  | "digital_product"
  | "services";

export type BotGoal =
  | "qualify_leads"
  | "sell"
  | "understand_intent"
  | "collect_lead_info";

export interface OnboardingState {
  currentStep: OnboardingStep;
  direction: 1 | -1;

  // Step 1: Profile
  firstName: string;
  lastName: string;
  businessName: string;
  slug: string;

  // Step 2: Industry
  industry: BusinessType | "";

  // Step 3: Goal
  botGoal: BotGoal | "";

  // Step 4: Business Info
  businessDescription: string;
  mainAction: MainAction | "";
  differentiator: string;
  qualificationCriteria: string;

  // Step 5: Website
  websiteUrl: string;

  // Step 6: Generation
  generationId: string;

  // Step 7: Preview
  previewData: PreviewData | null;
}

export type OnboardingAction =
  | { type: "SET_FIELD"; field: keyof OnboardingState; value: unknown }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "GO_TO_STEP"; step: OnboardingStep };

export const INITIAL_STATE: OnboardingState = {
  currentStep: "profile",
  direction: 1,
  firstName: "",
  lastName: "",
  businessName: "",
  slug: "",
  industry: "",
  botGoal: "",
  businessDescription: "",
  mainAction: "",
  differentiator: "",
  qualificationCriteria: "",
  websiteUrl: "",
  generationId: "",
  previewData: null,
};
