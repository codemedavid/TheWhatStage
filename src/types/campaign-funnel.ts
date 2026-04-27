// src/types/campaign-funnel.ts
export interface CampaignFunnel {
  id: string;
  campaignId: string;
  tenantId: string;
  position: number;
  actionPageId: string;
  pageDescription: string | null;
  pitch: string | null;
  qualificationQuestions: string[];
  chatRules: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CampaignFunnelInput {
  actionPageId: string;
  pageDescription: string | null;
  pitch: string | null;
  qualificationQuestions: string[];
  chatRules: string[];
}
