import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ghn. — quiet GitHub notifications",
    short_name: "ghn",
    start_url: "/",
    display: "standalone",
    background_color: "#0D1526",
    theme_color: "#1A2332",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
