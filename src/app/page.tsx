import type { Metadata } from "next";
import Script from "next/script";
import "./landing.css";
import { STRUCTURED_DATA, LANDING_BODY_HTML, LANDING_BEHAVIOR_SCRIPT } from "./landing-content";

// Public marketing landing — entry point for new-member signup/login.
// Transcribed from the standalone zentro-med-landing.html design (own
// CSS/fonts/tracking scripts, not the app's Tailwind design system).
// Rendered as raw HTML via dangerouslySetInnerHTML so the original
// inline onclick="..." handlers keep working once LANDING_SCRIPT (a
// real <Script>, not innerHTML) defines the global functions they
// call — script tags inside innerHTML never execute, but HTML
// attribute handlers do once the referenced globals exist.
//
// Root layout.tsx sets robots: { index: false, follow: false } for
// the whole app (it's a private CRM). This is the one page meant to
// be crawled, so it overrides that here.
export const metadata: Metadata = {
  title: "Zentro Med — Más pacientes. Sin caos administrativo.",
  description:
    "CRM de gestión comercial con WhatsApp + marketing digital gestionado para consultorios y clínicas en Latinoamérica. Prueba 30 días gratis, sin tarjeta.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://med.zentrolabs.com" },
};

export default function LandingPage() {
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
