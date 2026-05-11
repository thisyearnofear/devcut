import type { Metadata } from "next";

import { Plus_Jakarta_Sans, Spline_Sans_Mono } from "next/font/google";
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

const splineMono = Spline_Sans_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Director's Canvas",
  description:
    "Agent-directed video production. Type a brief — watch a LangGraph agent decompose it into shots, generate Runway stills, animate each into a clip, and stitch a final MP4.",
  openGraph: {
    title: "Director's Canvas",
    description: "Agent-directed video production powered by Runway.",
    images: [{ url: "/banner.jpg", width: 1280, height: 420 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Director's Canvas",
    description: "Agent-directed video production powered by Runway.",
    images: ["/banner.jpg"],
  },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦬</text></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${splineMono.variable}`}>
      <head>
        {/* Runway Characters widget */}
        <script
          src="https://cdn.dev.runwayml.com/prod/widget.js"
          data-pub-key="pub_01163893d305f4fceb059eba9fc49e8f7b9a53f19cd9f4235fe7486bd54f40b2"
          async
        />
      </head>
      <body className={`${jakarta.variable} ${splineMono.variable} subpixel-antialiased`}>
        <CopilotKitProviderShell>{children}</CopilotKitProviderShell>
      </body>
    </html>
  );
}
