export type OnboardingStep =
  | "profile"
  | "industry"
  | "goal"
  | "bot-setup"
  | "actions"
  | "facebook";

export const STEP_ORDER: OnboardingStep[] = [
  "profile",
  "industry",
  "goal",
  "bot-setup",
  "actions",
  "facebook",
];

export const STEP_LABELS: Record<OnboardingStep, string> = {
  profile: "Profile",
  industry: "Industry",
  goal: "Goal",
  "bot-setup": "Bot Setup",
  actions: "Actions",
  facebook: "Connect",
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

  // Step 4: Bot Setup
  botTone: BotTone;
  botRules: string[];
  customInstruction: string;

  // Step 5: Actions
  selectedActionTypes: ActionPageType[];

  // Step 6: Facebook
  fbConnected: boolean;
}

export type OnboardingAction =
  | { type: "SET_FIELD"; field: keyof OnboardingState; value: unknown }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "GO_TO_STEP"; step: OnboardingStep }
  | {
      type: "APPLY_DEFAULTS";
      defaults: {
        botTone: BotTone;
        botRules: string[];
        selectedActionTypes: ActionPageType[];
      };
    }
  | { type: "TOGGLE_RULE"; rule: string }
  | { type: "TOGGLE_ACTION_TYPE"; actionType: ActionPageType };

export const INITIAL_STATE: OnboardingState = {
  currentStep: "profile",
  direction: 1,
  firstName: "",
  lastName: "",
  businessName: "",
  slug: "",
  industry: "",
  botGoal: "",
  botTone: "friendly",
  botRules: [],
  customInstruction: "",
  selectedActionTypes: [],
  fbConnected: false,
};
