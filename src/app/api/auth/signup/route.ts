import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/**
 * POST /api/auth/signup
 * Creates a user via service client with email auto-confirmed.
 * Bypasses the project's email confirmation setting.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;
  const service = createServiceClient();

  // Create user with auto-confirm via admin API
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    // User already exists
    if (error.message?.includes("already been registered")) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ userId: data.user.id }, { status: 201 });
}
