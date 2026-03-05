import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GenieF1 — Live Race Engineer Dashboard",
  description: "Real-time AI-powered F1 race engineering dashboard with live telemetry, strategy projections, and track visualization. 2026 New Regulations Era.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-black text-white antialiased">
        {children}
      </body>
    </html>
  );
}
