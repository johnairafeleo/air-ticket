#!/usr/bin/env node
/**
 * Regenerates src/types/database.ts from the live Postgres schema.
 *
 *   npm run db:types
 *
 * Uses the Supabase CLI's --db-url mode, which needs SUPABASE_DB_URL in
 * .env.local AND a running Docker daemon: the CLI runs pg_meta in a container
 * to introspect the schema. (An earlier note in docs/SETUP.md claimed --db-url
 * avoided Docker. That was wrong — verified against CLI 2.116.)
 *
 * Docker-free alternative: `supabase login` then
 *   supabase gen types typescript --project-id <ref>
 * which goes through the Management API instead.
 *
 * Run this after every migration. `npm run typecheck` will start failing if the
 * committed types no longer match the code, which is the intended signal.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = resolve(root, "src/types/database.ts");
const ENV_FILE = resolve(root, ".env.local");

function readEnvVar(name) {
  if (process.env[name]) return process.env[name];

  if (!existsSync(ENV_FILE)) return undefined;

  // Deliberately minimal: enough to read a single quoted-or-bare value without
  // pulling in a dotenv dependency for one script.
  for (const rawLine of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    if (line.slice(0, eq).trim() !== name) continue;

    return line
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
  }

  return undefined;
}

const dbUrl = readEnvVar("SUPABASE_DB_URL");

if (!dbUrl) {
  console.error(
    [
      "SUPABASE_DB_URL is not set.",
      "",
      "Add it to .env.local. In the Supabase dashboard:",
      "  Project Settings -> Database -> Connection string -> URI",
      "",
      "Prefer the 'Session pooler' string (port 5432). The direct connection",
      "host is often IPv6-only and will not resolve on a typical home network.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("Generating database types...");

const result = spawnSync(
  "supabase",
  ["gen", "types", "typescript", "--db-url", dbUrl, "--schema", "public"],
  { encoding: "utf8", shell: true, maxBuffer: 32 * 1024 * 1024 },
);

if (result.error) {
  console.error(`Failed to run the Supabase CLI: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  const err = (result.stderr || "") + (result.stdout || "");

  if (/docker/i.test(err)) {
    console.error(
      [
        "The Supabase CLI could not reach Docker.",
        "",
        "`gen types --db-url` runs pg_meta in a container, so the Docker daemon",
        "must be running. Either:",
        "",
        "  1. Start Docker Desktop, then re-run `npm run db:types`; or",
        "  2. Skip Docker entirely:",
        "       npx supabase login",
        "       npx supabase gen types typescript --project-id zbjqsesdfvrjqsuyiogx > src/types/database.ts",
      ].join("\n"),
    );
    process.exit(1);
  }

  console.error(err || "supabase gen types failed.");
  process.exit(result.status ?? 1);
}

const output = result.stdout;

// The CLI exits 0 while printing a warning to stdout in some failure modes.
// Writing that to database.ts would break the build in a confusing way.
if (!output || !output.includes("export type Database")) {
  console.error(
    "The Supabase CLI did not return a schema. Output was:\n" +
      (output || result.stderr || "(empty)"),
  );
  process.exit(1);
}

const banner = [
  "// AUTO-GENERATED FILE — DO NOT EDIT BY HAND.",
  "// Regenerate with: npm run db:types",
  "// Source of truth: supabase/migrations/",
  "",
  "",
].join("\n");

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, banner + output, "utf8");

console.log(`Wrote ${OUT_FILE}`);
