import type { Metadata, Viewport } from "next";
import { Archivo_Narrow } from "next/font/google";

import { OnlineStatus } from "@/components/online-status";
import { PerformancePatch } from "@/components/performance-patch";
import { PwaRegister } from "@/components/pwa-register";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { ToastProvider } from "@/components/ui";

import "./globals.css";

const archivo = Archivo_Narrow({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: {
    default: "TeamHub",
    template: "%s | TeamHub",
  },
  description: "Smart Attendance, Automated Fines & Team Culture",
  applicationName: "TeamHub",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TeamHub",
  },
  formatDetection: {
    telephone: false,
  },
  // Bypass ngrok free interstitial (ERR_NGROK_6024) for manifest fetch:
  // browser fetch for /manifest.webmanifest without header gets HTML warning → Syntax error.
  // Adding query param lets curl test return JSON even without header.
  manifest: "/manifest.webmanifest?ngrok-skip-browser-warning=true",
  icons: {
    icon: [
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d1117",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" translate="no" className={archivo.variable}>
      <body>
        <PerformancePatch />
        <PwaRegister />
        <PullToRefresh />
        <OnlineStatus />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
