import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/Toaster";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "RogueMeso",
  description: "Self-hosted hypertrophy training",
};

export const viewport: Viewport = {
  // Match the browser chrome to whichever theme the OS prefers. A manual
  // override (via the toggle) updates this <meta> at runtime.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
  colorScheme: "dark light",
};

// Runs synchronously in <head>, before first paint, so the correct theme is
// applied with no flash. Order: stored preference → system preference →
// default dark (only when the OS expresses no preference). See Next.js guide:
// "Preventing flash before hydration".
const themeScript = `(function(){try{var s=localStorage.getItem("theme");var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.setAttribute("data-theme",t);}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
