import type { Profile } from "@/types/app";

/**
 * Pure display helpers for people.
 *
 * Deliberately NOT in a `"use client"` module. A function exported from a
 * client module cannot be called by a Server Component — Next.js turns it into
 * a reference stub and throws "Attempted to call X from the server". Keeping
 * these here lets both sides import them.
 */

/** Initials for an avatar fallback, from a name if there is one, else the email. */
export function initialsOf(person: Pick<Profile, "full_name" | "email">): string {
  const source = person.full_name?.trim() || person.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase();
}

/** Best available human label for a person. */
export function displayName(
  person: Pick<Profile, "full_name" | "email"> | null | undefined,
  fallback = "Unknown",
): string {
  if (!person) return fallback;
  return person.full_name?.trim() || person.email;
}
