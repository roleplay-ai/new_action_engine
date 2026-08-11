import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Action Engine",
    short_name: "Action Engine",
    description: "A behavioral science platform designed to bridge the 'Knowing-Doing Gap'.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFFDF5",
    theme_color: "#FFCE00",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
