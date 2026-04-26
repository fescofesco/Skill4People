import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The AI Scientist",
  description: "Turn a scientific hypothesis into a review-ready experiment plan.",
  manifest: "/manifest.webmanifest",
  applicationName: "The AI Scientist",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AI Scientist"
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }]
  },
  openGraph: {
    title: "The AI Scientist",
    description: "Turn a scientific hypothesis into a review-ready experiment plan.",
    type: "website"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
