import Link from "next/link";
import SiteNav from "@/components/SiteNav";

export const metadata = { title: "Privacy Policy — QED" };

const SECTIONS: { h: string; p: string[] }[] = [
  {
    h: "1. What We Collect",
    p: [
      "Email address — when you join a waitlist or purchase agent access.",
      "Payment metadata — order ID, payment status, amount and currency, provided by our payment processor NOWPayments. We never see or store your wallet private keys or full card details.",
      "Basic server logs — IP address and request paths, kept briefly for security and debugging.",
    ],
  },
  {
    h: "2. What We Do With It",
    p: [
      "We use your email solely to deliver the service you asked for: waitlist notifications, payment confirmations and access credentials. We do not sell, rent or share your personal data with third parties for marketing.",
    ],
  },
  {
    h: "3. Payments",
    p: [
      "Cryptocurrency payments are processed by NOWPayments (nowpayments.io). Their handling of your data is governed by their own privacy policy. On-chain transactions are public by nature of blockchains.",
    ],
  },
  {
    h: "4. Storage & Retention",
    p: [
      "Data is stored on servers operated by Fly.io. Waitlist and subscriber records are retained while your access or interest is active; you may request deletion at any time by emailing us.",
    ],
  },
  {
    h: "5. Cookies & Analytics",
    p: [
      "The Service uses only essential cookies (session authentication for admin). No third-party advertising trackers are installed.",
    ],
  },
  {
    h: "6. Your Rights",
    p: [
      "You may request a copy of, correction of, or deletion of your personal data at any time. Email us and we will respond within 30 days.",
    ],
  },
  {
    h: "7. Contact",
    p: ["Data requests: support@qed.llc"],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-bg px-6 py-10 font-mono">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8"><SiteNav /></div>
        <h1 className="font-serif text-3xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
          Privacy Policy
        </h1>
        <p className="mt-1 text-[11px] text-fg-mute">Last updated: June 11, 2026</p>

        <div className="mt-8 space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.h}>
              <h2 className="mb-2 text-[13px] tracking-wider text-cyan">{s.h}</h2>
              {s.p.map((para, i) => (
                <p key={i} className="mb-2 text-[12px] leading-relaxed text-fg-dim">{para}</p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-10 border-t border-border pt-4 text-[11px] text-fg-mute">
          <Link href="/terms" className="text-cyan hover:underline">Terms of Service</Link>
          {" · "}
          <Link href="/" className="hover:text-fg">← Home</Link>
        </div>
      </div>
    </main>
  );
}
