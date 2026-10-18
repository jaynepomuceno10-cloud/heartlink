import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Heartlink",
    short_name: "Heartlink",
    description: "A private shared space for two hearts, wherever you are.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    orientation: "portrait",
    background_color: "#080c14",
    theme_color: "#080c14",
    icons: [
      {
        src: "/heartlink-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/heartlink-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/heartlink-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
