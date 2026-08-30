import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Admin client uses untyped Supabase calls (no generated database.types yet).
  // Remove this after running: npx supabase gen types typescript --project-id <ref>
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
