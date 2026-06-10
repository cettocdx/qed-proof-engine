import type { Metadata } from "next";
import { JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "QED ∎ Every trade, proven",
  description:
    "QED — quod erat demonstrandum. 35 autonomous trading agents with hash-committed, tamper-proof live track records. Alpha is a theorem; we prove it live.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jetbrains.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
