// Landing publica de Zuhma Med (servida en /). HTML autocontenido con su
// propio <style>; Poppins viene self-hosted via next/font (--font-poppins,
// ver layout.tsx) por el CSP (font-src self).
export const LANDING_HTML = `<style>
  :root {
    --brand: #F94B5A;
    --brand-strong: #E1354A;
    --brand-tint: #FFF1F1;
    --brand-tint-2: #FFE4E5;
    --ink: #1C1517;
    --ink-soft: #453C3F;
    --muted: #7A6E71;
    --bg: #FFFFFF;
    --bg-warm: #FCF7F6;
    --line: #F1E6E6;
    --card: #FFFFFF;
    --shadow-sm: 0 1px 2px rgba(28,21,23,.05), 0 1px 3px rgba(28,21,23,.04);
    --shadow-md: 0 10px 30px -12px rgba(225,53,74,.18), 0 4px 12px rgba(28,21,23,.05);
    --radius: 18px;
    --maxw: 1120px;
    --font-display: var(--font-poppins), "Poppins", ui-sans-serif, system-ui, -apple-system, sans-serif;
    --font-body: var(--font-poppins), "Poppins", ui-sans-serif, system-ui, -apple-system, sans-serif;
  }

  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  .zl-root {
    min-height: 100vh;
    margin: 0;
    font-family: var(--font-body);
    color: var(--ink);
    background: var(--bg);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3 { font-family: var(--font-display); font-weight: 700; line-height: 1.08; letter-spacing: -.02em; text-wrap: balance; margin: 0; color: var(--ink); }
  p { margin: 0; }
  a { color: inherit; text-decoration: none; }
  img, svg { max-width: 100%; display: block; }

  .wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 24px; }
  .eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 13px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
    color: var(--brand-strong); background: var(--brand-tint);
    padding: 6px 12px; border-radius: 999px; border: 1px solid var(--brand-tint-2);
  }

  /* ---------- Buttons ---------- */
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    font-family: var(--font-body); font-weight: 600; font-size: 15.5px;
    padding: 13px 22px; border-radius: 12px; border: 1px solid transparent;
    cursor: pointer; transition: transform .12s ease, box-shadow .2s ease, background .2s ease;
  }
  .btn-primary { background: var(--brand); color: #fff; box-shadow: 0 8px 20px -8px rgba(249,75,90,.6); }
  .btn-primary:hover { background: var(--brand-strong); transform: translateY(-1px); }
  .btn-ghost { background: #fff; color: var(--ink); border-color: var(--line); }
  .btn-ghost:hover { border-color: var(--brand); color: var(--brand-strong); }

  /* ---------- Header ---------- */
  header.site {
    position: sticky; top: 0; z-index: 50;
    background: rgba(255,255,255,.82); backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--line);
  }
  .nav { display: flex; align-items: center; justify-content: space-between; height: 68px; }
  .brand { display: inline-flex; align-items: center; gap: 0; font-family: var(--font-display); font-weight: 700; font-size: 23px; letter-spacing: -.03em; color: var(--ink); }
  .brand .wm { font-weight: 700; }
  .brand .plus-mark { width: 13px; height: 13px; flex: none; margin-left: 2px; transform: translateY(-.46em); }
  .brand .med { font-weight: 600; font-size: .62em; letter-spacing: -.01em; color: var(--muted); margin-left: 8px; align-self: center; }
  .brand .logo-img { height: 30px; width: auto; display: block; }
  .nav-links { display: flex; align-items: center; gap: 28px; }
  .nav-links a { font-size: 15px; font-weight: 500; color: var(--ink-soft); }
  .nav-links a:hover { color: var(--brand-strong); }
  .nav-cta { display: flex; align-items: center; gap: 14px; }
  .nav-cta .login { font-size: 15px; font-weight: 600; color: var(--ink-soft); }
  .nav-cta .login:hover { color: var(--brand-strong); }
  @media (max-width: 860px) { .nav-links { display: none; } }

  /* ---------- Hero ---------- */
  .hero { position: relative; overflow: hidden; background:
      radial-gradient(1100px 460px at 82% -8%, var(--brand-tint) 0%, rgba(255,241,241,0) 60%),
      linear-gradient(180deg, #fff 0%, var(--bg-warm) 100%); }
  .hero-grid { display: grid; grid-template-columns: 1.04fr .96fr; gap: 56px; align-items: center; padding: 84px 0 92px; }
  .hero h1 { font-size: clamp(38px, 5.4vw, 62px); font-weight: 800; margin-top: 22px; }
  .hero h1 .hl { color: var(--brand-strong); }
  .hero .lead { font-size: clamp(17px, 1.6vw, 20px); color: var(--ink-soft); margin-top: 22px; max-width: 33ch; }
  .hero .cta-row { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 34px; }
  .hero .assurance { display: flex; flex-wrap: wrap; gap: 18px 26px; margin-top: 30px; font-size: 14.5px; color: var(--muted); }
  .hero .assurance span { display: inline-flex; align-items: center; gap: 8px; }
  .tick { color: var(--brand); flex: none; }
  @media (max-width: 900px) { .hero-grid { grid-template-columns: 1fr; gap: 40px; padding: 56px 0 64px; } .hero .lead { max-width: none; } }

  /* ---------- Hero art ---------- */
  .art { position: relative; }
  .device {
    background: var(--card); border: 1px solid var(--line); border-radius: 22px;
    box-shadow: var(--shadow-md); padding: 16px; }
  .device-top { display: flex; align-items: center; gap: 10px; padding: 4px 6px 14px; border-bottom: 1px solid var(--line); }
  .avatar { width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, var(--brand), #ff8a76); color: #fff; display: grid; place-items: center; font-weight: 700; font-family: var(--font-display); flex: none; }
  .device-top .who { font-weight: 600; font-size: 15px; }
  .device-top .who small { display: block; color: var(--muted); font-weight: 500; font-size: 12.5px; }
  .chat { display: flex; flex-direction: column; gap: 10px; padding: 16px 6px 6px; }
  .bubble { max-width: 78%; padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.45; }
  .bubble.in { background: var(--bg-warm); border: 1px solid var(--line); border-bottom-left-radius: 4px; align-self: flex-start; }
  .bubble.out { background: var(--brand); color: #fff; border-bottom-right-radius: 4px; align-self: flex-end; }
  .appt {
    margin: 14px 6px 4px; display: flex; align-items: center; gap: 12px;
    background: var(--brand-tint); border: 1px solid var(--brand-tint-2); border-radius: 14px; padding: 12px 14px; }
  .appt .cal { width: 40px; height: 40px; border-radius: 11px; background: #fff; border: 1px solid var(--brand-tint-2); display: grid; place-items: center; color: var(--brand-strong); flex: none; }
  .appt .meta { font-size: 13.5px; }
  .appt .meta b { display: block; font-family: var(--font-display); font-weight: 700; color: var(--ink); }
  .appt .meta span { color: var(--muted); }
  .appt .status { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--brand-strong); background: #fff; border: 1px solid var(--brand-tint-2); padding: 4px 10px; border-radius: 999px; }
  .float { position: absolute; right: -14px; bottom: -16px; background: #fff; border: 1px solid var(--line); box-shadow: var(--shadow-md); border-radius: 14px; padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
  .float .dot { width: 34px; height: 34px; border-radius: 10px; background: var(--brand-tint); color: var(--brand-strong); display: grid; place-items: center; flex: none; }
  .float b { font-family: var(--font-display); font-size: 15px; }
  .float small { display: block; color: var(--muted); font-size: 12px; }
  @media (max-width: 480px) { .float { display: none; } }

  /* ---------- Trust strip ---------- */
  .trust { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: #fff; }
  .trust .wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 14px 30px; padding: 22px 24px; }
  .trust .label { font-size: 13px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .trust .pill { display: inline-flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 600; color: var(--ink-soft); }
  .trust .pill svg { color: var(--brand); }

  /* ---------- Section shell ---------- */
  section.block { padding: 88px 0; }
  section.block.warm { background: var(--bg-warm); }
  .sec-head { max-width: 660px; margin: 0 auto 52px; text-align: center; }
  .sec-head h2 { font-size: clamp(28px, 3.4vw, 40px); font-weight: 800; margin-top: 16px; }
  .sec-head p { color: var(--ink-soft); font-size: 17px; margin-top: 14px; }

  /* ---------- Feature grid ---------- */
  .features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  @media (max-width: 900px) { .features { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 620px) { .features { grid-template-columns: 1fr; } }
  .fcard { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 26px; box-shadow: var(--shadow-sm); transition: transform .15s ease, box-shadow .2s ease, border-color .2s ease; }
  .fcard:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); border-color: var(--brand-tint-2); }
  .fcard .ic { width: 46px; height: 46px; border-radius: 13px; background: var(--brand-tint); color: var(--brand-strong); display: grid; place-items: center; margin-bottom: 18px; }
  .fcard h3 { font-size: 19px; font-weight: 700; }
  .fcard p { color: var(--ink-soft); font-size: 15px; margin-top: 9px; }

  /* ---------- How it works ---------- */
  .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; counter-reset: step; }
  @media (max-width: 760px) { .steps { grid-template-columns: 1fr; } }
  .step { position: relative; background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 28px 26px; box-shadow: var(--shadow-sm); }
  .step .n { font-family: var(--font-display); font-weight: 800; font-size: 15px; width: 34px; height: 34px; border-radius: 10px; background: var(--brand); color: #fff; display: grid; place-items: center; margin-bottom: 16px; }
  .step h3 { font-size: 18px; }
  .step p { color: var(--ink-soft); font-size: 15px; margin-top: 8px; }

  /* ---------- Google integration ---------- */
  .integ { display: grid; grid-template-columns: 1fr 1fr; gap: 44px; align-items: center; }
  @media (max-width: 820px) { .integ { grid-template-columns: 1fr; gap: 30px; } }
  .integ .panel { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 26px; box-shadow: var(--shadow-sm); }
  .integ h2 { font-size: clamp(26px, 3vw, 36px); font-weight: 800; }
  .integ p { color: var(--ink-soft); font-size: 16.5px; margin-top: 16px; }
  .integ ul { list-style: none; padding: 0; margin: 22px 0 0; display: grid; gap: 12px; }
  .integ li { display: flex; gap: 12px; align-items: flex-start; font-size: 15.5px; color: var(--ink-soft); }
  .integ li svg { color: var(--brand); flex: none; margin-top: 3px; }
  .gcal { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 13px; }
  .gcal + .gcal { margin-top: 12px; }
  .gcal .gi { width: 42px; height: 42px; border-radius: 11px; background: var(--brand-tint); color: var(--brand-strong); display: grid; place-items: center; flex: none; }
  .gcal b { font-family: var(--font-display); }
  .gcal small { display: block; color: var(--muted); font-size: 13px; }

  /* ---------- CTA band ---------- */
  .cta-band { background: linear-gradient(135deg, var(--brand) 0%, var(--brand-strong) 100%); color: #fff; border-radius: 26px; padding: 56px 40px; text-align: center; box-shadow: var(--shadow-md); }
  .cta-band h2 { color: #fff; font-size: clamp(28px, 3.4vw, 40px); font-weight: 800; }
  .cta-band p { color: rgba(255,255,255,.9); font-size: 17px; margin-top: 14px; }
  .cta-band .btn-primary { background: #fff; color: var(--brand-strong); box-shadow: none; margin-top: 28px; }
  .cta-band .btn-primary:hover { background: #fff; transform: translateY(-1px); }

  /* ---------- Footer ---------- */
  footer.site { border-top: 1px solid var(--line); background: #fff; padding: 40px 0 46px; margin-top: 0; }
  .foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; }
  .foot .brand { font-size: 18px; }
  .foot .brand .logo-img { height: 26px; }
  .foot .links { display: flex; flex-wrap: wrap; gap: 22px; font-size: 14.5px; color: var(--muted); }
  .foot .links a:hover { color: var(--brand-strong); }
  .foot .copy { width: 100%; color: var(--muted); font-size: 13.5px; padding-top: 8px; }
</style>

<!-- Coral cross isotipo, reused via <use> -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <linearGradient id="zg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF6A5E"/><stop offset="1" stop-color="#F94B5A"/>
    </linearGradient>
    <symbol id="cross" viewBox="0 0 32 32">
      <rect x="2" y="2" width="28" height="28" rx="9" fill="url(#zg)"/>
      <path d="M16 9.2v13.6M9.2 16h13.6" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>
    </symbol>
    <symbol id="plus" viewBox="0 0 24 24">
      <path d="M12 3.4v17.2M3.4 12h17.2" stroke="url(#zg)" stroke-width="4.4" stroke-linecap="round"/>
    </symbol>
  </defs>
</svg>

<header class="site">
  <div class="wrap nav">
    <a class="brand" href="#top"><img class="logo-img" src="/zuhma-logo.png" alt="Zuhma Med" width="99" height="30"/></a>
    <nav class="nav-links">
      <a href="#que-hace">Qué hace</a>
      <a href="#como">Cómo funciona</a>
      <a href="#integra">Integraciones</a>
    </nav>
    <div class="nav-cta">
      <a class="login" href="/login">Iniciar sesión</a>
      <a class="btn btn-primary" href="mailto:soporte@zuhma.com?subject=Quiero%20conocer%20Zuhma%20Med">Solicitar acceso</a>
    </div>
  </div>
</header>

<main id="top">
  <!-- HERO -->
  <section class="hero">
    <div class="wrap hero-grid">
      <div>
        <span class="eyebrow"><svg width="13" height="13" viewBox="0 0 24 24"><use href="#plus"/></svg> CRM + Expediente clínico</span>
        <h1>La operación de tu clínica, ordenada en <span class="hl">un solo lugar</span>.</h1>
        <p class="lead">Zuhma Med reúne la conversación por WhatsApp, el expediente del paciente, la agenda de tus doctores y la facturación — para que tu equipo atienda, agende y dé seguimiento sin perder nada entre chats.</p>
        <div class="cta-row">
          <a class="btn btn-primary" href="mailto:soporte@zuhma.com?subject=Quiero%20conocer%20Zuhma%20Med">Solicitar acceso</a>
          <a class="btn btn-ghost" href="#que-hace">Ver qué hace</a>
        </div>
        <div class="assurance">
          <span><svg class="tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg> WhatsApp Business oficial</span>
          <span><svg class="tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg> Expediente + agenda</span>
          <span><svg class="tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg> Datos de cada clínica, aislados</span>
        </div>
      </div>

      <div class="art">
        <div class="device">
          <div class="device-top">
            <div class="avatar">LG</div>
            <div class="who">Laura García <small>Paciente · WhatsApp</small></div>
          </div>
          <div class="chat">
            <div class="bubble in">Hola, quiero agendar una limpieza dental esta semana 🦷</div>
            <div class="bubble out">¡Claro, Laura! Tenemos mañana a las 11:00 con la Dra. Ruiz. ¿Te va bien?</div>
            <div class="bubble in">Perfecto, sí 🙌</div>
          </div>
          <div class="appt">
            <div class="cal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9h18M8 2v4M16 2v4" stroke-linecap="round"/></svg>
            </div>
            <div class="meta"><b>Mañana · 11:00 a.m.</b><span>Limpieza · Dra. Ruiz</span></div>
            <div class="status">Confirmada</div>
          </div>
        </div>
        <div class="float">
          <div class="dot">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9"/></svg>
          </div>
          <div><b>Sin dobles reservas</b><small>Sincroniza con Google Calendar</small></div>
        </div>
      </div>
    </div>
  </section>

  <!-- TRUST -->
  <div class="trust">
    <div class="wrap">
      <span class="label">Todo lo de tu clínica, conectado</span>
      <span class="pill"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Conversaciones</span>
      <span class="pill"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/></svg> Pacientes</span>
      <span class="pill"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9h18M8 2v4M16 2v4" stroke-linecap="round"/></svg> Agenda</span>
      <span class="pill"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v4H4zM4 12h16v8H4z"/></svg> Facturación</span>
    </div>
  </div>

  <!-- QUÉ HACE -->
  <section class="block" id="que-hace">
    <div class="wrap">
      <div class="sec-head">
        <span class="eyebrow">Qué hace</span>
        <h2>Una plataforma pensada para clínicas y consultorios</h2>
        <p>Desde el primer mensaje del paciente hasta la cita, el expediente y el cobro — todo ocurre en un mismo panel.</p>
      </div>
      <div class="features">
        <div class="fcard">
          <div class="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
          <h3>Bandeja de WhatsApp compartida</h3>
          <p>Varios miembros del equipo atienden un mismo número, con asignación, estado y notas por conversación. Nadie se pisa ni se queda sin responder.</p>
        </div>
        <div class="fcard">
          <div class="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg></div>
          <h3>Expediente clínico</h3>
          <p>Historia, notas de evolución, fotos de consulta y datos del paciente — organizados y a la mano en cada ficha.</p>
        </div>
        <div class="fcard">
          <div class="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9h18M8 2v4M16 2v4" stroke-linecap="round"/></svg></div>
          <h3>Agenda y disponibilidad</h3>
          <p>Citas por doctor y consultorio, con sincronización a Google Calendar para agendar y evitar dobles reservas.</p>
        </div>
        <div class="fcard">
          <div class="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/></svg></div>
          <h3>Pacientes y contactos</h3>
          <p>Ficha completa, etiquetas y campos propios. Toda la información del paciente vive junto a su conversación.</p>
        </div>
        <div class="fcard">
          <div class="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg></div>
          <h3>Facturación</h3>
          <p>Cotizaciones, facturas y pagos ligados a cada paciente y servicio, sin salir de la plataforma.</p>
        </div>
        <div class="fcard">
          <div class="ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></div>
          <h3>Recordatorios automáticos</h3>
          <p>De cita y de conversaciones sin responder, para reducir inasistencias y no dejar a ningún paciente esperando.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- CÓMO FUNCIONA -->
  <section class="block warm" id="como">
    <div class="wrap">
      <div class="sec-head">
        <span class="eyebrow">Cómo funciona</span>
        <h2>Listo en tres pasos</h2>
        <p>Sin instalaciones complejas ni migraciones eternas — tu equipo empieza a operar el mismo día.</p>
      </div>
      <div class="steps">
        <div class="step">
          <div class="n">1</div>
          <h3>Conecta tu WhatsApp</h3>
          <p>Vincula tu número de WhatsApp Business y tu equipo entra al panel con sus propios accesos.</p>
        </div>
        <div class="step">
          <div class="n">2</div>
          <h3>Atiende y agenda</h3>
          <p>Responde, registra al paciente, crea su expediente y agenda la cita — todo desde una misma pantalla.</p>
        </div>
        <div class="step">
          <div class="n">3</div>
          <h3>Deja que fluya</h3>
          <p>La agenda se sincroniza con Google Calendar y los recordatorios salen solos. Tú te concentras en atender.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- INTEGRACIÓN GOOGLE -->
  <section class="block" id="integra">
    <div class="wrap integ">
      <div>
        <span class="eyebrow">Integraciones</span>
        <h2>Se conecta con Google Calendar</h2>
        <p>Cada doctor conecta su propia agenda para que las citas que agendas en Zuhma Med aparezcan en su calendario y para verificar su disponibilidad antes de reservar.</p>
        <ul>
          <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg> Crea, actualiza y cancela citas en el calendario del doctor.</li>
          <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg> Consulta disponibilidad (horas ocupadas) para evitar empalmes.</li>
          <li><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg> No lee el contenido de tus eventos. Puedes desconectarlo cuando quieras.</li>
        </ul>
      </div>
      <div class="panel">
        <div class="gcal">
          <div class="gi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9h18M8 2v4M16 2v4" stroke-linecap="round"/></svg></div>
          <div><b>Google Calendar</b><small>Escribe las citas que agendas</small></div>
          <div class="status" style="margin-left:auto;font-size:12px;font-weight:700;color:var(--brand-strong);background:var(--brand-tint);border:1px solid var(--brand-tint-2);padding:4px 10px;border-radius:999px;">Conectado</div>
        </div>
        <div class="gcal">
          <div class="gi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9"/></svg></div>
          <div><b>Disponibilidad</b><small>Avisa antes de una doble reserva</small></div>
        </div>
        <div class="gcal">
          <div class="gi"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 4 7v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V7z"/></svg></div>
          <div><b>Privacidad</b><small>Solo lo necesario para agendar</small></div>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="block warm" style="padding-top:20px;">
    <div class="wrap">
      <div class="cta-band">
        <h2>Ordena la operación de tu clínica</h2>
        <p>Cuéntanos de tu clínica y te damos acceso a Zuhma Med.</p>
        <a class="btn btn-primary" href="mailto:soporte@zuhma.com?subject=Quiero%20conocer%20Zuhma%20Med">Solicitar acceso</a>
      </div>
    </div>
  </section>
</main>

<footer class="site">
  <div class="wrap foot">
    <a class="brand" href="#top"><img class="logo-img" src="/zuhma-logo.png" alt="Zuhma Med" width="99" height="30"/></a>
    <div class="links">
      <a href="#que-hace">Qué hace</a>
      <a href="#como">Cómo funciona</a>
      <a href="#integra">Integraciones</a>
      <a href="/login">Iniciar sesión</a>
      <a href="mailto:soporte@zuhma.com">Contacto</a>
    </div>
    <div class="copy">© 2026 Zuhma · CRM y expediente clínico para clínicas · soporte@zuhma.com · <a href="/privacidad" style="color:var(--muted);text-decoration:underline;">Política de privacidad</a> · <a href="/terminos" style="color:var(--muted);text-decoration:underline;">Términos</a></div>
  </div>
</footer>`;
