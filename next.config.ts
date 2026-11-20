import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A test instance can run beside the production `next start` on 3000 without
  // touching the .next chunks it is serving:  NEXT_DIST_DIR=.next-dev npx next dev -p 3001
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The standalone set catalog is folded into the track's campaign map. A config
  // redirect answers with a real 307 before any rendering — a page-level redirect()
  // behind a loading boundary degrades to a 1s meta refresh, which is exactly the
  // sluggishness this redesign is removing.
  async redirects() {
    return [{ source: "/review/:track/sets", destination: "/review/:track", permanent: false }];
  },
  // Admin client uses untyped Supabase calls (no generated database.types yet).
  // Remove this after running: npx supabase gen types typescript --project-id <ref>
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
