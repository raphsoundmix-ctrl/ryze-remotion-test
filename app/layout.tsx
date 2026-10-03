import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ryze Video Engine: prototype",
  description: "Remotion template engine: idea -> script -> assets -> manifest -> video",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
