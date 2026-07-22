import { db, type Queryable } from "@/lib/db/pool";
import { clerkConfigured } from "@/lib/auth/clerkConfig";

/**
 * Self-service account profile (the /account page).
 *
 * Identity fields that Clerk owns (username, email) are read-only here. Fields a
 * learner can edit divide into two homes:
 *   - first_name / last_name / country / gender  → their own app_users columns
 *     (already synced from Clerk; syncAppUser now prefers the stored value so an
 *     edit here is durable).
 *   - everything else (year of birth, education, spoken language, social links,
 *     site preferences) → the additive app_users.profile jsonb bag.
 *
 * On save we also make a best-effort write back to Clerk (name + unsafeMetadata)
 * so the identity provider stays consistent; that write never blocks or fails the
 * database save.
 */

/** Editable free-form fields kept in the app_users.profile jsonb column. */
export interface AccountProfile {
  yearOfBirth: string;
  education: string;
  spokenLanguage: string;
  linkedin: string;
  facebook: string;
  twitter: string;
  siteLanguage: string;
  timeZone: string;
}

export interface AccountView {
  username: string | null;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  country: string;
  gender: string;
  profile: AccountProfile;
  deactivated: boolean;
}

/** A partial update from the account form. Only provided keys are written. */
export interface AccountPatch {
  fullName?: string;
  country?: string;
  gender?: string;
  yearOfBirth?: string;
  education?: string;
  spokenLanguage?: string;
  linkedin?: string;
  facebook?: string;
  twitter?: string;
  siteLanguage?: string;
  timeZone?: string;
}

export class AccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountError";
  }
}

const PROFILE_KEYS = [
  "yearOfBirth",
  "education",
  "spokenLanguage",
  "linkedin",
  "facebook",
  "twitter",
  "siteLanguage",
  "timeZone",
] as const;

export const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];

export const EDUCATION_OPTIONS = [
  "No formal education",
  "Primary / elementary school",
  "Secondary / high school",
  "Associate degree",
  "Bachelor's degree",
  "Master's or professional degree",
  "Doctorate",
];

export const LANGUAGE_OPTIONS = [
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Dutch",
  "Greek",
  "Polish",
  "Romanian",
  "Other",
];

export const SITE_LANGUAGE_OPTIONS = ["English"];

export const TIME_ZONE_OPTIONS = [
  "Default (browser time zone)",
  "Europe/Dublin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Athens",
  "Europe/Bucharest",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Kolkata",
];

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function emptyProfile(): AccountProfile {
  return {
    yearOfBirth: "",
    education: "",
    spokenLanguage: "",
    linkedin: "",
    facebook: "",
    twitter: "",
    siteLanguage: "",
    timeZone: "",
  };
}

function mapProfile(raw: unknown): AccountProfile {
  const p = (raw ?? {}) as Record<string, unknown>;
  const out = emptyProfile();
  for (const k of PROFILE_KEYS) out[k] = str(p[k]);
  return out;
}

interface AccountRow {
  username: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  country: string | null;
  gender: string | null;
  profile: unknown;
  deactivated_at: string | null;
}

function toView(r: AccountRow): AccountView {
  const first = r.first_name ?? "";
  const last = r.last_name ?? "";
  return {
    username: r.username,
    email: r.email,
    firstName: first,
    lastName: last,
    fullName: `${first} ${last}`.trim(),
    country: r.country ?? "",
    gender: r.gender ?? "",
    profile: mapProfile(r.profile),
    deactivated: r.deactivated_at != null,
  };
}

export async function getAccountView(
  userId: string,
  conn: Queryable = db,
): Promise<AccountView | null> {
  const { rows } = await conn.query(
    `SELECT username, email, first_name, last_name, country, gender, profile, deactivated_at
     FROM app_users WHERE id = $1`,
    [userId],
  );
  const r = rows[0] as AccountRow | undefined;
  return r ? toView(r) : null;
}

/** Split a full name into (first, rest) exactly like registration does. */
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";
  return { firstName, lastName: parts.join(" ") };
}

function validate(patch: AccountPatch): void {
  if (patch.fullName !== undefined && patch.fullName.trim().length === 0) {
    throw new AccountError("Your full name can’t be empty.");
  }
  if (patch.yearOfBirth !== undefined && patch.yearOfBirth.trim() !== "") {
    const y = Number(patch.yearOfBirth.trim());
    const now = new Date().getFullYear();
    if (!Number.isInteger(y) || y < 1900 || y > now) {
      throw new AccountError(`Please enter a valid year of birth between 1900 and ${now}.`);
    }
  }
  for (const k of ["linkedin", "facebook", "twitter"] as const) {
    const v = patch[k];
    if (v !== undefined && v.trim() !== "" && !/^https?:\/\/\S+$/i.test(v.trim())) {
      throw new AccountError("Social links must be full URLs starting with http:// or https://.");
    }
  }
}

/** Persist an account patch and return the refreshed view. */
export async function updateAccountProfile(
  userId: string,
  clerkUserId: string,
  patch: AccountPatch,
  conn: Queryable = db,
): Promise<AccountView> {
  validate(patch);

  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.fullName !== undefined) {
    const { firstName, lastName } = splitName(patch.fullName);
    sets.push(`first_name = $${i++}`);
    values.push(firstName);
    sets.push(`last_name = $${i++}`);
    values.push(lastName);
  }
  if (patch.country !== undefined) {
    sets.push(`country = $${i++}`);
    values.push(patch.country.trim() || null);
  }
  if (patch.gender !== undefined) {
    sets.push(`gender = $${i++}`);
    values.push(patch.gender.trim() || null);
  }

  // Merge only the provided profile keys into the jsonb bag.
  const profilePatch: Record<string, string> = {};
  for (const k of PROFILE_KEYS) {
    const v = patch[k];
    if (v !== undefined) profilePatch[k] = v.trim();
  }
  if (Object.keys(profilePatch).length > 0) {
    sets.push(`profile = profile || $${i++}::jsonb`);
    values.push(JSON.stringify(profilePatch));
  }

  if (sets.length > 0) {
    values.push(userId);
    await conn.query(`UPDATE app_users SET ${sets.join(", ")} WHERE id = $${i}`, values);
  }

  // Best-effort: mirror the change to Clerk so the identity provider stays in
  // step. Never let a Clerk hiccup fail the DB save.
  await syncToClerk(clerkUserId, patch).catch(() => {});

  const view = await getAccountView(userId, conn);
  if (!view) throw new AccountError("Account not found.");
  return view;
}

async function syncToClerk(clerkUserId: string, patch: AccountPatch): Promise<void> {
  if (!clerkConfigured() || !process.env.CLERK_SECRET_KEY) return;
  const payload: {
    firstName?: string;
    lastName?: string;
    publicMetadata?: Record<string, unknown>;
  } = {};
  if (patch.fullName !== undefined) {
    const { firstName, lastName } = splitName(patch.fullName);
    payload.firstName = firstName;
    payload.lastName = lastName;
  }
  const meta: Record<string, unknown> = {};
  if (patch.country !== undefined) meta.country = patch.country.trim();
  if (patch.gender !== undefined) meta.gender = patch.gender.trim();
  if (Object.keys(meta).length === 0 && payload.firstName === undefined) return;

  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  if (Object.keys(meta).length > 0) {
    // Merge, don't overwrite, existing unsafeMetadata.
    const existing = await client.users.getUser(clerkUserId);
    await client.users.updateUserMetadata(clerkUserId, {
      unsafeMetadata: { ...(existing.unsafeMetadata ?? {}), ...meta },
    });
  }
  if (payload.firstName !== undefined) {
    await client.users.updateUser(clerkUserId, {
      firstName: payload.firstName,
      lastName: payload.lastName,
    });
  }
}
