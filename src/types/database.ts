export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _deprecated_bot_flow_phases: {
        Row: {
          action_button_ids: string[] | null
          created_at: string
          goals: string | null
          id: string
          image_attachment_ids: string[]
          max_messages: number
          name: string
          order_index: number
          system_prompt: string
          tenant_id: string
          tone: string | null
          transition_hint: string | null
        }
        Insert: {
          action_button_ids?: string[] | null
          created_at?: string
          goals?: string | null
          id?: string
          image_attachment_ids?: string[]
          max_messages?: number
          name: string
          order_index?: number
          system_prompt: string
          tenant_id: string
          tone?: string | null
          transition_hint?: string | null
        }
        Update: {
          action_button_ids?: string[] | null
          created_at?: string
          goals?: string | null
          id?: string
          image_attachment_ids?: string[]
          max_messages?: number
          name?: string
          order_index?: number
          system_prompt?: string
          tenant_id?: string
          tone?: string | null
          transition_hint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_flow_phases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      action_page_fields: {
        Row: {
          action_page_id: string
          created_at: string
          field_key: string
          field_type: Database["public"]["Enums"]["action_field_type"]
          id: string
          label: string
          lead_mapping: Json | null
          options: Json | null
          order_index: number
          placeholder: string | null
          required: boolean
          tenant_id: string
        }
        Insert: {
          action_page_id: string
          created_at?: string
          field_key: string
          field_type?: Database["public"]["Enums"]["action_field_type"]
          id?: string
          label: string
          lead_mapping?: Json | null
          options?: Json | null
          order_index?: number
          placeholder?: string | null
          required?: boolean
          tenant_id: string
        }
        Update: {
          action_page_id?: string
          created_at?: string
          field_key?: string
          field_type?: Database["public"]["Enums"]["action_field_type"]
          id?: string
          label?: string
          lead_mapping?: Json | null
          options?: Json | null
          order_index?: number
          placeholder?: string | null
          required?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_page_fields_action_page_id_fkey"
            columns: ["action_page_id"]
            isOneToOne: false
            referencedRelation: "action_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_page_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      action_pages: {
        Row: {
          config: Json
          created_at: string
          id: string
          published: boolean
          slug: string
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["action_page_type"]
          version: number
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          published?: boolean
          slug: string
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["action_page_type"]
          version?: number
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          published?: boolean
          slug?: string
          tenant_id?: string
          title?: string
          type?: Database["public"]["Enums"]["action_page_type"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "action_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      action_submissions: {
        Row: {
          action_page_id: string
          created_at: string
          data: Json
          id: string
          lead_id: string
          psid: string
          tenant_id: string
        }
        Insert: {
          action_page_id: string
          created_at?: string
          data?: Json
          id?: string
          lead_id: string
          psid: string
          tenant_id: string
        }
        Update: {
          action_page_id?: string
          created_at?: string
          data?: Json
          id?: string
          lead_id?: string
          psid?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_submissions_action_page_id_fkey"
            columns: ["action_page_id"]
            isOneToOne: false
            referencedRelation: "action_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          lead_id: string
          notes: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          lead_id: string
          notes?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          tenant_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_flows: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          tenant_id: string
          trigger: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          tenant_id: string
          trigger: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          tenant_id?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_flows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_rules: {
        Row: {
          category: string
          created_at: string
          enabled: boolean
          id: string
          rule_text: string
          tenant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          enabled?: boolean
          id?: string
          rule_text: string
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          enabled?: boolean
          id?: string
          rule_text?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_conversions: {
        Row: {
          campaign_id: string
          converted_at: string
          id: string
          lead_id: string
          metadata: Json
        }
        Insert: {
          campaign_id: string
          converted_at?: string
          id?: string
          lead_id: string
          metadata?: Json
        }
        Update: {
          campaign_id?: string
          converted_at?: string
          id?: string
          lead_id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "campaign_conversions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_conversions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_funnels: {
        Row: {
          action_page_id: string
          campaign_id: string
          chat_rules: string[]
          created_at: string
          id: string
          page_description: string | null
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action_page_id: string
          campaign_id: string
          chat_rules?: string[]
          created_at?: string
          id?: string
          page_description?: string | null
          position: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action_page_id?: string
          campaign_id?: string
          chat_rules?: string[]
          created_at?: string
          id?: string
          page_description?: string | null
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_funnels_action_page_id_fkey"
            columns: ["action_page_id"]
            isOneToOne: false
            referencedRelation: "action_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_funnels_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_funnels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_phases: {
        Row: {
          action_button_ids: string[]
          campaign_id: string
          created_at: string
          goals: string | null
          id: string
          image_attachment_ids: string[]
          max_messages: number
          name: string
          order_index: number
          system_prompt: string
          tenant_id: string
          tone: string | null
          transition_hint: string | null
        }
        Insert: {
          action_button_ids?: string[]
          campaign_id: string
          created_at?: string
          goals?: string | null
          id?: string
          image_attachment_ids?: string[]
          max_messages?: number
          name: string
          order_index?: number
          system_prompt: string
          tenant_id: string
          tone?: string | null
          transition_hint?: string | null
        }
        Update: {
          action_button_ids?: string[]
          campaign_id?: string
          created_at?: string
          goals?: string | null
          id?: string
          image_attachment_ids?: string[]
          max_messages?: number
          name?: string
          order_index?: number
          system_prompt?: string
          tenant_id?: string
          tone?: string | null
          transition_hint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_phases_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_phases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          campaign_plan: Json | null
          campaign_rules: string[] | null
          created_at: string
          description: string | null
          follow_up_delay_minutes: number
          follow_up_message: string | null
          goal: string
          goal_config: Json
          id: string
          is_primary: boolean
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          campaign_plan?: Json | null
          campaign_rules?: string[] | null
          created_at?: string
          description?: string | null
          follow_up_delay_minutes?: number
          follow_up_message?: string | null
          goal: string
          goal_config?: Json
          id?: string
          is_primary?: boolean
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          campaign_plan?: Json | null
          campaign_rules?: string[] | null
          created_at?: string
          description?: string | null
          follow_up_delay_minutes?: number
          follow_up_message?: string | null
          goal?: string
          goal_config?: Json
          id?: string
          is_primary?: boolean
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_phases: {
        Row: {
          conversation_id: string
          entered_at: string
          exit_reason: string | null
          exited_at: string | null
          follow_ups_sent_at: string | null
          id: string
          message_count: number
          phase_id: string
        }
        Insert: {
          conversation_id: string
          entered_at?: string
          exit_reason?: string | null
          exited_at?: string | null
          follow_ups_sent_at?: string | null
          id?: string
          message_count?: number
          phase_id: string
        }
        Update: {
          conversation_id?: string
          entered_at?: string
          exit_reason?: string | null
          exited_at?: string | null
          follow_ups_sent_at?: string | null
          id?: string
          message_count?: number
          phase_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_phases_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_phases_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "campaign_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          bot_paused_at: string | null
          current_campaign_id: string | null
          current_funnel_id: string | null
          current_funnel_position: number
          escalation_message_id: string | null
          escalation_reason: string | null
          funnel_message_count: number
          id: string
          last_message_at: string
          lead_id: string
          needs_human: boolean
          tenant_id: string
        }
        Insert: {
          bot_paused_at?: string | null
          current_campaign_id?: string | null
          current_funnel_id?: string | null
          current_funnel_position?: number
          escalation_message_id?: string | null
          escalation_reason?: string | null
          funnel_message_count?: number
          id?: string
          last_message_at?: string
          lead_id: string
          needs_human?: boolean
          tenant_id: string
        }
        Update: {
          bot_paused_at?: string | null
          current_campaign_id?: string | null
          current_funnel_id?: string | null
          current_funnel_position?: number
          escalation_message_id?: string | null
          escalation_reason?: string | null
          funnel_message_count?: number
          id?: string
          last_message_at?: string
          lead_id?: string
          needs_human?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_current_campaign_id_fkey"
            columns: ["current_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_current_funnel_id_fkey"
            columns: ["current_funnel_id"]
            isOneToOne: false
            referencedRelation: "campaign_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_escalation_message_id_fkey"
            columns: ["escalation_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_events: {
        Row: {
          agent_user_id: string | null
          conversation_id: string
          created_at: string
          id: string
          reason: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          agent_user_id?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          reason?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          agent_user_id?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_campaigns: {
        Row: {
          campaign_id: string
          experiment_id: string
          weight: number
        }
        Insert: {
          campaign_id: string
          experiment_id: string
          weight?: number
        }
        Update: {
          campaign_id?: string
          experiment_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "experiment_campaigns_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_campaigns_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          min_sample_size: number
          name: string
          started_at: string | null
          status: string
          tenant_id: string
          winner_campaign_id: string | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          min_sample_size?: number
          name: string
          started_at?: string | null
          status?: string
          tenant_id: string
          winner_campaign_id?: string | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          min_sample_size?: number
          name?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
          winner_campaign_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_winner_campaign_id_fkey"
            columns: ["winner_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          content: string
          created_at: string
          doc_id: string
          embedding: string | null
          fts: unknown
          id: string
          kb_type: string
          metadata: Json
          tenant_id: string
        }
        Insert: {
          content: string
          created_at?: string
          doc_id: string
          embedding?: string | null
          fts?: unknown
          id?: string
          kb_type: string
          metadata?: Json
          tenant_id: string
        }
        Update: {
          content?: string
          created_at?: string
          doc_id?: string
          embedding?: string | null
          fts?: unknown
          id?: string
          kb_type?: string
          metadata?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "knowledge_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_docs: {
        Row: {
          content: string | null
          created_at: string
          file_url: string | null
          id: string
          metadata: Json
          status: string
          tenant_id: string
          title: string
          type: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          metadata?: Json
          status?: string
          tenant_id: string
          title: string
          type: string
        }
        Update: {
          content?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          metadata?: Json
          status?: string
          tenant_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_docs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_images: {
        Row: {
          context_hint: string | null
          created_at: string
          description: string
          embedding: string | null
          id: string
          tags: string[]
          tenant_id: string
          url: string
        }
        Insert: {
          context_hint?: string | null
          created_at?: string
          description: string
          embedding?: string | null
          id?: string
          tags?: string[]
          tenant_id: string
          url: string
        }
        Update: {
          context_hint?: string | null
          created_at?: string
          description?: string
          embedding?: string | null
          id?: string
          tags?: string[]
          tenant_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_images_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_campaign_assignments: {
        Row: {
          assigned_at: string
          campaign_id: string
          id: string
          lead_id: string
        }
        Insert: {
          assigned_at?: string
          campaign_id: string
          id?: string
          lead_id: string
        }
        Update: {
          assigned_at?: string
          campaign_id?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_campaign_assignments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_campaign_assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contacts: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          lead_id: string
          source: Database["public"]["Enums"]["lead_contact_source"]
          tenant_id: string
          type: Database["public"]["Enums"]["lead_contact_type"]
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          lead_id: string
          source?: Database["public"]["Enums"]["lead_contact_source"]
          tenant_id: string
          type: Database["public"]["Enums"]["lead_contact_type"]
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          lead_id?: string
          source?: Database["public"]["Enums"]["lead_contact_source"]
          tenant_id?: string
          type?: Database["public"]["Enums"]["lead_contact_type"]
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          payload: Json
          tenant_id: string
          type: Database["public"]["Enums"]["lead_event_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          payload?: Json
          tenant_id: string
          type: Database["public"]["Enums"]["lead_event_type"]
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          payload?: Json
          tenant_id?: string
          type?: Database["public"]["Enums"]["lead_event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_knowledge: {
        Row: {
          created_at: string
          extracted_from: string | null
          id: string
          key: string
          lead_id: string
          source: Database["public"]["Enums"]["lead_knowledge_source"]
          tenant_id: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          extracted_from?: string | null
          id?: string
          key: string
          lead_id: string
          source?: Database["public"]["Enums"]["lead_knowledge_source"]
          tenant_id: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          extracted_from?: string | null
          id?: string
          key?: string
          lead_id?: string
          source?: Database["public"]["Enums"]["lead_knowledge_source"]
          tenant_id?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_knowledge_extracted_from_fkey"
            columns: ["extracted_from"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_knowledge_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_knowledge_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string | null
          content: string
          conversation_id: string | null
          created_at: string
          id: string
          lead_id: string
          tenant_id: string
          type: Database["public"]["Enums"]["lead_note_type"]
        }
        Insert: {
          author_id?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          tenant_id: string
          type: Database["public"]["Enums"]["lead_note_type"]
        }
        Update: {
          author_id?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          tenant_id?: string
          type?: Database["public"]["Enums"]["lead_note_type"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stage_history: {
        Row: {
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["stage_actor_type"]
          created_at: string
          duration_seconds: number | null
          from_stage_id: string | null
          id: string
          lead_id: string
          reason: string
          tenant_id: string
          to_stage_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: Database["public"]["Enums"]["stage_actor_type"]
          created_at?: string
          duration_seconds?: number | null
          from_stage_id?: string | null
          id?: string
          lead_id: string
          reason: string
          tenant_id: string
          to_stage_id: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["stage_actor_type"]
          created_at?: string
          duration_seconds?: number | null
          from_stage_id?: string | null
          id?: string
          lead_id?: string
          reason?: string
          tenant_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          campaign_id: string | null
          created_at: string
          fb_name: string | null
          fb_profile_pic: string | null
          first_name: string | null
          id: string
          last_active_at: string
          last_name: string | null
          page_id: string | null
          psid: string
          stage_id: string | null
          tags: string[]
          tenant_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          fb_name?: string | null
          fb_profile_pic?: string | null
          first_name?: string | null
          id?: string
          last_active_at?: string
          last_name?: string | null
          page_id?: string | null
          psid: string
          stage_id?: string | null
          tags?: string[]
          tenant_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          fb_name?: string | null
          fb_profile_pic?: string | null
          first_name?: string | null
          id?: string
          last_active_at?: string
          last_name?: string | null
          page_id?: string | null
          psid?: string
          stage_id?: string | null
          tags?: string[]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "tenant_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json | null
          conversation_id: string
          created_at: string
          direction: string
          id: string
          mid: string | null
          text: string | null
        }
        Insert: {
          attachments?: Json | null
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          mid?: string | null
          text?: string | null
        }
        Update: {
          attachments?: Json | null
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          mid?: string | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_generations: {
        Row: {
          checkpoint: string | null
          created_at: string
          error: string | null
          id: string
          input: Json
          results: Json
          status: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checkpoint?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input: Json
          results?: Json
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          checkpoint?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json
          results?: Json
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_generations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          id: string
          items: Json
          lead_id: string
          payment_reference: string | null
          status: Database["public"]["Enums"]["order_status"]
          tenant_id: string
          total_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          lead_id: string
          payment_reference?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          tenant_id: string
          total_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          lead_id?: string
          payment_reference?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          tenant_id?: string
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          currency: string
          id: string
          images: Json
          name: string
          price_cents: number
          stock: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          images?: Json
          name: string
          price_cents: number
          stock?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          images?: Json
          name?: string
          price_cents?: number
          stock?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          color: string
          id: string
          name: string
          order_index: number
          tenant_id: string
        }
        Insert: {
          color?: string
          id?: string
          name: string
          order_index?: number
          tenant_id: string
        }
        Update: {
          color?: string
          id?: string
          name?: string
          order_index?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_pages: {
        Row: {
          connected_at: string
          fb_page_avatar: string | null
          fb_page_id: string
          fb_page_name: string | null
          fb_page_token: string
          fb_user_token: string | null
          id: string
          status: string
          tenant_id: string
          token_refreshed_at: string | null
        }
        Insert: {
          connected_at?: string
          fb_page_avatar?: string | null
          fb_page_id: string
          fb_page_name?: string | null
          fb_page_token: string
          fb_user_token?: string | null
          id?: string
          status?: string
          tenant_id: string
          token_refreshed_at?: string | null
        }
        Update: {
          connected_at?: string
          fb_page_avatar?: string | null
          fb_page_id?: string
          fb_page_name?: string | null
          fb_page_token?: string
          fb_user_token?: string | null
          id?: string
          status?: string
          tenant_id?: string
          token_refreshed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          bot_goal: Database["public"]["Enums"]["bot_goal"]
          business_description: string | null
          business_type: Database["public"]["Enums"]["business_type"]
          created_at: string
          custom_instructions: string | null
          differentiator: string | null
          fb_app_secret: string | null
          fb_page_id: string | null
          fb_page_token: string | null
          fb_verify_token: string | null
          handoff_timeout_hours: number | null
          id: string
          main_action: string | null
          max_images_per_response: number
          name: string
          onboarding_completed: boolean
          persona_tone: string
          qualification_criteria: string | null
          search_bar_background: string | null
          search_bar_border: string | null
          search_bar_enabled: boolean
          search_bar_focus_ring: string | null
          search_bar_icon: string | null
          search_bar_placeholder: string | null
          search_bar_radius: string
          search_bar_style: string
          search_bar_text: string | null
          slug: string
          website_url: string | null
        }
        Insert: {
          bot_goal?: Database["public"]["Enums"]["bot_goal"]
          business_description?: string | null
          business_type?: Database["public"]["Enums"]["business_type"]
          created_at?: string
          custom_instructions?: string | null
          differentiator?: string | null
          fb_app_secret?: string | null
          fb_page_id?: string | null
          fb_page_token?: string | null
          fb_verify_token?: string | null
          handoff_timeout_hours?: number | null
          id?: string
          main_action?: string | null
          max_images_per_response?: number
          name: string
          onboarding_completed?: boolean
          persona_tone?: string
          qualification_criteria?: string | null
          search_bar_background?: string | null
          search_bar_border?: string | null
          search_bar_enabled?: boolean
          search_bar_focus_ring?: string | null
          search_bar_icon?: string | null
          search_bar_placeholder?: string | null
          search_bar_radius?: string
          search_bar_style?: string
          search_bar_text?: string | null
          slug: string
          website_url?: string | null
        }
        Update: {
          bot_goal?: Database["public"]["Enums"]["bot_goal"]
          business_description?: string | null
          business_type?: Database["public"]["Enums"]["business_type"]
          created_at?: string
          custom_instructions?: string | null
          differentiator?: string | null
          fb_app_secret?: string | null
          fb_page_id?: string | null
          fb_page_token?: string | null
          fb_verify_token?: string | null
          handoff_timeout_hours?: number | null
          id?: string
          main_action?: string | null
          max_images_per_response?: number
          name?: string
          onboarding_completed?: boolean
          persona_tone?: string
          qualification_criteria?: string | null
          search_bar_background?: string | null
          search_bar_border?: string | null
          search_bar_enabled?: boolean
          search_bar_focus_ring?: string | null
          search_bar_icon?: string | null
          search_bar_placeholder?: string | null
          search_bar_radius?: string
          search_bar_style?: string
          search_bar_text?: string | null
          slug?: string
          website_url?: string | null
        }
        Relationships: []
      }
      workflow_runs: {
        Row: {
          finished_at: string | null
          id: string
          lead_id: string
          log: Json
          started_at: string
          status: Database["public"]["Enums"]["workflow_run_status"]
          workflow_id: string
        }
        Insert: {
          finished_at?: string | null
          id?: string
          lead_id: string
          log?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_run_status"]
          workflow_id: string
        }
        Update: {
          finished_at?: string | null
          id?: string
          lead_id?: string
          log?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_run_status"]
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          config: Json
          id: string
          order_index: number
          type: Database["public"]["Enums"]["workflow_step_type"]
          workflow_id: string
        }
        Insert: {
          config?: Json
          id?: string
          order_index?: number
          type: Database["public"]["Enums"]["workflow_step_type"]
          workflow_id: string
        }
        Update: {
          config?: Json
          id?: string
          order_index?: number
          type?: Database["public"]["Enums"]["workflow_step_type"]
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          name: string
          tenant_id: string
          trigger: Json
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          tenant_id: string
          trigger?: Json
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          tenant_id?: string
          trigger?: Json
        }
        Relationships: [
          {
            foreignKeyName: "workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_tenant_with_owner: {
        Args: {
          p_bot_goal: Database["public"]["Enums"]["bot_goal"]
          p_business_type: Database["public"]["Enums"]["business_type"]
          p_name: string
          p_slug: string
          p_user_id: string
        }
        Returns: {
          id: string
          slug: string
        }[]
      }
      current_tenant_id: { Args: never; Returns: string }
      get_page_lead_counts: {
        Args: { p_tenant_id: string }
        Returns: {
          count: number
          page_id: string
        }[]
      }
      get_page_message_counts: {
        Args: { p_tenant_id: string }
        Returns: {
          count: number
          page_id: string
        }[]
      }
      match_knowledge_chunks: {
        Args: {
          p_kb_type: string
          p_similarity_threshold?: number
          p_tenant_id: string
          p_top_k?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      match_knowledge_chunks_hybrid: {
        Args: {
          fts_query: string
          p_kb_type: string
          p_tenant_id: string
          p_top_k?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      match_knowledge_images: {
        Args: {
          p_candidate_ids: string[]
          p_similarity_threshold?: number
          p_tenant_id: string
          p_top_k?: number
          query_embedding: string
        }
        Returns: {
          context_hint: string
          description: string
          id: string
          similarity: number
          url: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      action_field_type:
        | "text"
        | "email"
        | "phone"
        | "textarea"
        | "select"
        | "number"
        | "radio"
        | "checkbox"
      action_page_type:
        | "form"
        | "calendar"
        | "sales"
        | "product_catalog"
        | "checkout"
      appointment_status: "scheduled" | "confirmed" | "cancelled" | "completed"
      bot_goal:
        | "qualify_leads"
        | "sell"
        | "understand_intent"
        | "collect_lead_info"
      business_type:
        | "ecommerce"
        | "real_estate"
        | "digital_product"
        | "services"
      lead_contact_source: "ai_extracted" | "manual" | "form_submit"
      lead_contact_type: "phone" | "email"
      lead_event_type:
        | "message_in"
        | "message_out"
        | "action_click"
        | "form_submit"
        | "appointment_booked"
        | "purchase"
        | "stage_changed"
      lead_knowledge_source: "ai_extracted" | "manual" | "form_submit"
      lead_note_type: "agent_note" | "ai_summary"
      order_status: "pending" | "paid" | "fulfilled" | "cancelled"
      stage_actor_type: "ai" | "agent" | "automation"
      workflow_run_status: "running" | "completed" | "failed"
      workflow_step_type:
        | "send_message"
        | "send_image"
        | "wait"
        | "condition"
        | "move_stage"
        | "tag"
        | "http"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      action_field_type: [
        "text",
        "email",
        "phone",
        "textarea",
        "select",
        "number",
        "radio",
        "checkbox",
      ],
      action_page_type: [
        "form",
        "calendar",
        "sales",
        "product_catalog",
        "checkout",
      ],
      appointment_status: ["scheduled", "confirmed", "cancelled", "completed"],
      bot_goal: [
        "qualify_leads",
        "sell",
        "understand_intent",
        "collect_lead_info",
      ],
      business_type: [
        "ecommerce",
        "real_estate",
        "digital_product",
        "services",
      ],
      lead_contact_source: ["ai_extracted", "manual", "form_submit"],
      lead_contact_type: ["phone", "email"],
      lead_event_type: [
        "message_in",
        "message_out",
        "action_click",
        "form_submit",
        "appointment_booked",
        "purchase",
        "stage_changed",
      ],
      lead_knowledge_source: ["ai_extracted", "manual", "form_submit"],
      lead_note_type: ["agent_note", "ai_summary"],
      order_status: ["pending", "paid", "fulfilled", "cancelled"],
      stage_actor_type: ["ai", "agent", "automation"],
      workflow_run_status: ["running", "completed", "failed"],
      workflow_step_type: [
        "send_message",
        "send_image",
        "wait",
        "condition",
        "move_stage",
        "tag",
        "http",
      ],
    },
  },
} as const
