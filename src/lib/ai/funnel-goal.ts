// src/lib/ai/funnel-goal.ts
import type { ActionPageType } from "@/lib/ai/funnel-templates";

export type CampaignGoal = "form_submit" | "appointment_booked" | "purchase" | "stage_reached";

export function deriveCampaignGoal(lastFunnelPageType: ActionPageType): CampaignGoal {
  switch (lastFunnelPageType) {
    case "sales":
    case "checkout":
    case "product_catalog":
      return "purchase";
    case "form":
    case "qualification":
      return "form_submit";
    case "calendar":
      return "appointment_booked";
  }
}
