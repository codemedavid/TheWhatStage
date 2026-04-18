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
        created_at: string;
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
        created_at: string;
      }>;
      conversation_phases: TableRow<{
        id: string;
        conversation_id: string;
        phase_id: string;
        entered_at: string;
        message_count: number;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
