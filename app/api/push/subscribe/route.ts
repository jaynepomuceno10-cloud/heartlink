import { NextResponse } from "next/server";
import { authenticateRequest, getUserCouple } from "@/lib/supabase-admin";

interface PushSubscriptionInput {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
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
    if (typeof body.endpoint !== "string"
      || !isSupportedPushEndpoint(body.endpoint)
      || typeof body.keys?.p256dh !== "string"
      || typeof body.keys.auth !== "string") {
      return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
    }

    const { admin, couple } = await getUserCouple(user.email);
    if (!couple) return NextResponse.json({ error: "Pair your account before enabling notifications." }, { status: 409 });

    const { data: existing, error: lookupError } = await admin.from("couple_push_subscriptions")
      .select("user_id")
      .eq("endpoint", body.endpoint)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing && existing.user_id !== user.id) {
      return NextResponse.json({ error: "This device subscription is already registered to another account." }, { status: 409 });
    }

    const { error } = await admin.from("couple_push_subscriptions").upsert({
      endpoint: body.endpoint,
      user_id: user.id,
      user_email: user.email,
      couple_code: couple.couple_code,
      subscription: body,
    }, { onConflict: "endpoint" });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to save push subscription:", error);
    return NextResponse.json({ error: "Unable to enable push notifications." }, { status: 500 });
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
    console.error("Unable to remove push subscription:", error);
    return NextResponse.json({ error: "Unable to disable push notifications." }, { status: 500 });
  }
}
