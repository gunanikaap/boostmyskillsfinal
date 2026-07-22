/**
 * Pure account types + option lists — NO server-only imports (no `pg`, no db).
 *
 * The /account client component imports the option arrays and these types from
 * here. Keeping them out of profile.ts / deletion.ts (which import the database
 * pool) is what stops `pg` being dragged into the client bundle.
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

export const PROFILE_KEYS = [
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

/* -------------------------------------------------------------- deletion */

export type DeletionStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface DeletionRequest {
  id: string;
  status: DeletionStatus;
  reason: string | null;
  adminNote: string | null;
  requestedAt: string;
  resolvedAt: string | null;
}

export interface AdminDeletionRequest extends DeletionRequest {
  userId: string;
  email: string;
  username: string | null;
  fullName: string;
  deactivated: boolean;
}
