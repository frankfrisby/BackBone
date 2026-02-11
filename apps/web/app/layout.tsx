import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "BACKBONE - Life Optimization Engine",
  description: "AI-powered life management system",
  // The app is served from Express at `/app` (Next basePath). Keep the manifest under `/app`
  // so the browser doesn't request a root-level `/manifest.json` that may be cached as a 404.
  manifest: "/app/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BACKBONE",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="icon" type="image/png" href="/app/favicon.png" />
        <link rel="shortcut icon" type="image/png" href="/app/favicon.png" />
        <link rel="apple-touch-icon" href="/app/icons/icon-192.png" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
