"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

// Zoho Desk chat widget (customer support), on every page including
// the public marketing/auth pages, not just the authenticated
// dashboard — EXCEPT the root marketing landing ("/"), which ships its
// own WhatsApp float button and would otherwise show two floating
// chat bubbles stacked on top of each other.
//
// The nonce Zoho's snippet expects is dropped — this app's CSP ships
// as Content-Security-Policy-Report-Only (see next.config.ts) with no
// nonce-issuing machinery, so a literal '{place_your_nonce_value_here}'
// placeholder would just be dead weight, not a working nonce.
// im.zoho.com is allowlisted in next.config.ts's script-src/connect-src
// for when that CSP is eventually flipped to enforced.
const ZOHO_DESK_WIDGET_SCRIPT = `
window.ZOHOIM = window.ZOHOIM || function(a, b) { ZOHOIM[a] = b; };
window.ZOHOIM.prefilledMessage = "";
(function() {
  var d = document;
  var s = d.createElement('script');
  s.type = 'text/javascript';
  s.defer = true;
  s.src = "https://im.zoho.com/api/v1/public/channel/fbfb7e1887b655f1bbbff99948f9b2aa/widget";
  d.getElementsByTagName('head')[0].appendChild(s);
})();
`;

// Zoho's own launcher bubble renders as a plain (non-shadow-DOM) <div>
// with a near-max z-index (2147483645) fixed to the bottom-right
// corner — confirmed live via devtools: `[data-id="im-bm-bubble"]`
// inside `#im-visitor-components`. Those data-* attributes are
// semantic/product-code-driven (not the accompanying `zim<hash>...`
// CSS module classes, which are build-hash-derived and would break on
// Zoho's next widget deploy), so they're the stable hook here.
//
// On /inbox's mobile layout the message composer spans full width
// with controls at BOTH edges (attach/template/AI icons on the left,
// send on the right) — there's no corner left to relocate the bubble
// to without it landing on something. Moving it to the opposite
// corner (tried first) still collided. Hidden below the md breakpoint
// on /inbox only; kept visible on wider viewports (desktop has room)
// and on every other route. There's no documented JS config for this
// in Zoho's IM widget embed (unlike SalesIQ's), so a scoped CSS
// override is the only lever available short of removing the widget
// from /inbox altogether.
const INBOX_BUBBLE_MOBILE_HIDE_CSS = `
  @media (max-width: 767px) {
    [data-id="im-bm-bubble"] {
      display: none !important;
    }
  }
`;

export function ZohoDeskWidget() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <>
      <Script
        id="zoho-desk-widget"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: ZOHO_DESK_WIDGET_SCRIPT }}
      />
      {pathname?.startsWith("/inbox") && (
        <style id="zoho-desk-widget-inbox-override">{INBOX_BUBBLE_MOBILE_HIDE_CSS}</style>
      )}
    </>
  );
}
