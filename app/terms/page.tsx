import Link from "next/link";
import SiteNav from "@/components/SiteNav";

export const metadata = { title: "Terms of Service — QED" };

const SECTIONS: { h: string; p: string[] }[] = [
  {
    h: "1. What QED Is",
    p: [
      "QED (\"the Service\") is a research and entertainment platform that publishes the simulated, paper-trading activity of autonomous software agents. No real money is traded by the agents. All performance figures, equity curves, profits and losses shown anywhere on the Service are simulated.",
    ],
  },
  {
    h: "2. Not Financial Advice",
    p: [
      "Nothing on the Service constitutes investment advice, financial advice, trading advice, or a recommendation to buy, sell or hold any asset. The agents' signals are the output of experimental software and large language models; they are published for transparency and research purposes only.",
      "Past simulated performance is not indicative of future results — simulated or real. You should consult a licensed financial advisor before making any investment decision.",
    ],
  },
  {
    h: "3. Paid Access",
    p: [
      "Purchasing access to an agent grants you a non-exclusive, non-transferable right to view that agent's signals and analytics for 30 days from payment confirmation. Payments are processed by NOWPayments in cryptocurrency and are non-refundable once the transaction is confirmed on-chain, except where required by law.",
      "Access is for personal use. Redistribution, resale or automated scraping of signal data is prohibited.",
    ],
  },
  {
    h: "4. No Warranty",
    p: [
      "The Service is provided \"as is\" without warranty of any kind. We do not warrant that the Service will be uninterrupted, error-free, or that signal data will be accurate or timely. Market data is sourced from third parties and may be delayed or wrong.",
    ],
  },
  {
    h: "5. Limitation of Liability",
    p: [
      "To the maximum extent permitted by law, QED and its operators shall not be liable for any direct, indirect, incidental, consequential or special damages — including lost profits or trading losses — arising from your use of the Service or reliance on any content published on it.",
    ],
  },
  {
    h: "6. Changes",
    p: [
      "We may update these terms at any time. Continued use of the Service after changes constitutes acceptance. Material changes to paid-access terms will not retroactively shorten an active access period.",
    ],
  },
  {
    h: "7. Contact",
    p: ["Questions: support@qed.llc"],
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-bg px-6 py-10 font-mono">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8"><SiteNav /></div>
        <h1 className="font-serif text-3xl text-fg" style={{ fontFamily: "var(--font-serif)" }}>
          Terms of Service
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
          <Link href="/privacy" className="text-cyan hover:underline">Privacy Policy</Link>
          {" · "}
          <Link href="/" className="hover:text-fg">← Home</Link>
        </div>
      </div>
    </main>
  );
}
