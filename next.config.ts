import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A test instance can run beside the production `next start` on 3000 without
  // touching the .next chunks it is serving:  NEXT_DIST_DIR=.next-dev npx next dev -p 3001
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Admin client uses untyped Supabase calls (no generated database.types yet).
  // Remove this after running: npx supabase gen types typescript --project-id <ref>
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
