// Static content for the public marketing landing (src/app/page.tsx).
// Split out from the page component so the ~40KB of embedded
// CSS/HTML/script string constants aren't all resident in the
// same module as the component + its imports — keeps each
// module's build-time footprint smaller (webpack processes/GCs
// modules more granularly), which matters on memory-constrained
// build containers (see next.config.ts's cpus:1 comment for the
// full history of this project's Docker build memory tuning).

export const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://med.zentrolabs.com/#organization",
      name: "Zentro Med",
      url: "https://med.zentrolabs.com",
      description: "CRM comercial y marketing digital para consultorios médicos en Latinoamérica.",
      areaServed: ["CO", "MX", "AR", "CL", "PE", "ES"],
    },
    {
      "@type": "Service",
      "@id": "https://med.zentrolabs.com/#service",
      name: "CRM y Marketing Digital para Consultorios",
      provider: { "@id": "https://med.zentrolabs.com/#organization" },
      description:
        "Plataforma de gestión comercial y marketing para consultorios: CRM de contactos, agenda online 24/7, WhatsApp automatizado y campañas de captación digital gestionadas.",
      serviceType: "Software CRM y Marketing para Salud",
      areaServed: ["CO", "MX", "AR", "CL", "PE", "ES"],
    },
    {
      "@type": "AggregateRating",
      itemReviewed: { "@id": "https://med.zentrolabs.com/#service" },
      ratingValue: "5",
      bestRating: "5",
      ratingCount: "80",
    },
  ],
};

export const LANDING_BODY_HTML = `
<!-- NAV -->
<nav>
  <div class="wrap">
    <div class="nav-i">
      <a href="/" class="logo">
        <img src="/zentro-isotipo.png" alt="" style="height:26px;width:26px;">
        <span class="logo-text">zentro</span>
        <span class="logo-badge">Med</span>
      </a>
      <div class="nav-r">
        <a href="#como" class="nav-link">Cómo funciona</a>
        <a href="#planes" class="nav-link">Planes</a>

        <div class="curr-switch" id="currSwitch">
          <button class="curr-btn" onclick="zmToggleCurr(event)" aria-label="Cambiar moneda">
            <span id="currFlag">🇺🇸</span>
            <span id="currCode">USD</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="curr-dropdown">
            <button class="curr-opt curr-active" data-curr="USD" onclick="zmSetCurr('USD')">
              <span class="curr-flag">🇺🇸</span><span class="curr-name">USD</span><span class="curr-sym">$</span>
            </button>
            <button class="curr-opt" data-curr="MXN" onclick="zmSetCurr('MXN')">
              <span class="curr-flag">🇲🇽</span><span class="curr-name">MXN</span><span class="curr-sym">$</span>
            </button>
            <button class="curr-opt" data-curr="COP" onclick="zmSetCurr('COP')">
              <span class="curr-flag">🇨🇴</span><span class="curr-name">COP</span><span class="curr-sym">$</span>
            </button>
            <button class="curr-opt" data-curr="ARS" onclick="zmSetCurr('ARS')">
              <span class="curr-flag">🇦🇷</span><span class="curr-name">ARS</span><span class="curr-sym">$</span>
            </button>
            <button class="curr-opt" data-curr="GTQ" onclick="zmSetCurr('GTQ')">
              <span class="curr-flag">🇬🇹</span><span class="curr-name">GTQ</span><span class="curr-sym">Q</span>
            </button>
          </div>
        </div>

        <a href="/login" class="nav-login" aria-label="Iniciar sesión">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          <span class="nav-login-text">Iniciar sesión</span>
        </a>
        <a href="/signup" class="btn btn-green btn-sm">Empezar gratis →</a>
      </div>
    </div>
  </div>
</nav>

<!-- HERO -->
<section class="hero">
  <div class="wrap">
    <div class="hero-eyebrow">
      <span class="pill-dark"><span class="dot-green"></span>CRM + equipo de marketing · Todo en uno</span>
      <span class="pill-dark" style="background:rgba(245,158,11,.1);color:#fcd34d;border-color:rgba(245,158,11,.2);">⚡ 30 días gratis · sin tarjeta</span>
    </div>
    <h1>Más pacientes.<br><span class="green">Sin caos administrativo.</span></h1>
    <p class="hero-sub">El único sistema que combina un <strong style="color:rgba(255,255,255,.85);">CRM para consultorios</strong> y un <strong style="color:rgba(255,255,255,.85);">equipo de marketing gestionado</strong> en una sola suscripción — sin contratar personal extra, sin coordinar agencias.</p>
    <div class="hero-proof">
      <div class="proof-avatars">
        <div class="proof-av" style="background:#dcfce7;color:#15803d;">DR</div>
        <div class="proof-av" style="background:#dbeafe;color:#1d4ed8;">DL</div>
        <div class="proof-av" style="background:#f3e8ff;color:#7e22ce;">CE</div>
        <div class="proof-av" style="background:rgba(74,222,90,.2);color:var(--zm-g);">+</div>
      </div>
      <span class="proof-stars">★★★★★</span>
      <span class="proof-text"><strong>+80 consultorios</strong> ya gestionan con Zentro Med</span>
    </div>
    <div class="hero-ctas">
      <a href="/signup" class="btn btn-green btn-lg" onclick="if(typeof fbq!=='undefined')fbq('track','Lead');if(typeof gtag!=='undefined')gtag('event','generate_lead',{event_category:'cta',event_label:'hero_primary'});">Probar gratis 30 días →</a>
      <a href="#planes" class="btn btn-ghost-light btn-lg">Ver planes</a>
    </div>
    <p class="hero-note">// Sin tarjeta · Configuración en 24h · Cancela cuando quieras</p>

    <div class="hero-widgets">
      <div class="hw-card">
        <div class="hw-icon-wrap" style="background:rgba(74,222,90,.1);">
          <svg viewBox="0 0 24 24" stroke="var(--zm-g)"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>
        </div>
        <div>
          <div class="hw-title">Cita confirmada</div>
          <div class="hw-sub">Dr. Martínez · Hoy 3:00pm · WhatsApp ✓</div>
        </div>
      </div>
      <div class="hw-card">
        <div class="hw-icon-wrap" style="background:rgba(59,130,246,.1);">
          <svg viewBox="0 0 24 24" stroke="#60a5fa"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        </div>
        <div>
          <div class="hw-title">+3 pacientes nuevos</div>
          <div class="hw-sub">Esta semana · Meta Ads · $18 c/u</div>
        </div>
      </div>
      <div class="hw-card">
        <div class="hw-icon-wrap" style="background:rgba(37,211,102,.1);">
          <img src="https://cdn.simpleicons.org/whatsapp/25D366" width="15" height="15" alt="WA" style="display:block;">
        </div>
        <div>
          <div class="hw-title">Recordatorio enviado</div>
          <div class="hw-sub">−54% no-shows este mes</div>
        </div>
      </div>
    </div>

    <img class="hero-illus-img" src="/landing/hero-product.png" alt="Equipo completo de Zentro Med: estratega, ads manager, content creator, CRM y agenda, WhatsApp IA" width="1672" height="941" />
  </div>
</section>

<!-- STATS BAR -->
<div class="stats-bar" style="background:var(--zm-night);border-color:rgba(255,255,255,.07);">
  <div class="wrap">
    <div class="stats-bar-inner">
      <div class="stat-item">
        <div class="stat-n2"><span>+41%</span></div>
        <div class="stat-l2">aumento en pacientes nuevos*</div>
      </div>
      <div class="stat-item">
        <div class="stat-n2"><span>−54%</span></div>
        <div class="stat-l2">reducción de no-shows con WhatsApp IA*</div>
      </div>
      <div class="stat-item">
        <div class="stat-n2">24h</div>
        <div class="stat-l2">activación del CRM y agenda†</div>
      </div>
      <div class="stat-item">
        <div class="stat-n2"><span>3.2x</span></div>
        <div class="stat-l2">retorno promedio en pauta digital*</div>
      </div>
    </div>
  </div>
  <p class="stats-note">* Promedio de clientes activos en los primeros 90 días. Resultados individuales varían según especialidad, ciudad y presupuesto de pauta. No garantizamos métricas específicas.<br>† Activación del CRM, agenda y WhatsApp básico. Campañas de ads sujetas a aprobación de plataformas (Meta/Google): 5–14 días adicionales.</p>
</div>

<!-- TRUST STRIP -->
<div class="trust-section">
  <div class="wrap">
    <div class="trust-inner">
      <span class="trust-label">Integrado con</span>
      <div class="trust-logos">
        <div class="trust-logo"><img src="https://cdn.simpleicons.org/whatsapp/4ade5a" width="28" height="28" alt="WhatsApp" style="display:block;">WhatsApp Cloud API</div>
        <div class="trust-div"></div>
        <div class="trust-logo"><img src="https://cdn.simpleicons.org/meta/4ade5a" width="28" height="28" alt="Meta" style="display:block;">Meta Ads</div>
        <div class="trust-div"></div>
        <div class="trust-logo"><img src="https://cdn.simpleicons.org/googleads/4ade5a" width="28" height="28" alt="Google Ads" style="display:block;">Google Ads</div>
        <div class="trust-div"></div>
        <div class="trust-logo"><img src="https://cdn.simpleicons.org/instagram/4ade5a" width="28" height="28" alt="Instagram" style="display:block;">Instagram</div>
        <div class="trust-div"></div>
        <div class="trust-logo"><img src="https://cdn.simpleicons.org/stripe/4ade5a" width="28" height="28" alt="Stripe" style="display:block;">Stripe</div>
      </div>
    </div>
  </div>
</div>

<!-- DIFERENCIADOR 2-EN-1 -->
<section class="diff-section">
  <div class="wrap">
    <div class="diff-header reveal">
      <p class="section-label" style="color:rgba(74,222,90,.6);">// Por qué Zentro Med</p>
      <h2 class="section-title" style="color:var(--zm-white);">No es solo un CRM.<br>No es solo una agencia de marketing.</h2>
      <p class="section-sub" style="color:rgba(255,255,255,.45);margin:12px auto 0;">La mayoría de consultorios tiene que elegir uno o el otro. Zentro Med elimina esa decisión — y te cuesta menos que un asistente administrativo.</p>
    </div>
    <div class="diff-cols reveal-group">
      <div class="diff-col diff-col-bad">
        <div class="diff-col-label">
          <div class="diff-icon">❌</div>
          <span>Las alternativas típicas</span>
        </div>
        <ul class="diff-list">
          <li class="diff-item"><div class="diff-dot">✕</div><span class="diff-item-text">Agencia de marketing: $800–$2.000/mes — sin CRM, sin seguimiento de citas</span></li>
          <li class="diff-item"><div class="diff-dot">✕</div><span class="diff-item-text">CRM genérico (HubSpot, Zoho): gestiona contactos pero no tiene equipo que ejecute campañas</span></li>
          <li class="diff-item"><div class="diff-dot">✕</div><span class="diff-item-text">Asistente administrativo: gestiona el WhatsApp pero no puede hacer anuncios ni trackear resultados</span></li>
          <li class="diff-item"><div class="diff-dot">✕</div><span class="diff-item-text">Lead de campaña y agenda de citas en sistemas separados — los prospectos se pierden en el camino</span></li>
          <li class="diff-item"><div class="diff-dot">✕</div><span class="diff-item-text">No sabes qué canal genera más citas reales ni cuánto cuesta cada paciente nuevo</span></li>
        </ul>
      </div>
      <div class="diff-col diff-col-good">
        <div class="diff-col-label">
          <div class="diff-icon">✓</div>
          <span>Zentro Med — 2 en 1</span>
        </div>
        <ul class="diff-list">
          <li class="diff-item"><div class="diff-dot">✓</div><span class="diff-item-text"><strong>CRM + equipo de marketing</strong> desde $299/mes — un solo cobro, una sola plataforma</span></li>
          <li class="diff-item"><div class="diff-dot">✓</div><span class="diff-item-text"><strong>Estratega + diseñador + ads manager</strong> dedicados, sin que tú los contrates ni coordines</span></li>
          <li class="diff-item"><div class="diff-dot">✓</div><span class="diff-item-text"><strong>WhatsApp IA</strong> convierte el lead de tu campaña en cita confirmada — automáticamente</span></li>
          <li class="diff-item"><div class="diff-dot">✓</div><span class="diff-item-text"><strong>Dashboard unificado</strong>: costo por cita, tasa de retención y ROI de pauta en un solo lugar</span></li>
          <li class="diff-item"><div class="diff-dot">✓</div><span class="diff-item-text">El dinero de los anuncios va directo a tu cuenta de Meta/Google — <strong>tú controlas el presupuesto</strong></span></li>
        </ul>
      </div>
    </div>
    <img class="illus-img reveal" src="/landing/vs-comparison.png" alt="Comparación: consultorio sin Zentro Med (caos, sin seguimiento) vs. con Zentro Med (equipo médico, WhatsApp, agenda y campañas activas)" width="1672" height="941" style="max-width:860px;margin:32px auto 0;" />
    <div class="diff-bottom reveal">
      <a href="/signup" class="btn btn-green btn-lg" onclick="if(typeof fbq!=='undefined')fbq('track','Lead');if(typeof gtag!=='undefined')gtag('event','generate_lead',{event_category:'cta',event_label:'differentiator'});">Probar 30 días gratis →</a>
      <p class="diff-price-note">// Sin tarjeta · Setup en 24h · Cancela cuando quieras</p>
    </div>
  </div>
</section>

<!-- PROBLEMS -->
<section class="problems">
  <div class="wrap">
    <div class="problems-header reveal">
      <p class="section-label">// El problema</p>
      <h2 class="section-title">Los 3 problemas que frenan tu consultorio</h2>
      <p class="section-sub">Si tu agenda depende del boca a boca y tu WhatsApp es un caos, no estás solo.</p>
    </div>
    <div class="prob-grid reveal-group">
      <div class="prob-card">
        <div class="prob-icon"><i data-lucide="user-x"></i></div>
        <div class="prob-title">Pacientes que no regresan</div>
        <div class="prob-desc">Sin seguimiento automático, el paciente que no agenda su próxima cita simplemente desaparece. Recuperarlo después cuesta 5 veces más que retenerlo.</div>
        <span class="prob-tag">Pérdida de retención</span>
      </div>
      <div class="prob-card">
        <div class="prob-icon"><i data-lucide="message-circle-warning"></i></div>
        <div class="prob-title">WhatsApp desbordado</div>
        <div class="prob-desc">Confirmaciones manuales, citas por mensaje, recordatorios uno a uno. El WhatsApp del consultorio se convierte en un caos que consume horas cada día.</div>
        <span class="prob-tag">Caos operativo</span>
      </div>
      <div class="prob-card">
        <div class="prob-icon"><i data-lucide="eye-off"></i></div>
        <div class="prob-title">Invisible en Google y redes</div>
        <div class="prob-desc">Tu competencia aparece primero cuando alguien busca tu especialidad en tu ciudad. Sin presencia digital activa, los pacientes nuevos van con quien se ve.</div>
        <span class="prob-tag">Sin captación digital</span>
      </div>
    </div>
  </div>
</section>

<!-- SOLUTION: CRM -->
<section class="solution" id="como">
  <div class="wrap">
    <div class="solution-grid">
      <div class="solution-visual">
        <img class="illus-img" src="/landing/crm-dashboard.png" alt="Dashboard del CRM de Zentro Med: citas de la semana, no-shows, pacientes nuevos y agenda semanal" width="1672" height="941" />
        <div>
          <p class="sol-tag">// Zentro Med CRM</p>
          <p class="sol-title">La operación de tu consultorio, organizada</p>
        </div>
        <div class="feature-row"><div class="feat-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="feat-text"><strong>WhatsApp compartido</strong> — Toda la comunicación del consultorio centralizada, con respuestas automáticas para citas y recordatorios.</div></div>
        <div class="feature-row"><div class="feat-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="feat-text"><strong>Seguimiento de contactos</strong> — Nuevo prospecto → primera cita → seguimiento → reactivación. Sin que nadie se pierda en el camino.</div></div>
        <div class="feature-row"><div class="feat-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="feat-text"><strong>Agenda online 24/7</strong> — Los pacientes agendan solos. Recordatorio automático 24h antes. Sin llamadas manuales.</div></div>
        <div class="feature-row"><div class="feat-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="feat-text"><strong>Perfil del contacto</strong> — Historial de citas, comunicaciones y notas de seguimiento por persona. Accesible desde cualquier dispositivo. <span style="color:rgba(255,255,255,.35);font-size:12px;">(No es historia clínica)</span></div></div>
        <div class="feature-row"><div class="feat-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="feat-text"><strong>Cotizaciones y cobros</strong> — Genera propuestas de servicio y registra pagos desde el mismo sistema que la agenda.</div></div>
      </div>
      <div class="solution-copy">
        <p class="section-label">// CRM para consultorios</p>
        <h2 class="section-title">Un sistema que trabaja mientras tú consultas</h2>
        <p class="section-sub">Zentro Med gestiona la parte comercial y operativa del consultorio para que tú te concentres en el paciente. No en el WhatsApp.</p>
        <div class="benefit-list">
          <div class="benefit-item"><div class="benefit-num">1</div><div class="benefit-text"><h4>Reducción de no-shows</h4><p>Los recordatorios automáticos por WhatsApp reducen los no-shows hasta en un 54% en promedio.* Sin que nadie tenga que llamar.</p></div></div>
          <div class="benefit-item"><div class="benefit-num">2</div><div class="benefit-text"><h4>Más reactivaciones</h4><p>Identifica pacientes que no han vuelto en 30, 60 o 90 días y reactívalos automáticamente con un mensaje personalizado.</p></div></div>
          <div class="benefit-item"><div class="benefit-num">3</div><div class="benefit-text"><h4>Equipo alineado</h4><p>Médicos, recepcionistas y administrativos ven lo mismo en tiempo real. Sin hojas de cálculo ni cuadernos.</p></div></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- SOLUTION: MARKETING -->
<section class="solution" style="background:var(--zm-surface);padding-top:0;padding-bottom:clamp(64px,9vw,100px);">
  <div class="wrap">
    <div class="solution-grid reverse">
      <div class="solution-copy">
        <p class="section-label">// Equipo de marketing incluido</p>
        <h2 class="section-title">Tu equipo de marketing completo,<br>incluido en la suscripción</h2>
        <p class="section-sub">Estratega, diseñador y ads manager ya están en tu plan — gestionan campañas, contenido y SEO local para que aparezcas primero cuando alguien busca tu especialidad en tu ciudad.</p>
        <div class="benefit-list">
          <div class="benefit-item"><div class="benefit-num">1</div><div class="benefit-text"><h4>Campañas en Meta Ads y Google</h4><p>Anuncios dirigidos a pacientes en tu ciudad y especialidad. Gestionados y optimizados cada semana.</p></div></div>
          <div class="benefit-item"><div class="benefit-num">2</div><div class="benefit-text"><h4>Landing de especialidad</h4><p>Página de aterrizaje optimizada para tu especialidad y ciudad. No una página genérica — una pensada para convertir visitas en citas.</p></div></div>
          <div class="benefit-item"><div class="benefit-num">3</div><div class="benefit-text"><h4>Reporte de captación vs. retención</h4><p>Sabes exactamente cuántos pacientes nuevos llegaron, de dónde, y cuánto costó cada uno. Sin suposiciones.</p></div></div>
        </div>
      </div>
      <div class="solution-visual" style="background:var(--zm-night2);">
        <img class="illus-img" src="/landing/marketing-dashboard.png" alt="Dashboard de campañas de marketing de Zentro Med: ROAS, pacientes nuevos y costo por lead en Meta y Google Ads" width="1672" height="941" />
        <div>
          <p class="sol-tag">// Zentro Salud — Marketing gestionado</p>
          <p class="sol-title">Captación digital para tu especialidad</p>
        </div>
        <div class="feature-row"><div class="feat-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="feat-text"><strong>Contenido mensual</strong> — Piezas para Instagram, Facebook y Google My Business creadas por tu equipo.</div></div>
        <div class="feature-row"><div class="feat-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="feat-text"><strong>Meta Ads gestionado</strong> — Campañas en Facebook e Instagram segmentadas por especialidad, ciudad y perfil de paciente.</div></div>
        <div class="feature-row"><div class="feat-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="feat-text"><strong>SEO local</strong> — Aparece en los primeros resultados cuando buscan tu especialidad en tu ciudad. <span style="color:var(--zm-g);">(Solo en Pro)</span></div></div>
        <div class="feature-row"><div class="feat-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="feat-text"><strong>Dashboard en tiempo real</strong> — Métricas de pacientes nuevos, costo por cita generada y retorno de pauta.</div></div>
        <div class="feature-row"><div class="feat-check"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div class="feat-text"><strong>Presupuesto de pauta tuyo</strong> — El dinero de los anuncios va directo a Meta y Google desde tu cuenta. Zentro gestiona, tú controlas.</div></div>
      </div>
    </div>
  </div>
</section>

<!-- MID-PAGE CTA STRIP -->
<div class="mid-cta reveal">
  <div class="wrap">
    <div class="mid-cta-inner">
      <div>
        <p class="mid-cta-pre">// ¿Convencido hasta aquí?</p>
        <p class="mid-cta-head">CRM + equipo de marketing — activo en 24 horas.</p>
      </div>
      <a href="/signup" class="btn btn-green btn-lg" style="flex-shrink:0;" onclick="if(typeof fbq!=='undefined')fbq('track','Lead');if(typeof gtag!=='undefined')gtag('event','generate_lead',{event_category:'cta',event_label:'mid_page'});">Empezar gratis →</a>
    </div>
  </div>
</div>

<!-- HOW IT WORKS -->
<section class="how">
  <div class="wrap">
    <div class="how-header reveal">
      <p class="section-label">// Cómo funciona</p>
      <h2 class="section-title">De cero a consultorio digital en una semana</h2>
    </div>
    <div class="how-steps reveal-group">
      <div class="how-step"><div class="step-num">1</div><div class="step-title">Prueba gratis</div><div class="step-desc">Activa tu cuenta en 2 minutos. 30 días con todas las funciones, sin tarjeta.</div></div>
      <div class="how-step"><div class="step-num">2</div><div class="step-title">Setup en 24h</div><div class="step-desc">Tu estratega configura WhatsApp, agenda y CRM. Tú solo nos dices cómo funciona tu consultorio.</div></div>
      <div class="how-step"><div class="step-num">3</div><div class="step-title">Primeras citas</div><div class="step-desc">Las campañas se activan y los primeros pacientes nuevos empiezan a llegar en la semana 1–2.</div></div>
      <div class="how-step"><div class="step-num">4</div><div class="step-title">Crecimiento continuo</div><div class="step-desc">Optimizamos cada mes con datos reales. Sabes exactamente qué funciona y cuánto cuesta cada paciente.</div></div>
    </div>
  </div>
</section>

<!-- PRICING -->
<section class="pricing" id="planes">
  <div class="wrap">
    <div class="pricing-header reveal">
      <p class="section-label">// Planes</p>
      <h2 class="section-title">Empieza gratis. Crece con tu ritmo.</h2>
    </div>
    <p class="pricing-sub-note">// Setup único <span class="price-sym">$</span><span class="price-amt" data-usd="99">99</span> <span class="price-curr-label">USD</span> · El presupuesto de pauta va aparte y lo defines tú</p>
    <div class="plans-grid reveal-group">

      <div class="plan-card">
        <span class="plan-badge badge-free">30 días gratis</span>
        <div class="plan-name">Prueba gratuita</div>
        <div class="plan-price"><sup class="price-sym">$</sup><span class="price-amt" data-usd="0">0</span><sub>/mes</sub></div>
        <div class="plan-note">Sin tarjeta de crédito</div>
        <div class="plan-divider"></div>
        <div class="plan-features">
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>Pipeline de pacientes (CRM)</div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>Agenda de citas online 24/7</div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>Perfil del contacto (citas + notas)</div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>Cotizaciones y cobros</div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>1 usuario incluido</div>
        </div>
        <a href="/signup" class="plan-btn btn-plan-free" onclick="if(typeof fbq!=='undefined')fbq('track','InitiateCheckout');if(typeof gtag!=='undefined')gtag('event','generate_lead',{event_category:'plan',event_label:'free_trial'});">Empezar gratis →</a>
        <p class="plan-fine">// Sin tarjeta · Cancela cuando quieras</p>
      </div>

      <div class="plan-card">
        <span class="plan-badge badge-crm">Solo CRM</span>
        <div class="plan-name">Zentro Med</div>
        <div class="plan-price"><sup class="price-sym">$</sup><span class="price-amt" data-usd="49">49</span><sub>/usuario/mes</sub></div>
        <div class="plan-note">+<span class="price-sym">$</span><span class="price-amt" data-usd="25">25</span> <span class="price-curr-label">USD</span> por usuario adicional</div>
        <div class="plan-divider"></div>
        <div class="plan-features">
          <div class="pf"><div class="pf-check pf-check-ai"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-ai-num">500 mensajes IA incluidos</span> · sin configuración <span class="pf-ai-pill">IA</span></div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>Todo lo del plan gratuito</div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>Hasta 1.000 pacientes activos</div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>Automatizaciones y flows WhatsApp</div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>Recordatorios automáticos · −54% no-shows</div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>Soporte por WhatsApp</div>
          <div class="pf" style="color:var(--zm-muted2);"><div class="pf-check" style="background:var(--zm-line2);"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>Sin marketing gestionado</div>
        </div>
        <a href="/signup?plan=standalone" class="plan-btn btn-plan-crm" onclick="if(typeof gtag!=='undefined')gtag('event','generate_lead',{event_category:'plan',event_label:'standalone_crm'});">Suscribirme →</a>
        <p class="plan-fine">// Setup <span class="price-sym">$</span><span class="price-amt" data-usd="99">99</span> <span class="price-curr-label">USD</span> · Sin contratos</p>
      </div>

      <div class="plan-card featured">
        <div class="plan-chip">⭐ Más popular</div>
        <div class="plan-name">Zentro Salud Starter</div>
        <div class="plan-price"><sup class="price-sym">$</sup><span class="price-amt" data-usd="299">299</span><sub>/mes</sub></div>
        <div class="plan-note">2 usuarios incl. · +<span class="price-sym">$</span><span class="price-amt" data-usd="25">25</span> <span class="price-curr-label">USD</span>/usuario</div>
        <div class="plan-divider"></div>
        <div class="plan-features">
          <div class="pf"><div class="pf-check pf-check-ai"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-ai-num">1.500 mensajes IA incluidos</span> · listo desde el día 1 <span class="pf-ai-pill">IA</span></div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>Todo lo de Zentro Med</div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-new">Hasta 5.000 pacientes activos</span></div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-new">Contenido mensual (8 piezas + stories)</span></div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-new">Meta Ads gestionado</span></div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-new">Landing de especialidad</span></div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-new">Dashboard semanal</span></div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>Soporte prioritario 24h</div>
        </div>
        <a href="/signup?plan=zentro_salud_starter" class="plan-btn btn-plan-pop" onclick="if(typeof fbq!=='undefined')fbq('track','InitiateCheckout');if(typeof gtag!=='undefined')gtag('event','generate_lead',{event_category:'plan',event_label:'salud_starter'});">Empezar con Starter →</a>
        <p class="plan-fine">// Setup <span class="price-sym">$</span><span class="price-amt" data-usd="99">99</span> <span class="price-curr-label">USD</span> · 30 días gratis · Sin contratos</p>
      </div>

      <div class="plan-card dark-card">
        <span class="plan-badge badge-pro">Pro</span>
        <div class="plan-name">Zentro Salud Pro</div>
        <div class="plan-price"><sup class="price-sym">$</sup><span class="price-amt" data-usd="499">499</span><sub>/mes</sub></div>
        <div class="plan-note">2 usuarios incl. · +<span class="price-sym">$</span><span class="price-amt" data-usd="25">25</span> <span class="price-curr-label">USD</span>/usuario</div>
        <div class="plan-divider"></div>
        <div class="plan-features">
          <div class="pf"><div class="pf-check pf-check-ai"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-ai-num">5.000 mensajes IA incluidos</span> · base de conocimiento <span class="pf-ai-pill">IA</span></div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>Todo lo de Starter</div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-new">Pacientes ilimitados</span></div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-new">Google Ads + SEO local</span></div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-new">20 piezas + 6 reels/mes</span></div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-new">Dashboard captación vs. retención</span></div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-new">2 sesiones de estrategia/mes</span></div>
          <div class="pf"><div class="pf-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><span class="pf-new">Account manager exclusivo · 4h respuesta</span></div>
        </div>
        <a href="/signup?plan=zentro_salud_pro" class="plan-btn btn-plan-pro" onclick="if(typeof fbq!=='undefined')fbq('track','InitiateCheckout');if(typeof gtag!=='undefined')gtag('event','generate_lead',{event_category:'plan',event_label:'salud_pro'});">Empezar con Pro →</a>
        <p class="plan-fine">// Setup <span class="price-sym">$</span><span class="price-amt" data-usd="99">99</span> <span class="price-curr-label">USD</span> · 30 días gratis · Sin contratos</p>
      </div>

    </div>
    <p style="text-align:center;margin-top:24px;font-size:12px;color:var(--zm-muted2);font-family:'JetBrains Mono',monospace;line-height:1.8;">
      * El presupuesto de pauta (Meta/Google Ads) va directo a tu cuenta — Zentro gestiona las campañas, tú controlas el dinero.<br>
      † <span style="color:rgba(167,139,250,.7);">Mensajes IA</span> = auto-respuestas + redacción asistida generadas por el agente de IA en WhatsApp. Incluidos en tu plan — Zentro gestiona la infraestructura de IA, no necesitas crear cuentas en OpenAI ni Anthropic.<br>
      Zentro Med es una plataforma de gestión comercial y marketing. No es un software de historia clínica ni de facturación tributaria.
    </p>
  </div>
</section>

<!-- TESTIMONIALS -->
<section class="testi">
  <div class="wrap">
    <div class="testi-header reveal">
      <p class="section-label">// Resultados reales</p>
      <h2 class="section-title">Lo que dicen nuestros clientes</h2>
    </div>
    <div class="testi-grid reveal-group">
      <div class="testi-card">
        <div class="testi-stars">★★★★★</div>
        <p class="testi-quote">"Antes perdía al menos 8 citas por semana por no-shows. Con los recordatorios de WhatsApp de Zentro Med ese número bajó a casi cero en el primer mes."</p>
        <div class="testi-result"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>−87% no-shows · Mes 1</div>
        <div class="testi-author"><div class="testi-av" style="background:#dcfce7;color:#15803d;">DR</div><div><div class="testi-name">Dr. Rodrigo M.</div><div class="testi-role">Médico general · Bogotá</div></div></div>
      </div>
      <div class="testi-card">
        <div class="testi-stars">★★★★★</div>
        <p class="testi-quote">"Pasamos de 12 consultas nuevas al mes a 41 en el tercer mes. El equipo de Zentro maneja todo — yo solo reviso el reporte los lunes."</p>
        <div class="testi-result"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>+241% pacientes nuevos · Mes 3</div>
        <div class="testi-author"><div class="testi-av" style="background:#dbeafe;color:#1d4ed8;">DL</div><div><div class="testi-name">Dra. Lucía V.</div><div class="testi-role">Dermatóloga · Medellín</div></div></div>
      </div>
      <div class="testi-card">
        <div class="testi-stars">★★★★★</div>
        <p class="testi-quote">"La auditoría gratuita me mostró que 3 competidores aparecían antes que yo en Google. En 6 semanas ya estábamos en el primer lugar para mi especialidad en Cali."</p>
        <div class="testi-result"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>#1 en búsquedas locales · Semana 6</div>
        <div class="testi-author"><div class="testi-av" style="background:#f3e8ff;color:#7e22ce;">CE</div><div><div class="testi-name">Dr. Carlos E.</div><div class="testi-role">Ortopedista · Cali</div></div></div>
      </div>
    </div>
  </div>
</section>

<!-- FAQ -->
<section class="faq">
  <div class="wrap">
    <div class="faq-header reveal">
      <p class="section-label">// Preguntas frecuentes</p>
      <h2 class="section-title">Todo lo que necesitas saber</h2>
    </div>
    <div class="faq-grid">
      <div class="faq-item" onclick="zmToggleFaq(this)">
        <div class="faq-q">¿El CRM maneja datos de pacientes de forma segura?
          <svg class="faq-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="faq-a"><div class="faq-a-inner">Sí. Los datos se almacenan con cifrado en tránsito y en reposo. Zentro Med es una herramienta de gestión comercial y marketing — gestiona citas, contactos y comunicaciones de negocio. No es un sistema de historia clínica; los datos clínicos de tus pacientes son tu responsabilidad exclusiva como profesional de salud.</div></div>
      </div>
      <div class="faq-item" onclick="zmToggleFaq(this)">
        <div class="faq-q">¿Funciona para especialistas, no solo médicos generales?
          <svg class="faq-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="faq-a"><div class="faq-a-inner">Sí. Trabajamos con dermatología, ortopedia, odontología, psicología, oftalmología, medicina estética y más. El CRM y las campañas se adaptan a tu especialidad y a tu ciudad específica.</div></div>
      </div>
      <div class="faq-item" onclick="zmToggleFaq(this)">
        <div class="faq-q">¿El presupuesto de anuncios está incluido?
          <svg class="faq-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="faq-a"><div class="faq-a-inner">No. El presupuesto de pauta va directo a Meta o Google desde tu cuenta — tú tienes el control total del dinero. La suscripción cubre la gestión, estrategia y creación de contenido. Así no hay conflicto de interés.</div></div>
      </div>
      <div class="faq-item" onclick="zmToggleFaq(this)">
        <div class="faq-q">¿Cuánto tiempo hasta ver los primeros pacientes nuevos?
          <svg class="faq-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="faq-a"><div class="faq-a-inner">El CRM se activa en 24h. Las campañas de Meta Ads suelen generar los primeros contactos en la semana 1–2 (sujeto a aprobación de Meta, que puede tomar 2–5 días adicionales). Resultados sostenibles al mes 2–3.</div></div>
      </div>
      <div class="faq-item" onclick="zmToggleFaq(this)">
        <div class="faq-q">¿Puedo cancelar cuando quiera?
          <svg class="faq-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="faq-a"><div class="faq-a-inner">Sí. Sin contratos ni penalidades. Eres dueño de todos tus datos, accesos y activos digitales desde el día uno — al cancelar simplemente revocas nuestro acceso colaborador. No te dejamos rehén de nada.</div></div>
      </div>
      <div class="faq-item" onclick="zmToggleFaq(this)">
        <div class="faq-q">¿Funciona si ya tengo otro sistema de citas?
          <svg class="faq-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="faq-a"><div class="faq-a-inner">Sí, podemos hacer la transición gradual. Tu estratega revisa tu setup actual y define el plan de migración para que no pierdas ninguna cita ni información durante el cambio.</div></div>
      </div>
    </div>
  </div>
</section>

<!-- CTA FINAL -->
<section class="cta-final">
  <div class="wrap">
    <p class="section-label" style="color:rgba(74,222,90,.6);margin-bottom:16px;">// Empieza hoy</p>
    <h2>Tu consultorio merece<br><span>pacientes que regresen.</span></h2>
    <p>30 días con todas las funciones. Sin tarjeta. Configuración en 24 horas.</p>
    <div class="cta-btns">
      <a href="/signup" class="btn btn-green btn-lg" onclick="if(typeof fbq!=='undefined')fbq('track','Lead');if(typeof gtag!=='undefined')gtag('event','generate_lead',{event_category:'cta',event_label:'cta_final'});">Probar gratis 30 días →</a>
      <a href="https://wa.me/15752137020" target="_blank" rel="noopener" class="btn btn-ghost-light btn-lg">Hablar con un estratega</a>
    </div>
    <p class="cta-note">// Sin tarjeta · Sin contratos · Cancela cuando quieras</p>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="wrap">
    <div class="foot-i">
      <span style="color:rgba(255,255,255,.3);">© 2026 Zentro Labs · <a href="https://zentrolabs.com">zentrolabs.com</a></span>
      <span><a href="https://zentrolabs.com/privacidad.html">Privacidad</a> · <a href="https://zentrolabs.com/terminos.html">Términos</a> · <a href="mailto:hello@zentrolabs.com">hello@zentrolabs.com</a></span>
    </div>
  </div>
</footer>

<!-- WHATSAPP FLOAT -->
<a href="https://wa.me/15752137020" target="_blank" rel="noopener" class="wa-float" aria-label="Escríbenos por WhatsApp">
  <img src="https://cdn.simpleicons.org/whatsapp/ffffff" width="26" height="26" alt="WhatsApp">
</a>

<!-- MOBILE STICKY CTA -->
<div class="mob-cta">
  <div class="mob-cta-info">
    <span class="mob-cta-price">30 días gratis</span>
    <span class="mob-cta-sub">sin tarjeta · CRM + marketing médico</span>
  </div>
  <a href="/signup" class="btn btn-green" style="font-size:13px;padding:10px 16px;flex-shrink:0;" onclick="if(typeof gtag!=='undefined')gtag('event','mobile_sticky_cta_click',{event_category:'cta',event_label:'sticky_bar_mobile'});">Empezar →</a>
</div>
`;

export const LANDING_BEHAVIOR_SCRIPT = `
function zmToggleFaq(el) {
  const isOpen = el.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
  if (!isOpen) el.classList.add('open');
}

(function() {
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal, .reveal-group').forEach(function(el) { obs.observe(el); });
})();

(function pollForLucide() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
    return;
  }
  setTimeout(pollForLucide, 50);
})();

var ZM_CURR = {
  USD: { sym:'$', rate:1,    flag:'🇺🇸', label:'USD' },
  MXN: { sym:'$', rate:17.5, flag:'🇲🇽', label:'MXN' },
  COP: { sym:'$', rate:4100, flag:'🇨🇴', label:'COP' },
  ARS: { sym:'$', rate:1050, flag:'🇦🇷', label:'ARS' },
  GTQ: { sym:'Q', rate:7.75, flag:'🇬🇹', label:'GTQ' }
};

function zmFmtAmt(usd, c) {
  if (usd === 0) return '0';
  var val = Math.round(usd * c.rate);
  return val.toLocaleString('en-US');
}

function zmToggleCurr(e) {
  e.stopPropagation();
  document.getElementById('currSwitch').classList.toggle('open');
}

function zmSetCurr(code) {
  var c = ZM_CURR[code];
  document.querySelectorAll('.price-amt').forEach(function(el) {
    el.textContent = zmFmtAmt(parseFloat(el.dataset.usd), c);
  });
  document.querySelectorAll('.price-sym').forEach(function(el) { el.textContent = c.sym; });
  document.querySelectorAll('.price-curr-label').forEach(function(el) { el.textContent = code; });
  document.getElementById('currFlag').textContent = c.flag;
  document.getElementById('currCode').textContent = code;
  document.getElementById('currSwitch').classList.remove('open');
  document.querySelectorAll('.curr-opt').forEach(function(el) {
    el.classList.toggle('curr-active', el.dataset.curr === code);
  });
}

document.addEventListener('click', function() {
  var el = document.getElementById('currSwitch');
  if (el) el.classList.remove('open');
});
`;
