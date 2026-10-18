import { createClient } from "@supabase/supabase-js";

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
