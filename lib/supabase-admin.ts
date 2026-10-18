import { createClient } from "@supabase/supabase-js";

export function explainPushBackendError(error: unknown, action: string) {
  const details = error as { code?: string; message?: string; statusCode?: number };
  const message = details?.message ?? "";

  if (message.includes("Server Supabase configuration is missing")) {
    return "Push service is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel. Add the server variables and redeploy.";
  }
  if (details?.code === "42P01" || details?.code === "PGRST205") {
    if (/couples/i.test(message)) {
      return "Supabase couple pairing tables are missing. Run supabase-sync.sql, then supabase-ldr-features.sql.";
    }
    return "Push subscription storage is missing. Run supabase-ldr-features.sql after supabase-sync.sql in Supabase SQL Editor.";
  }
  if (details?.code === "42501") {
    return "Supabase denied access to push subscription storage. Confirm SUPABASE_SERVICE_ROLE_KEY is the service-role key and redeploy.";
  }
  if (details?.statusCode === 401 || details?.statusCode === 403 || /vapid/i.test(message)) {
    return "Push provider rejected the VAPID configuration. Check that NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are a matching pair in Vercel, then redeploy.";
  }
  if (details?.statusCode === 404 || details?.statusCode === 410) {
    return "The push subscription expired. Have the receiving partner enable notifications again on their device.";
  }

  console.error(`Push backend action failed (${action}):`, error);
  return `Unable to ${action}. Check the Supabase push migration and Vercel server environment variables.`;
}

export function createSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server Supabase configuration is missing.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function authenticateRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!token || !supabaseUrl || !anonKey) {
    return { user: null, error: "Authentication required." };
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user?.email) {
    return { user: null, error: "Your session is invalid or expired." };
  }

  return { user: { id: data.user.id, email: data.user.email.toLowerCase() }, error: null };
}

export async function getUserCouple(email: string) {
  const admin = createSupabaseAdmin();
  const { data: first, error: firstError } = await admin
    .from("couples")
    .select("couple_code,user1_email,user2_email")
    .ilike("user1_email", email)
    .maybeSingle();

  if (firstError) throw firstError;
  if (first) return { admin, couple: first };

  const { data: second, error: secondError } = await admin
    .from("couples")
    .select("couple_code,user1_email,user2_email")
    .ilike("user2_email", email)
    .maybeSingle();

  if (secondError) throw secondError;
  return { admin, couple: second };
}
