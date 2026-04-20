// src/lib/onboarding/generation-types.ts

export type MainAction = "form" | "appointment" | "purchase" | "sales_page" | "call";

export const MAIN_ACTION_OPTIONS = [
  { value: "form" as const, label: "Fill out a form" },
  { value: "appointment" as const, label: "Book an appointment" },
  { value: "purchase" as const, label: "Browse & purchase products" },
  { value: "sales_page" as const, label: "Visit a sales page" },
  { value: "call" as const, label: "Schedule a call" },
] as const;

export type Checkpoint = "context" | "campaign" | "parallel" | "embeddings" | "persisted";

export type GenerationStatus = "running" | "completed" | "failed";

export interface BusinessContext {
  businessType: string;
  botGoal: string;
  businessDescription: string;
  mainAction: MainAction;
  differentiator: string;
  qualificationCriteria: string;
  websiteUrl?: string;
  tenantName: string;
}

export interface GeneratedCampaign {
  name: string;
  description: string;
  goal: "form_submit" | "appointment_booked" | "purchase" | "stage_reached";
  follow_up_message: string;
}

export interface GeneratedPhaseOutline {
  name: string;
  order: number;
  max_messages: number;
  goals: string;
  transition_hint: string;
  tone: string;
}

export interface GeneratedPhase extends GeneratedPhaseOutline {
  system_prompt: string;
}

export interface GeneratedFaq {
  question: string;
  answer: string;
}

export interface GenerationInput {
  businessType: string;
  botGoal: string;
  businessDescription: string;
  mainAction: MainAction;
  differentiator: string;
  qualificationCriteria: string;
  websiteUrl?: string;
  firstName: string;
  lastName: string;
  tenantName: string;
  tenantSlug: string;
}

export interface GenerationResults {
  context?: BusinessContext;
  campaign?: GeneratedCampaign;
  phaseOutlines?: GeneratedPhaseOutline[];
  phases?: GeneratedPhase[];
  faqs?: GeneratedFaq[];
  generalArticle?: string;
  urlArticle?: string;
  scrapedContent?: string;
  embeddings?: {
    faqEmbeddings: number[][];
    generalArticleEmbedding: number[];
    urlArticleEmbedding?: number[];
  };
}

export interface GenerationRecord {
  id: string;
  user_id: string;
  tenant_id: string | null;
  input: GenerationInput;
  status: GenerationStatus;
  checkpoint: Checkpoint | null;
  results: GenerationResults;
  error: string | null;
}

export interface PreviewData {
  campaignName: string;
  campaignGoal: string;
  phaseNames: string[];
  faqCount: number;
  articleCount: number;
  sampleGreeting: string;
}

export interface SSEMessage {
  step: string;
  status: "done" | "failed";
  error?: string;
  generationId?: string;
  data?: { preview: PreviewData };
}
