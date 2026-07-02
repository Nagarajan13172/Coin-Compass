const APP_NAME = "CoinCompass";
const BRAND = "#2563eb";
const PAGE_BG = "#f1f5f9";
const CARD_BORDER = "#e2e8f0";
const FOOTER_BG = "#f8fafc";
const FOOTER_TEXT = "#94a3b8";

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

/**
 * Shared branded shell (header bar / white card / footer note) used by every
 * transactional email — mirrors the report email's look so all mail from the
 * app feels consistent.
 */
export function renderEmailShell(opts: {
  eyebrow?: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerHtml: string;
}): string {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<div style="text-align:center;margin-top:24px;">
          <a href="${opts.ctaUrl}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;font-size:14px;font-weight:600;">${esc(
            opts.ctaLabel
          )}</a>
        </div>`
      : "";

  return `
  <div style="background:${PAGE_BG};padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid ${CARD_BORDER};">
      <div style="background:${BRAND};padding:20px 24px;color:#fff;">
        <div style="font-size:13px;opacity:.85;">${esc(opts.eyebrow ?? APP_NAME)}</div>
        <div style="font-size:20px;font-weight:700;">${esc(opts.title)}</div>
      </div>
      <div style="padding:24px;">
        ${opts.bodyHtml}
        ${cta}
      </div>
      <div style="padding:14px 24px;background:${FOOTER_BG};border-top:1px solid ${CARD_BORDER};font-size:12px;color:${FOOTER_TEXT};">
        ${opts.footerHtml}
      </div>
    </div>
  </div>`;
}
