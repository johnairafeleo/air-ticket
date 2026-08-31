import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types/app";

/**
 * The project scoping the app.
 *
 * The app is always scoped to exactly ONE project — there is deliberately no
 * "all projects" mode, so every list, board and dashboard figure describes the
 * same thing.
 *
 * The selection is held in a cookie rather than a URL parameter so it survives
 * moving between Tickets, Board and Dashboard without every link carrying it.
 *
 * `null` therefore means only one thing: no project exists yet (or none the
 * caller can see). Pages render a "create a project" state for that, rather
 * than an empty board that looks broken.
 */

const COOKIE = "active_project";

export const listProjects = cache(async (): Promise<Project[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) return [];
  return data ?? [];
});

/**
 * The active project, or null when there are none.
 *
 * Falls back to the first available project when the cookie is missing or
 * stale — a project since deactivated, or one belonging to another account.
 * Without the fallback a stale cookie would show an empty board with no
 * explanation.
 */
export const getActiveProject = cache(async (): Promise<Project | null> => {
  const projects = await listProjects();
  if (projects.length === 0) return null;

  const store = await cookies();
  const stored = store.get(COOKIE)?.value;

  return projects.find((p) => p.id === stored) ?? projects[0] ?? null;
});

export const getActiveProjectId = cache(async (): Promise<string | null> => {
  const project = await getActiveProject();
  return project?.id ?? null;
});

export { COOKIE as ACTIVE_PROJECT_COOKIE };
