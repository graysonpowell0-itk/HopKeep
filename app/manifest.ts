import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HopKeep Command Center",
    short_name: "HopKeep",
    description: "Hotel maintenance command center for technicians, property managers, and admins.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f1d2f",
    theme_color: "#6c933e",
    icons: [
      {
        src: "/icons/hopkeep-app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/hopkeep-app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/hopkeep-app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
