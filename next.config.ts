import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  logging: {
    /**
     * Next.js 16 logs every Server Function call to the dev terminal *with its
     * arguments*, so signing in printed:
     *
     *   ƒ login({"email":"…","password":"…"}, undefined) in 1268ms
     *
     * — a real password in plaintext, into scrollback, CI output and any
     * screen share. The logging has no per-action opt-out and no redaction, and
     * this app passes credentials to Server Actions by design (login, register,
     * password reset, change password), so the only fix is to turn it off.
     *
     * Dev-only setting; production builds never logged this.
     */
    serverFunctions: false,
  },
};

export default nextConfig;
