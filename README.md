This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Live location and push notifications

Run `supabase-ldr-features.sql` in the Supabase SQL Editor after `supabase-sync.sql`.
It enables opt-in, couple-only location sharing and creates the private push-subscription
table. Location sharing uses high-accuracy browser geolocation only while Heartlink is open
and the user has enabled sharing. Android may pause it when the PWA is backgrounded or
closed; locations older than two minutes are hidden from the partner.
The live data subscription retries with capped exponential backoff after connection errors,
reconnects promptly when the device comes back online, and shows its status without blocking
the app with browser alerts.
Both partners must enable location sharing separately. The location screen displays the
partner's local clock using the time zone reported by their device; the partner must share
location for that time zone to be available.

## Movie Watch Room

The Movies tab lets paired partners upload private movie files to the shared
`heartlink-media` bucket and sync play, pause, and seek actions in real time. Uploads use
resumable transfers and support files up to 2 GB; either partner can delete a movie, which
removes it for both devices.

Run `supabase-sync.sql` and then `supabase-ldr-features.sql` in the Supabase SQL Editor to
update the shared-data types and media bucket policies. To avoid MIME-type mismatches between
devices, the scripts leave the private bucket's MIME allowlist unset; couple-only storage
policies still control access, and the Movies UI only accepts video files. If an upload
returns a MIME type 415 error, run `supabase-movie-upload-fix.sql` by itself and confirm its
result shows `allowed_mime_types` as `NULL`. In Supabase project settings, also raise the
global maximum upload size to 2 GB (subject to the project's plan limits); SQL cannot
override that project-wide limit. Both partners need a compatible browser video codec and
an active connection; browser autoplay restrictions may require the receiving partner to
tap Play once.

Push notifications are sent through the Next.js API and require these environment variables
in local development and Vercel Production:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY` (secret; never add it to client code or commit it)
- `VAPID_SUBJECT` (for example `mailto:you@example.com`)
- `SUPABASE_SERVICE_ROLE_KEY` (secret; never expose it in a `NEXT_PUBLIC_` variable)

Generate a VAPID key pair with `npx web-push generate-vapid-keys`, then configure the public
key, private key, and subject. The existing Supabase URL and anon key are also needed by the
app. Each partner must sign in, pair, and enable notifications on each device in Heartlink
Settings. Push delivery requires internet access and browser notification permission.
Use **Settings → Check notification setup** to verify that the deployed server variables,
VAPID format, Supabase push-subscription table, pairing, and the partner's registered devices
are available. These variables belong in Vercel's project environment, not Supabase Edge
Function settings; notification delivery uses the Next.js `/api/push` routes.
If push setup or delivery fails, first run both SQL scripts in the order above, verify the
VAPID and Supabase environment variables are set for the deployed Vercel environment, and
redeploy. Then have the receiving partner open Heartlink, allow notifications, and enable
them in Settings. A PWA can receive Web Push while minimized/closed; delivery and vibration
still depend on browser support, OS notification settings, and an active internet connection.
Actions such as sending a tap must be initiated while the sender's app is open. Tap alerts use
the selected signal's haptic pattern when the receiving device supports notification vibration.
The Music Sync switch is saved per account and device. When enabled, selected tracks and
play/pause changes are shared; when disabled, playback stays local and the partner's copy
of shared playback is paused when Sync is turned off. Browser autoplay policies may require
the receiving partner to start playback with a tap.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
