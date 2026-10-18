import { NextResponse } from "next/server";
import { createECDH } from "node:crypto";
import webPush from "web-push";
import {
  authenticateRequest,
  explainPushBackendError,
  getUserCouple,
} from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const { user, error: authError } = await authenticateRequest(request);
  if (authError || !user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const missingVariables = [
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
    ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY],
    ["VAPID_PRIVATE_KEY", process.env.VAPID_PRIVATE_KEY],
    ["VAPID_SUBJECT", process.env.VAPID_SUBJECT],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  const checks = {
    serverEnvironment: missingVariables.length === 0,
    missingVariables,
    vapidFormat: false,
    vapidKeysMatch: false,
    pairing: false,
    subscriptionTable: false,
    partnerSubscription: false,
    partnerSubscriptionCount: 0,
  };

  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    || !process.env.VAPID_PRIVATE_KEY
    || !process.env.VAPID_SUBJECT) {
    return NextResponse.json({ checks });
  }

  try {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    checks.vapidFormat = true;
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(process.env.VAPID_PRIVATE_KEY, "base64url"));
    checks.vapidKeysMatch = ecdh.getPublicKey()
      .equals(Buffer.from(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, "base64url"));
  } catch (error) {
    console.error("VAPID settings failed validation:", error);
  }

  if (missingVariables.includes("SUPABASE_SERVICE_ROLE_KEY")
    || missingVariables.includes("NEXT_PUBLIC_SUPABASE_URL")) {
    return NextResponse.json({ checks });
  }

  try {
    const { admin, couple } = await getUserCouple(user.email);
    checks.pairing = Boolean(couple);
    if (!couple) return NextResponse.json({ checks });

    const partnerEmail = (couple.user1_email.toLowerCase() === user.email
      ? couple.user2_email
      : couple.user1_email)?.toLowerCase();
    const { count, error } = await admin.from("couple_push_subscriptions")
      .select("endpoint", { count: "exact", head: true })
      .eq("couple_code", couple.couple_code)
      .eq("user_email", partnerEmail ?? "");
    if (error) throw error;

    checks.subscriptionTable = true;
    checks.partnerSubscriptionCount = count ?? 0;
    checks.partnerSubscription = checks.partnerSubscriptionCount > 0;
    return NextResponse.json({ checks });
  } catch (error) {
    const message = explainPushBackendError(error, "check push notification setup");
    return NextResponse.json({ checks, error: message }, { status: 200 });
  }
}
