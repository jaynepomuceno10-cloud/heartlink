import { NextResponse } from "next/server";
import { authenticateRequest, explainPushBackendError, getUserCouple } from "@/lib/supabase-admin";

interface PushSubscriptionValue {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
}

interface PushSubscriptionInput {
  subscription?: PushSubscriptionValue;
  vapidPublicKey?: unknown;
}

function isSupportedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.toLowerCase();
    const trustedPushHosts = [
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "push.services.mozilla.com",
      "web.push.apple.com",
    ];

    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && (trustedPushHosts.includes(hostname) || hostname.endsWith(".notify.windows.com"));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const { user, error: authError } = await authenticateRequest(request);
    if (authError || !user) return NextResponse.json({ error: authError }, { status: 401 });

    const body = await request.json() as PushSubscriptionInput;
    const subscription = body.subscription;
    if (typeof subscription?.endpoint !== "string"
      || !isSupportedPushEndpoint(subscription.endpoint)
      || typeof subscription.keys?.p256dh !== "string"
      || typeof subscription.keys.auth !== "string") {
      return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) {
      return NextResponse.json({
        error: "Push notifications are not configured in Vercel. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT, then redeploy.",
      }, { status: 503 });
    }
    if (body.vapidPublicKey !== publicKey) {
      return NextResponse.json({
        error: "The browser and server VAPID public keys do not match. Set the same public key in the Vercel build/runtime environment and redeploy.",
      }, { status: 409 });
    }

    const { admin, couple } = await getUserCouple(user.email);
    if (!couple) return NextResponse.json({ error: "Pair your account before enabling notifications." }, { status: 409 });

    const { data: existing, error: lookupError } = await admin.from("couple_push_subscriptions")
      .select("user_id")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing && existing.user_id !== user.id) {
      return NextResponse.json({ error: "This device subscription is already registered to another account." }, { status: 409 });
    }

    const { error } = await admin.from("couple_push_subscriptions").upsert({
      endpoint: subscription.endpoint,
      user_id: user.id,
      user_email: user.email,
      couple_code: couple.couple_code,
      subscription,
    }, { onConflict: "endpoint" });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = explainPushBackendError(error, "enable push notifications");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, error: authError } = await authenticateRequest(request);
    if (authError || !user) return NextResponse.json({ error: authError }, { status: 401 });

    const body = await request.json() as { endpoint?: unknown };
    if (typeof body.endpoint !== "string" || !isSupportedPushEndpoint(body.endpoint)) {
      return NextResponse.json({ error: "Invalid push endpoint." }, { status: 400 });
    }

    const { admin } = await getUserCouple(user.email);
    const { error } = await admin.from("couple_push_subscriptions")
      .delete()
      .eq("endpoint", body.endpoint)
      .eq("user_id", user.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = explainPushBackendError(error, "disable push notifications");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
