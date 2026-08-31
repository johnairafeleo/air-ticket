import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/require-user";

/**
 * There is no marketing page — this is an internal tool. Send people to the
 * right place based on whether they are signed in.
 */
export default async function HomePage() {
  const session = await getSession();
  redirect(session ? "/dashboard" : "/login");
}
