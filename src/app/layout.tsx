import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Octane 8 Warmup Trigger",
  description: "Trigger the Octane 8 account warmup n8n workflow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
