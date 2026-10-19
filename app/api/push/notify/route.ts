import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import webPush from "web-push";
import { authenticateRequest, explainPushBackendError, getUserCouple } from "@/lib/supabase-admin";

interface PushNotificationInput {
  kind?: unknown;
  text?: unknown;
  hapticType?: unknown;
}

interface StoredSubscription {
  endpoint: string;
  subscription: webPush.PushSubscription;
}

export async function POST(request: Request) {
  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) {
      return NextResponse.json({
        error: "Push notifications are not configured in Vercel. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT, then redeploy.",
      }, { status: 503 });
    }

    const { user, error: authError } = await authenticateRequest(request);
    if (authError || !user) return NextResponse.json({ error: authError }, { status: 401 });

    const body = await request.json() as PushNotificationInput;
    if ((body.kind !== "message" && body.kind !== "signal")
      || typeof body.text !== "string"
      || !body.text.trim()
      || body.text.length > 500
      || (body.hapticType !== undefined
        && body.hapticType !== "MISS_YOU"
        && body.hapticType !== "NEED_YOU"
        && body.hapticType !== "LOVE_YOU"
        && body.hapticType !== "SORRY")) {
      return NextResponse.json({ error: "Invalid notification content." }, { status: 400 });
    }

    const { admin, couple } = await getUserCouple(user.email);
    if (!couple) return NextResponse.json({ error: "Pair your account before sending notifications." }, { status: 409 });

    const recipientEmail = (couple.user1_email.toLowerCase() === user.email
      ? couple.user2_email
      : couple.user1_email)?.toLowerCase();
    if (!recipientEmail) return NextResponse.json({ sent: 0, reason: "Partner has not paired yet." });

    const { data, error } = await admin.from("couple_push_subscriptions")
      .select("endpoint,subscription")
      .eq("couple_code", couple.couple_code)
      .eq("user_email", recipientEmail);
    if (error) throw error;

    const subscriptions = (data ?? []) as StoredSubscription[];
    if (subscriptions.length === 0) {
      return NextResponse.json({
        sent: 0,
        reason: "Your partner needs to enable notifications on their device in Heartlink Settings.",
      });
    }

    webPush.setVapidDetails(subject, publicKey, privateKey);
    const title = body.kind === "message" ? "New Heartlink message" : "Heartlink tap";
    const payload = JSON.stringify({
      title,
      body: body.text.trim().slice(0, 180),
      url: "/",
      tag: `heartlink-${body.kind}-${randomUUID()}`,
      hapticType: body.kind === "signal" ? body.hapticType : undefined,
    });

    const results = await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(subscription.subscription, payload);
        return { sent: true, statusCode: undefined };
      } catch (pushError) {
        const statusCode = (pushError as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          const { error: deleteError } = await admin.from("couple_push_subscriptions")
            .delete()
            .eq("endpoint", subscription.endpoint);
          if (deleteError) console.error("Unable to remove an expired push subscription:", deleteError);
        } else {
          console.error("Push delivery failed:", pushError);
        }
        return { sent: false, statusCode, error: pushError };
      }
    }));

    const sent = results.filter((result) => result.sent).length;
    if (sent === 0) {
      const failure = results.find((result) => !result.sent);
      const reason = failure
        ? explainPushBackendError(failure.error, "send the partner notification")
        : "No active push subscription was found.";
      return NextResponse.json({ error: reason }, { status: 502 });
    }

    return NextResponse.json({ sent, total: subscriptions.length });
  } catch (error) {
    const message = explainPushBackendError(error, "send the partner notification");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
