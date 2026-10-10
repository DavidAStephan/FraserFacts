import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";

const display = Fredoka({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const sans = Nunito({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Fraser Facts",
  description: "Live dashboard for deciding whether to swim at Dawn Fraser Baths in Balmain, Sydney."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en-AU" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
