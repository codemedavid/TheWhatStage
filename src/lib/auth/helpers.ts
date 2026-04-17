interface SignUpUser {
  id: string;
  email?: string;
  identities?: { id: string }[];
  email_confirmed_at?: string | null;
}

interface SignUpResult {
  data: {
    user: SignUpUser | null;
    session: unknown | null;
  };
  error: { message: string } | null;
}

/**
 * Determines if the signup response indicates email confirmation is needed.
 * Returns true when Supabase requires email verification before the session is active.
 * Returns false on error (let the caller handle errors separately).
 */
export function needsEmailConfirmation(result: SignUpResult): boolean {
  if (result.error || !result.data.user) return false;

  const user = result.data.user;

  // No identities means user already exists or email not confirmed
  if (!user.identities || user.identities.length === 0) return true;

  // Session is null means email confirmation is required
  if (!result.data.session) return true;

  return false;
}
