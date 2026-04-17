# System Overview

High-level architecture of the WhatStage Messenger Funnel platform.

```mermaid
graph TB
  subgraph Messenger["Messenger Integration"]
    FB[Facebook Messenger] --> Webhook[Webhook Handler]
    Webhook --> BotEngine[Bot Engine]
    BotEngine --> SendAPI[Send API]
  end

  subgraph RAG["RAG & Training"]
    KB[Knowledge Base] --> RAGPipeline[RAG Pipeline]
    RAGPipeline --> BotEngine
    BotRules[Bot Rules] --> BotEngine
    ConvReview[Conversation Review] --> BotRules
  end

  subgraph GoalDriven["Goal-Driven Actions"]
    GoalConfig[Goal Config] --> BotEngine
    BotEngine --> QualEngine[Qualification Engine]
    BotEngine --> BookingInt[Booking Integration]
    BotEngine --> SalesPush[Sales Push]
  end

  subgraph TenantDash["Tenant Dashboard"]
    DashHome[Dashboard Home] --> LeadPipeline[Lead Pipeline]
    DashHome --> ConvInbox[Conversation Inbox]
    DashHome --> Analytics[Analytics]
    DashHome --> TrainingDash[Training Dashboard]
  end

  subgraph ActionPages["Action Pages"]
    ActionBuilder[Action Page Builder] --> Forms[Forms]
    ActionBuilder --> Calendar[Calendar]
    ActionBuilder --> Sales[Sales Pages]
    ActionBuilder --> ProductCatalog[Product Catalog]
    ProductCatalog --> Checkout[Checkout]
  end

  subgraph Workflows["Workflows"]
    Triggers[Triggers] --> WorkflowEngine[Workflow Engine]
    WorkflowEngine --> Steps[Steps]
  end

  subgraph DataLayer["Data Layer"]
    SupabaseDB[Supabase Postgres]
    SupabaseAuth[Auth]
    SupabaseRealtime[Realtime]
    VectorEmbeddings[Vector Embeddings]
  end

  BotEngine -->|action buttons| Forms
  BotEngine -->|action buttons| Calendar
  BotEngine -->|action buttons| ProductCatalog
  QualEngine --> Forms
  Forms -->|submissions| SupabaseDB
  LeadPipeline -->|leads| SupabaseDB
  WorkflowEngine --> SendAPI
  ConvInbox --> SupabaseRealtime
  KB --> VectorEmbeddings
  RAGPipeline --> VectorEmbeddings
```

## Subsystems

| Subsystem | Features | Status |
|-----------|----------|--------|
| Auth & Multi-tenancy | [[Auth Flow]], [[Tenant Routing]], [[Tenant Management]], [[Onboarding]] | Planned |
| Messenger Bot Engine | [[Webhook Handler]], [[Message Handling]], [[Send API]], [[Bot Flows]], [[AI Reasoning]] | Planned |
| Lead Management | [[Lead Pipeline]], [[Lead Profile]], [[Activity Tracking]], [[Stage Management]] | Planned |
| Action Pages | [[Form Pages]], [[Calendar Booking]], [[Sales Pages]], [[Product Catalog]], [[Checkout]], [[Action Page Builder]] | Planned |
| Commerce | [[Product Management]], [[Order Management]], [[Appointment Management]] | Planned |
| Workflows & Automation | [[Workflow Engine]], [[Workflow Builder]], [[Workflow Steps]], [[Workflow Triggers]] | Planned |
| Tenant Dashboard | [[Dashboard Home]], [[Conversation Inbox]], [[Analytics]] | Planned |
| RAG & Bot Training | [[Knowledge Base]], [[RAG Pipeline]], [[Bot Rules & Persona]], [[Test Conversation]], [[Conversation Review]], [[Training Dashboard]] | Planned |
| Goal-Driven Actions | [[Goal Configuration]], [[Qualification Engine]], [[Qualification Data View]], [[Booking Integration]], [[Sales Push]], [[Action Conditions]] | Planned |
