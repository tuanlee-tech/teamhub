import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TeamHub",
    short_name: "TeamHub",
    description: "Smart Attendance, Automated Fines & Team Culture",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f0e6",
    theme_color: "#102a2c",
    lang: "vi",
    orientation: "any",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/maskable-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
