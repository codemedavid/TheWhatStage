// Global test setup
// MSW server setup and any global mocks go here

import "@testing-library/jest-dom";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.NEXT_PUBLIC_APP_DOMAIN = "lvh.me:3000";
// Note: HF_TOKEN is intentionally not set globally. Individual tests that require
// HuggingFace API access should set it in their own beforeEach or at the file level.
// This allows live/integration tests to skip gracefully in CI when the token is unavailable.
