import type { MetadataRoute } from "next";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

/** Installable on phones ("Add to Home Screen"): opens straight into the app without browser chrome. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_TAGLINE,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
