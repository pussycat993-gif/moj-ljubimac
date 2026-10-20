import type { MetadataRoute } from "next";

// Design System §4 "Exception — web app manifest" (CR-22): the manifest cannot read CSS variables,
// so it carries the token values as hex. theme_color = --primary, background_color = --background.
// If either token changes in app/globals.css, change it here in the same commit.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Moj Ljubimac",
    short_name: "Ljubimac",
    start_url: "/ljubimci",
    display: "standalone",
    theme_color: "#563218",
    background_color: "#F6F1EB",
    icons: [
      { src: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
