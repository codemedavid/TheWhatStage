# Feature Roadmap

Tracks all platform features, their subsystem, current status, related data entities, and components.

## Status Legend

| Symbol | Meaning |
|--------|---------|
| Planned | Feature is designed but not yet implemented |
| In Progress | Feature is currently being built |
| Complete | Feature is implemented and tested |

## Features

| Feature | Subsystem | Status | Entities | Components |
|---------|-----------|--------|----------|------------|
| [[Auth Flow]] | Auth | Planned | [[tenant_members]] | [[LoginPage]], [[SignupPage]], [[AuthCallbackRoute]] |
| [[Tenant Routing]] | Auth | Planned | [[tenants]] | [[Middleware]] |
| [[Tenant Management]] | Auth | Planned | [[tenants]], [[tenant_members]] | [[SettingsPage]] |
| [[Onboarding]] | Auth | Planned | [[tenants]], [[tenant_members]] | [[OnboardingPage]], [[CreateTenantRoute]] |
| [[Webhook Handler]] | Messenger | Planned | -- | [[FbWebhookRoute]] |
| [[Message Handling]] | Messenger | Planned | [[leads]], [[conversations]], [[messages]], [[lead_events]] | [[FbWebhookRoute]] |
| [[Send API]] | Messenger | Planned | [[messages]] | -- |
| [[Bot Flows]] | Messenger | Planned | [[bot_flows]] | [[BotPage]] |
| [[AI Reasoning]] | Messenger | Planned | [[leads]], [[lead_events]], [[knowledge_chunks]] | -- |
| [[Lead Pipeline]] | Leads | Planned | [[leads]], [[stages]] | [[LeadsPage]] |
| [[Lead Profile]] | Leads | Planned | [[leads]], [[lead_events]], [[qualification_responses]] | [[LeadsPage]] |
| [[Activity Tracking]] | Leads | Planned | [[lead_events]] | [[LeadsPage]] |
| [[Stage Management]] | Leads | Planned | [[stages]] | [[SettingsPage]] |
| [[Form Pages]] | Actions | Planned | [[action_pages]], [[action_submissions]] | [[ActionSlugPage]] |
| [[Calendar Booking]] | Actions | Planned | [[action_pages]], [[appointments]] | [[ActionSlugPage]] |
| [[Sales Pages]] | Actions | Planned | [[action_pages]] | [[ActionSlugPage]] |
| [[Product Catalog]] | Actions | Planned | [[action_pages]], [[products]] | [[ActionSlugPage]] |
| [[Checkout]] | Actions | Planned | [[orders]], [[action_submissions]] | [[ActionSlugPage]] |
| [[Action Page Builder]] | Actions | Planned | [[action_pages]] | [[ActionsPage]] |
| [[Product Management]] | Commerce | Planned | [[products]] | [[ActionsPage]] |
| [[Order Management]] | Commerce | Planned | [[orders]] | [[LeadsPage]] |
| [[Appointment Management]] | Commerce | Planned | [[appointments]] | [[LeadsPage]] |
| [[Workflow Engine]] | Workflows | Planned | [[workflows]], [[workflow_steps]], [[workflow_runs]] | -- |
| [[Workflow Builder]] | Workflows | Planned | [[workflows]], [[workflow_steps]] | [[WorkflowsPage]] |
| [[Workflow Steps]] | Workflows | Planned | [[workflow_steps]] | [[WorkflowsPage]] |
| [[Workflow Triggers]] | Workflows | Planned | [[workflows]] | [[WorkflowsPage]] |
| [[Dashboard Home]] | Dashboard | Planned | [[leads]], [[lead_events]], [[stages]] | [[DashboardNav]] |
| [[Conversation Inbox]] | Dashboard | Planned | [[conversations]], [[messages]], [[leads]] | [[DashboardNav]] |
| [[Analytics]] | Dashboard | Planned | [[lead_events]], [[action_submissions]], [[leads]] | [[DashboardNav]] |
| [[Knowledge Base]] | RAG | Planned | [[knowledge_docs]], [[knowledge_chunks]] | [[BotPage]] |
| [[RAG Pipeline]] | RAG | Planned | [[knowledge_chunks]] | -- |
| [[Bot Rules & Persona]] | RAG | Planned | [[bot_rules]] | [[BotPage]] |
| [[Test Conversation]] | RAG | Planned | [[conversations]], [[messages]] | [[BotPage]] |
| [[Conversation Review]] | RAG | Planned | [[conversation_corrections]], [[bot_rules]] | [[BotPage]] |
| [[Training Dashboard]] | RAG | Planned | [[knowledge_docs]], [[bot_rules]] | [[BotPage]] |
| [[Goal Configuration]] | Goals | Planned | [[tenants]] | [[SettingsPage]], [[OnboardingPage]] |
| [[Qualification Engine]] | Goals | Planned | [[qualification_forms]], [[qualification_responses]] | [[ActionsPage]], [[ActionSlugPage]] |
| [[Qualification Data View]] | Goals | Planned | [[qualification_responses]], [[leads]] | [[LeadsPage]] |
| [[Booking Integration]] | Goals | Planned | [[appointments]], [[action_pages]] | [[ActionSlugPage]] |
| [[Sales Push]] | Goals | Planned | [[products]], [[orders]], [[action_pages]] | [[ActionSlugPage]] |
| [[Action Conditions]] | Goals | Planned | [[action_conditions]] | [[ActionsPage]] |

<!-- AUTO-UPDATED: New features are appended here by feature-doc skill -->
