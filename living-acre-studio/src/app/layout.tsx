import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { StudioShell } from "@/components/shell";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "go.dharaa — The Living Acre · Autonomous Rural-Life Video Studio",
  description:
    "Autonomous AI-assisted production and publishing platform for immersive first-person rural-life video. One acre, one farmer, one honest day at a time.",
};

export const viewport: Viewport = {
  themeColor: "#12100e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${manrope.variable} ${mono.variable}`}>
      <body className="bg-ink text-cream font-sans antialiased">
        <StudioShell>{children}</StudioShell>
      </body>
    </html>
  );
}
