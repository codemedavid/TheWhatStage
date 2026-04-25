/**
 * Maps common key variations to canonical keys for lead knowledge entries.
 * Unknown keys are returned lowercase and trimmed.
 */

const ALIASES: Record<string, string> = {
  "business": "business",
  "business type": "business",
  "business name": "business",
  "company": "business",
  "company name": "business",
  "industry": "business",
  "budget": "budget",
  "budget range": "budget",
  "price range": "budget",
  "spending": "budget",
  "location": "location",
  "city": "location",
  "address": "location",
  "area": "location",
  "region": "location",
  "phone": "phone",
  "phone number": "phone",
  "mobile": "phone",
  "contact number": "phone",
  "email": "email",
  "email address": "email",
  "e-mail": "email",
  "first name": "first_name",
  "first_name": "first_name",
  "given name": "first_name",
  "last name": "last_name",
  "last_name": "last_name",
  "surname": "last_name",
  "family name": "last_name",
  "name": "name",
  "full name": "name",
  "intent": "intent",
  "goal": "intent",
  "looking for": "intent",
  "interested in": "intent",
};

export function normalizeKey(raw: string): string {
  const cleaned = raw.trim().toLowerCase();
  return ALIASES[cleaned] ?? cleaned;
}
