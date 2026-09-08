import type { Metadata, Viewport } from "next";

import { OnlineStatus } from "@/components/online-status";
import { PerformancePatch } from "@/components/performance-patch";
import { PwaRegister } from "@/components/pwa-register";
import { ToastProvider } from "@/components/ui";

import "./globals.css";

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
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#102a2c",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" translate="no">
      <body>
        <PerformancePatch />
        <PwaRegister />
        <OnlineStatus />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
