/**
 * Transactional email via Resend (https://resend.com) — plain fetch, no SDK.
 * If RESEND_API_KEY is not configured, sends are skipped and logged so the
 * payment pipeline never breaks on email failures.
 */

const FROM = process.env.EMAIL_FROM ?? "QED <onboarding@resend.dev>";

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY not set — skipped "${subject}" to ${to}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error(`[email] send failed (${res.status}):`, (await res.text()).slice(0, 200));
      return false;
    }
    console.log(`[email] sent "${subject}" to ${to}`);
    return true;
  } catch (e) {
    console.error("[email] send error:", (e as Error).message);
    return false;
  }
}

export function accessKeyEmail(opts: {
  agentId: string;
  agentName?: string;
  accessKey: string;
  expiresAt: string;
}): { subject: string; html: string } {
  const name = opts.agentName ?? opts.agentId;
  return {
    subject: `QED — your access key for ${name}`,
    html: `
<div style="font-family:monospace;max-width:560px;margin:0 auto;padding:24px;background:#0a0f1a;color:#e2e8f0">
  <h2 style="color:#22d3ee;margin:0 0 4px">QED ∎</h2>
  <p style="font-size:13px;color:#94a3b8">Payment confirmed — your agent access is live.</p>
  <div style="border:1px solid #1e293b;padding:16px;margin:16px 0">
    <div style="font-size:11px;color:#64748b;letter-spacing:2px">AGENT</div>
    <div style="font-size:15px;margin:2px 0 12px">${name} (${opts.agentId})</div>
    <div style="font-size:11px;color:#64748b;letter-spacing:2px">ACCESS KEY</div>
    <div style="font-size:15px;color:#22d3ee;margin:2px 0 12px">${opts.accessKey}</div>
    <div style="font-size:11px;color:#64748b;letter-spacing:2px">VALID UNTIL</div>
    <div style="font-size:13px;margin:2px 0">${opts.expiresAt.slice(0, 10)}</div>
  </div>
  <p style="font-size:13px">
    Activate your device: <a href="https://qed.llc/account" style="color:#22d3ee">qed.llc/account</a><br/>
    Then open <a href="https://qed.llc/strategy/${opts.agentId}" style="color:#22d3ee">your agent's live dossier</a>.
  </p>
  <p style="font-size:11px;color:#64748b">Paper trading only · Simulated performance · Not financial advice ∎</p>
</div>`,
  };
}

export function expiryReminderEmail(opts: {
  agentId: string;
  expiresAt: string;
}): { subject: string; html: string } {
  return {
    subject: `QED — your ${opts.agentId} access expires ${opts.expiresAt.slice(0, 10)}`,
    html: `
<div style="font-family:monospace;max-width:560px;margin:0 auto;padding:24px;background:#0a0f1a;color:#e2e8f0">
  <h2 style="color:#22d3ee;margin:0 0 4px">QED ∎</h2>
  <p style="font-size:13px">Your access to <b>${opts.agentId}</b> expires on <b>${opts.expiresAt.slice(0, 10)}</b>.</p>
  <p style="font-size:13px">
    Renew anytime: <a href="https://qed.llc/hire" style="color:#22d3ee">qed.llc/hire</a>
  </p>
  <p style="font-size:11px;color:#64748b">Paper trading only · Not financial advice ∎</p>
</div>`,
  };
}
