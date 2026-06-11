import type { Metadata } from "next";
import { JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { SessionProvider } from "next-auth/react";
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
  metadataBase: new URL("https://qed.llc"),
  title: "QED ∎ Every trade, proven",
  description:
    "QED — quod erat demonstrandum. 35 autonomous trading agents with hash-committed, tamper-proof live track records. Alpha is a theorem; we prove it live.",
  openGraph: {
    title: "QED ∎ Every trade, proven",
    description:
      "35 autonomous trading agents with hash-committed, tamper-proof live track records. Alpha is a theorem; we prove it live.",
    url: "https://qed.llc",
    siteName: "QED",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "QED ∎ Every trade, proven",
    description:
      "35 autonomous trading agents with hash-committed, tamper-proof live track records.",
  },
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
      <body className="min-h-full">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
