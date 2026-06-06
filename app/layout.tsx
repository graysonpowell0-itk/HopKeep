import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "HopKeep Command Center",
  description: "Hotel maintenance logs, approvals, out-of-order rooms, and scheduled work.",
  applicationName: "HopKeep",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "HopKeep",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/hopkeep-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/hopkeep-app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/hopkeep-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f1d2f",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
