import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * Lazily-created service-role client. SERVER ONLY — never import from client components.
 *
 * Typed as an untyped client on purpose: this project has no generated Database
 * types, and without them supabase-js resolves every insert/update payload to
 * `never`, which breaks `tsc` on every write in the admin API. Reads are
 * unaffected either way.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: ReturnType<typeof createAdminClient<any>> | null = null;

export function getAdminClient() {
  if (!_admin) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _admin = createAdminClient<any>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _admin;
}
