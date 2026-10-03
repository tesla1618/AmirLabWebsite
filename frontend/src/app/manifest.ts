import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AmirLab Workspace",
    short_name: "AmirLab",
    description: "Your AmirLab research workspace",
    start_url: "/workspace",
    scope: "/",
    display: "standalone",
    background_color: "#faf9f6",
    theme_color: "#1348dc",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
