import type { Metadata } from "next";
import Script from "next/script";
import "../landing.css";
import { STRUCTURED_DATA, LANDING_BODY_HTML, LANDING_BEHAVIOR_SCRIPT } from "./landing-content";

// Alternate public marketing landing, 100% focused on the CRM pitch
// (WhatsApp + IA + agenda + seguimiento de pacientes) with managed
// marketing mentioned only as a secondary upgrade — a separate page
// from the root "/" landing (CRM + marketing agency, 2-in-1 pitch),
// not a replacement for it. Same rendering approach as "/" (raw HTML
// via dangerouslySetInnerHTML, own CSS/fonts/tracking scripts), just
// its own copy in ./landing-content.ts.
//
// Root layout.tsx sets robots: { index: false, follow: false } for
// the whole app (it's a private CRM). This page overrides that here,
// same as "/".
export const metadata: Metadata = {
  // Root layout.tsx's title template ("%s — Zuhma Med CRM") applies to
  // this page (it's a nested segment, unlike the root "/" page.tsx,
  // which Next.js exempts from its own layout's template) — so this
  // is deliberately NOT prefixed with "Zuhma Med CRM" like "/"'s title
  // is, to avoid it appearing twice in the rendered <title>.
  title: "Más pacientes. Sin caos administrativo.",
  description:
    "CRM de WhatsApp con IA para consultorios y clínicas en Latinoamérica: agenda online 24/7, seguimiento y reactivación de pacientes. Marketing gestionado disponible como upgrade. Prueba 30 días gratis, sin tarjeta.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://app.zuhma.com/crm" },
};

export default function CrmLandingPage() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- deliberately scoped to just this page, not the app-wide font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap"
        rel="stylesheet"
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />

      <div className="zm-landing" dangerouslySetInnerHTML={{ __html: LANDING_BODY_HTML }} />

      <Script id="zm-lucide" src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js" strategy="afterInteractive" />
      <Script
        id="zm-behavior"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: LANDING_BEHAVIOR_SCRIPT }}
      />
      <Script id="zm-meta-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '2174696826436902');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element -- tracking pixel, not a real content image */}
        <img
          height={1}
          width={1}
          style={{ display: "none" }}
          src="https://www.facebook.com/tr?id=2174696826436902&ev=PageView&noscript=1"
          alt=""
        />
      </noscript>
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-C701FB52EP" strategy="afterInteractive" />
      <Script id="zm-ga4" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-C701FB52EP');
        `}
      </Script>
    </>
  );
}
