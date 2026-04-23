export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableRow<T> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      tenants: TableRow<{
        id: string;
        slug: string;
        name: string;
        business_type: "ecommerce" | "real_estate" | "digital_product" | "services";
        bot_goal: "qualify_leads" | "sell" | "understand_intent" | "collect_lead_info";
        fb_page_id: string | null;
        fb_page_token: string | null;
        fb_app_secret: string | null;
        fb_verify_token: string | null;
        max_images_per_response: number;
        handoff_timeout_hours: number | null;
        business_description: string | null;
        main_action: string | null;
        differentiator: string | null;
        qualification_criteria: string | null;
        website_url: string | null;
        onboarding_completed: boolean;
        created_at: string;
      }>;
      tenant_pages: TableRow<{
        id: string;
        tenant_id: string;
        fb_page_id: string;
        fb_page_name: string | null;
        fb_page_avatar: string | null;
        fb_page_token: string;
        fb_user_token: string | null;
        status: string;
        connected_at: string;
        token_refreshed_at: string | null;
      }>;
      tenant_members: TableRow<{
        tenant_id: string;
        user_id: string;
        role: "owner" | "admin" | "agent";
        created_at: string;
      }>;
      leads: TableRow<{
        id: string;
        tenant_id: string;
        psid: string;
        fb_name: string | null;
        fb_profile_pic: string | null;
        stage_id: string | null;
        page_id: string | null;
        tags: string[];
        created_at: string;
        last_active_at: string;
      }>;
      stages: TableRow<{
        id: string;
        tenant_id: string;
        name: string;
        order_index: number;
        color: string;
      }>;
      lead_events: TableRow<{
        id: string;
        tenant_id: string;
        lead_id: string;
        type: "message_in" | "message_out" | "action_click" | "form_submit" | "appointment_booked" | "purchase" | "stage_changed";
        payload: Json;
        created_at: string;
      }>;
      conversations: TableRow<{
        id: string;
        tenant_id: string;
        lead_id: string;
        last_message_at: string;
        needs_human: boolean;
        bot_paused_at: string | null;
        escalation_reason: string | null;
        escalation_message_id: string | null;
      }>;
      messages: TableRow<{
        id: string;
        conversation_id: string;
        direction: "in" | "out";
        text: string | null;
        attachments: Json | null;
        mid: string | null;
        created_at: string;
      }>;
      action_pages: TableRow<{
        id: string;
        tenant_id: string;
        slug: string;
        type: "form" | "calendar" | "sales" | "product_catalog" | "checkout";
        title: string;
        config: Json;
        published: boolean;
        version: number;
        created_at: string;
      }>;
      action_submissions: TableRow<{
        id: string;
        tenant_id: string;
        action_page_id: string;
        lead_id: string;
        psid: string;
        data: Json;
        created_at: string;
      }>;
      products: TableRow<{
        id: string;
        tenant_id: string;
        name: string;
        price_cents: number;
        currency: string;
        images: Json;
        stock: number | null;
        created_at: string;
      }>;
      orders: TableRow<{
        id: string;
        tenant_id: string;
        lead_id: string;
        status: "pending" | "paid" | "fulfilled" | "cancelled";
        total_cents: number;
        items: Json;
        payment_reference: string | null;
        created_at: string;
      }>;
      appointments: TableRow<{
        id: string;
        tenant_id: string;
        lead_id: string;
        starts_at: string;
        ends_at: string;
        status: "scheduled" | "confirmed" | "cancelled" | "completed";
        notes: string | null;
        created_at: string;
      }>;
      bot_rules: TableRow<{
        id: string;
        tenant_id: string;
        rule_text: string;
        category: "tone" | "boundary" | "behavior";
        enabled: boolean;
        created_at: string;
      }>;
      bot_flows: TableRow<{
        id: string;
        tenant_id: string;
        trigger: string;
        config: Json;
        enabled: boolean;
        created_at: string;
      }>;
      bot_flow_phases: TableRow<{
        id: string;
        tenant_id: string;
        name: string;
        order_index: number;
        max_messages: number;
        system_prompt: string;
        tone: string | null;
        goals: string | null;
        transition_hint: string | null;
        action_button_ids: string[] | null;
        image_attachment_ids: string[];
        created_at: string;
      }>;
      knowledge_docs: TableRow<{
        id: string;
        tenant_id: string;
        title: string;
        type: "pdf" | "docx" | "xlsx" | "faq" | "richtext" | "product";
        content: string | null;
        file_url: string | null;
        status: "processing" | "ready" | "error";
        metadata: Record<string, unknown>;
        created_at: string;
      }>;
      knowledge_chunks: TableRow<{
        id: string;
        doc_id: string;
        tenant_id: string;
        content: string;
        kb_type: "general" | "product";
        embedding: number[] | null;
        metadata: Record<string, unknown>;
        created_at: string;
      }>;
      knowledge_images: TableRow<{
        id: string;
        tenant_id: string;
        url: string;
        description: string;
        tags: string[];
        context_hint: string | null;
        embedding: number[] | null;
        created_at: string;
      }>;
      conversation_phases: TableRow<{
        id: string;
        conversation_id: string;
        phase_id: string;
        entered_at: string;
        message_count: number;
        exited_at: string | null;
        exit_reason: "advanced" | "dropped" | "converted" | "human_handoff" | null;
        follow_ups_sent_at: string | null;
      }>;
      campaigns: TableRow<{
        id: string;
        tenant_id: string;
        name: string;
        description: string | null;
        goal: "form_submit" | "appointment_booked" | "purchase" | "stage_reached";
        goal_config: Record<string, unknown>;
        is_primary: boolean;
        status: "draft" | "active" | "paused" | "archived";
        follow_up_delay_minutes: number;
        follow_up_message: string | null;
        created_at: string;
        updated_at: string;
      }>;
      campaign_phases: TableRow<{
        id: string;
        campaign_id: string;
        tenant_id: string;
        name: string;
        order_index: number;
        max_messages: number;
        system_prompt: string;
        tone: string | null;
        goals: string | null;
        transition_hint: string | null;
        action_button_ids: string[];
        image_attachment_ids: string[];
        created_at: string;
      }>;
      lead_campaign_assignments: TableRow<{
        id: string;
        lead_id: string;
        campaign_id: string;
        assigned_at: string;
      }>;
      experiments: TableRow<{
        id: string;
        tenant_id: string;
        name: string;
        status: "draft" | "running" | "paused" | "completed";
        min_sample_size: number;
        started_at: string | null;
        ended_at: string | null;
        winner_campaign_id: string | null;
        created_at: string;
      }>;
      experiment_campaigns: TableRow<{
        experiment_id: string;
        campaign_id: string;
        weight: number;
      }>;
      campaign_conversions: TableRow<{
        id: string;
        campaign_id: string;
        lead_id: string;
        converted_at: string;
        metadata: Record<string, unknown>;
      }>;
      escalation_events: TableRow<{
        id: string;
        conversation_id: string;
        tenant_id: string;
        type: "escalated" | "agent_took_over" | "bot_resumed";
        reason: string | null;
        agent_user_id: string | null;
        created_at: string;
      }>;
      workflows: TableRow<{
        id: string;
        tenant_id: string;
        name: string;
        trigger: Json;
        enabled: boolean;
        created_at: string;
      }>;
      workflow_steps: TableRow<{
        id: string;
        workflow_id: string;
        order_index: number;
        type: "send_message" | "send_image" | "wait" | "condition" | "move_stage" | "tag" | "http";
        config: Json;
      }>;
      workflow_runs: TableRow<{
        id: string;
        workflow_id: string;
        lead_id: string;
        status: "running" | "completed" | "failed";
        started_at: string;
        finished_at: string | null;
        log: Json;
      }>;
      onboarding_generations: TableRow<{
        id: string;
        user_id: string;
        tenant_id: string | null;
        input: Json;
        status: "running" | "completed" | "failed";
        checkpoint: "context" | "campaign" | "parallel" | "embeddings" | "persisted" | null;
        results: Json;
        error: string | null;
        created_at: string;
        updated_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      create_tenant_with_owner: {
        Args: {
          p_name: string;
          p_slug: string;
          p_business_type: "ecommerce" | "real_estate" | "digital_product" | "services";
          p_bot_goal: "qualify_leads" | "sell" | "understand_intent" | "collect_lead_info";
          p_user_id: string;
        };
        Returns: { id: string; slug: string };
      };
      match_knowledge_chunks: {
        Args: {
          query_embedding: number[];
          p_tenant_id: string;
          p_kb_type: "general" | "product";
          p_top_k?: number;
          p_similarity_threshold?: number;
        };
        Returns: {
          id: string;
          content: string;
          similarity: number;
          metadata: Record<string, unknown>;
        }[];
      };
      match_knowledge_images: {
        Args: {
          query_embedding: number[];
          p_tenant_id: string;
          p_candidate_ids: string[];
          p_top_k?: number;
          p_similarity_threshold?: number;
        };
        Returns: {
          id: string;
          url: string;
          description: string;
          context_hint: string | null;
          similarity: number;
        }[];
      };
      get_page_lead_counts: {
        Args: { p_tenant_id: string };
        Returns: { page_id: string; count: number }[];
      };
      get_page_message_counts: {
        Args: { p_tenant_id: string };
        Returns: { page_id: string; count: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
