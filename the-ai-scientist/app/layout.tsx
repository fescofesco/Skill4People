import type { Metadata, Viewport } from "next";
import "./globals.css";

const PRODUCT_NAME = "Helix";
const PRODUCT_TAGLINE = "AI-assisted scientific planning workspace";
const PRODUCT_DESCRIPTION =
  "Turn a natural language research question into a screened, defensible experiment plan with literature awareness and transparent assumptions.";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`,
  description: PRODUCT_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  applicationName: PRODUCT_NAME,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: PRODUCT_NAME
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }]
  },
  openGraph: {
    title: `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`,
    description: PRODUCT_DESCRIPTION,
    type: "website"
  }
};

export const viewport: Viewport = {
  themeColor: "#0b1733",
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
