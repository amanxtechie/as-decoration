/* layout.js — injects the shared header, footer, floating buttons and the
   first-visit location modal, so every page stays in sync from one file. */

(function () {
  // The owner asked for a Home-only menu: Catalogue, Our Work and catalogue
  // search were removed from the header. The Catalogue and Our Work pages still
  // exist and stay reachable by URL so old links and search engines keep working.
  const NAV = [
    { href: "/index.html", label: "Home", key: "home" },
  ];

  const ICONS = {
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    star: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8L12 2Z"/></svg>',
    whatsapp:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.09-.16.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31s-.86.84-.86 2.05.88 2.38 1 2.54c.13.17 1.73 2.64 4.2 3.7.59.25 1.04.4 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.08.15-1.18-.06-.11-.23-.17-.48-.29Z"/></svg>',
  };

  const esc = window.UI.esc;
  const escAttr = window.UI.escAttr;

  function currentKey() {
    const file = location.pathname.split("/").pop() || "index.html";
    return file.replace(".html", "").replace(/^index$/, "home");
  }

  function renderHeader() {
    const host = document.getElementById("site-header");
    if (!host) return;
    const key = currentKey();

    host.className = "site-header";
    host.innerHTML = `
      <div class="header-inner">
        <a href="/index.html" class="brand" aria-label="AS Decoration home">
          <span class="brand-mark">AS</span>
          <span class="brand-text">AS <em>Decoration</em></span>
        </a>
        <nav class="main-nav" id="mainNav" aria-label="Primary">
          ${NAV.map(
            (n) => `<a href="${n.href}"${n.key === key ? ' aria-current="page"' : ""}>${esc(n.label)}</a>`
          ).join("")}
        </nav>
        <div class="header-actions">
          <a class="admin-link" href="/admin/">Admin</a>
          <button class="loc-pill" id="locPill" type="button" aria-label="Change selected location">
            <span aria-hidden="true">📍</span><span id="locLabel">Select Area</span>
          </button>
          <button class="nav-toggle" id="navToggle" type="button" aria-label="Toggle menu" aria-expanded="false" aria-controls="mainNav">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>`;

    // Header background depends on whether a page starts with a dark banner.
    const hasDarkTop = document.body.dataset.darkTop === "true";
    const solid = () => window.scrollY > (hasDarkTop ? 400 : 20);
    const sync = () => host.classList.toggle("is-solid", solid());
    sync();
    window.addEventListener("scroll", sync, { passive: true });

    const toggle = host.querySelector("#navToggle");
    const nav = host.querySelector("#mainNav");
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (e) => {
      if (e.target.tagName === "A") {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  function renderFooter() {
    const host = document.getElementById("site-footer");
    if (!host) return;
    const year = new Date().getFullYear();

    host.className = "site-footer";
    host.innerHTML = `
      <div class="container footer-grid">
        <div>
          <span class="brand-text">AS <em>Decoration</em></span>
          <p style="margin-top:.75rem;max-width:34ch">Premium decoration studio for Bihar's most memorable celebrations. No prices online — every detail is discussed personally.</p>
          <div class="social-row" id="footerSocial" style="margin-top:1.25rem"></div>
        </div>
        <div>
          <h4>Follow Us</h4>
          <nav aria-label="Social links" id="footerSocialNav"></nav>
        </div>
        <div>
          <h4>Explore</h4>
          <nav aria-label="Footer">
            <a href="/index.html">Home</a>
            <a href="/catalogue.html">Design Catalogue</a>
            <a href="/our-work.html">Our Work</a>
            <a href="/about.html">About Us</a>
            <a href="/contact.html">Contact</a>
            <a href="/reviews.html">Reviews</a>
          </nav>
        </div>
        <div>
          <h4>Service Areas</h4>
          <p>Nalanda · Sheikhpura<br />Nawada · Lakhisarai</p>
          <p style="margin-top:1rem"><a href="tel:+917667999217" style="color:var(--gold-light)">+91 76679 99217</a></p>
        </div>
      </div>
      <div class="container footer-bottom">
        <span>© ${year} AS Decoration. All rights reserved.</span>
        <span><a href="/admin/">Admin</a> · <a href="/sitemap.xml">Sitemap</a> · <a href="/privacy.html">Privacy</a></span>
      </div>`;
  }

  /* Instagram and YouTube links in the footer. Both the URL and the label come
     from the database and are edited in Admin > Social Links. WhatsApp is
     skipped here: the floating button and mobile bar already cover it. */
  const SOCIAL_ICONS = {
    instagram:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.06 1.8.25 2.2.42.6.22 1 .48 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c0 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c0-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 3.2A6.6 6.6 0 1 0 12 18.6 6.6 6.6 0 0 0 12 5.4Zm0 10.9A4.3 4.3 0 1 1 12 7.7a4.3 4.3 0 0 1 0 8.6Zm6.9-11.1a1.5 1.5 0 1 1-3.1 0 1.5 1.5 0 0 1 3.1 0Z"/></svg>',
    youtube:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15.2V8.8l5.2 3.2-5.2 3.2Z"/></svg>',
  };

  async function loadFooterSocial() {
    const row = document.getElementById("footerSocial");
    const nav = document.getElementById("footerSocialNav");
    if (!row || !nav) return;

    let links = [];
    try {
      ({ links } = await window.API.get("/social"));
    } catch {
      return; // a failed social fetch must never break the footer
    }

    const shown = links.filter((l) => l.active && SOCIAL_ICONS[l.platform]);
    if (!shown.length) return;

    row.innerHTML = shown
      .map(
        (l) => `<a class="social-btn" href="${escAttr(l.url)}" target="_blank" rel="noopener"
                 aria-label="${escAttr(l.label || l.platform)}" title="${escAttr(l.label || l.platform)}">
                 ${SOCIAL_ICONS[l.platform]}</a>`
      )
      .join("");

    nav.innerHTML = shown
      .map(
        (l) => `<a href="${escAttr(l.url)}" target="_blank" rel="noopener">
                 ${SOCIAL_ICONS[l.platform]} ${escAttr(l.label || l.platform)}</a>`
      )
      .join("");
  }

  function renderFloating() {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <a class="wa-float" id="waFloat" href="#" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">
        ${ICONS.whatsapp}
      </a>
      <nav class="mobile-bar" aria-label="Quick actions">
        <a href="tel:+917667999217" id="mbCall">📞<span>Call</span></a>
        <a href="#" id="mbWa" target="_blank" rel="noopener">💬<span>WhatsApp</span></a>
        <a href="/contact.html">✉️<span>Enquire</span></a>
      </nav>`;
    document.body.append(...wrap.children);
  }

  function renderLocationModal() {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "locationModal";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "locTitle");
    modal.innerHTML = `
      <div class="modal__backdrop"></div>
      <div class="modal__box">
        <button class="modal__close" data-close aria-label="Close">✕</button>
        <span class="eyebrow">Welcome</span>
        <h2 id="locTitle">Where are you celebrating?</h2>
        <p style="color:var(--muted);margin:.75rem 0 1.5rem;font-size:.92rem">
          Pick your district and town so we can show relevant designs and tailor your enquiry.
        </p>
        <form class="form" id="locationForm">
          <div class="field">
            <label for="locDistrict">District</label>
            <select id="locDistrict" required><option value="">Choose district…</option></select>
          </div>
          <div class="field">
            <label for="locTown">Town / City</label>
            <select id="locTown" required disabled><option value="">Choose district first…</option></select>
          </div>
          <div class="hp-field" aria-hidden="true">
            <label>Website<input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
          </div>
          <button type="submit" class="btn btn--gold btn--block">Show me designs</button>
          <button type="button" class="btn btn--ghost btn--block btn--sm" id="locSkip">Skip for now</button>
        </form>
      </div>`;
    document.body.appendChild(modal);
    window.UI.wireModal(modal);
  }



  document.addEventListener("DOMContentLoaded", () => {
    renderHeader();
    renderFooter();
    loadFooterSocial();
    renderFloating();
    renderLocationModal();

    if (window.WhatsApp) window.WhatsApp.wire();
    if (window.Location) window.Location.init();
    if (window.Saved) window.Saved.render();
    window.UI.observeReveals();
  });

  window.ICONS = ICONS;
})();
