// Global test setup
// MSW server setup and any global mocks go here

import "@testing-library/jest-dom";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.NEXT_PUBLIC_APP_DOMAIN = "lvh.me:3000";
process.env.HUGGINGFACE_API_KEY = "test-hf-api-key";
process.env.HF_TOKEN = "test-hf-token";
