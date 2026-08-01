import type { Metadata } from "next";

import { Plus_Jakarta_Sans, Space_Mono, Syne } from "next/font/google";
import { CopilotKitProviderShell } from "@/components/copilot/CopilotKitProviderShell";
import "./globals.css";
// v2 owns its own stylesheet. Do NOT import @copilotkit/react-ui/styles.css —
// v1's .copilotKitButton / .copilotKitSidebar / .copilotKitWindow rules
// collide with v2's same-name selectors (different DOM, different positioning)
// and break the sidebar layout when both are loaded.
import "@copilotkit/react-core/v2/styles.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

const syne = Syne({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "DevCut",
  description:
    "The Runway desk for developers. Plan shots, generate stills and clips, stitch a durable MP4, hand off to HyperFrames.",
  openGraph: {
    title: "DevCut",
    description: "Runway video desk for developers — stills, clips, stitch, durable URL.",
    images: [{ url: "/banner.jpg", width: 1280, height: 420 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DevCut",
    description: "Runway video desk for developers — stills, clips, stitch, durable URL.",
    images: ["/banner.jpg"],
  },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✂</text></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${syne.variable} ${spaceMono.variable}`}>
      <head />
      <body
        className={`${jakarta.variable} ${syne.variable} ${spaceMono.variable} subpixel-antialiased`}
      >
        <CopilotKitProviderShell>{children}</CopilotKitProviderShell>
      </body>
    </html>
  );
}
