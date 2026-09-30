/* ui.js — shared UI helpers: escaping, toasts, modals, lightbox, formatting.
   esc() is mandatory for any value coming from the API before it hits innerHTML. */

window.UI = (function () {
  /* ------------------------------------------------------------ escaping */
  const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

  function esc(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/[&<>"'`]/g, (c) => ENTITIES[c]);
  }

  /** Escape for an HTML attribute and reject javascript:/data: URLs. */
  function escAttr(value) {
    if (value === null || value === undefined) return "";
    const raw = String(value);
    if (/^\s*(javascript|vbscript):/i.test(raw)) return "";
    return esc(raw);
  }

  /* ------------------------------------------------------------- toasts */
  function toast(message, kind = "") {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      stack.setAttribute("role", "status");
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    const el = document.createElement("div");
    el.className = "toast" + (kind ? ` toast--${kind}` : "");
    el.innerHTML = `<span>${esc(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add("is-out");
      setTimeout(() => el.remove(), 260);
    }, kind === "err" ? 5200 : 3400);
  }

  /* ------------------------------------------------------------- modals */
  function openModal(el) {
    if (!el) return;
    el.hidden = false;
    document.body.classList.add("is-locked");
    const focusable = el.querySelector("input, select, textarea, button:not([data-close])");
    if (focusable) setTimeout(() => focusable.focus(), 40);
    el._returnFocus = document.activeElement;
  }

  function closeModal(el) {
    if (!el) return;
    el.hidden = true;
    if (!document.querySelector(".modal:not([hidden])")) document.body.classList.remove("is-locked");
    if (el._returnFocus && el._returnFocus.focus) el._returnFocus.focus();
  }

  /** Wire backdrop click, [data-close] buttons and Escape for a modal element. */
  function wireModal(el) {
    if (!el) return;
    el.querySelectorAll("[data-close]").forEach((b) =>
      b.addEventListener("click", () => closeModal(el))
    );
    const backdrop = el.querySelector(".modal__backdrop");
    if (backdrop) backdrop.addEventListener("click", () => closeModal(el));
  }

  // Global Escape handling, registered once.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = document.querySelector(".modal:not([hidden])");
    if (open) return closeModal(open);
    const lb = document.getElementById("lightbox");
    if (lb && !lb.hidden) return UI.closeLightbox();
  });

  /* ---------------------------------------------------------- lightbox */
  let lbItems = [];
  let lbIndex = 0;

  function ensureLightbox() {
    let lb = document.getElementById("lightbox");
    if (lb) return lb;
    lb = document.createElement("div");
    lb.id = "lightbox";
    lb.className = "lightbox";
    lb.hidden = true;
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", "Photo viewer");
    lb.innerHTML = `
      <button class="lightbox__close" data-lb="close" aria-label="Close">✕</button>
      <button class="lightbox__nav lightbox__nav--prev" data-lb="prev" aria-label="Previous photo">‹</button>
      <img class="lightbox__img" alt="">
      <button class="lightbox__nav lightbox__nav--next" data-lb="next" aria-label="Next photo">›</button>
      <div class="lightbox__cap"><strong></strong><span></span></div>`;
    document.body.appendChild(lb);

    lb.addEventListener("click", (e) => {
      const act = e.target.closest("[data-lb]");
      if (!act) { if (e.target === lb) UI.closeLightbox(); return; }
      if (act.dataset.lb === "close") UI.closeLightbox();
      if (act.dataset.lb === "prev") UI.lightboxStep(-1);
      if (act.dataset.lb === "next") UI.lightboxStep(1);
    });
    document.addEventListener("keydown", (e) => {
      if (lb.hidden) return;
      if (e.key === "ArrowLeft") UI.lightboxStep(-1);
      if (e.key === "ArrowRight") UI.lightboxStep(1);
    });
    return lb;
  }

  function openLightbox(items, index = 0) {
    lbItems = items;
    lbIndex = index;
    const lb = ensureLightbox();
    lb.hidden = false;
    document.body.classList.add("is-locked");
    renderLightbox();
    lb.querySelector(".lightbox__close").focus();
  }

  function renderLightbox() {
    const lb = document.getElementById("lightbox");
    if (!lb || !lbItems.length) return;
    const item = lbItems[lbIndex];
    lb.querySelector(".lightbox__img").src = item.url || item;
    lb.querySelector(".lightbox__img").alt = escAttr(item.title || item.alt || "");
    lb.querySelector(".lightbox__cap strong").textContent = item.title || "";
    lb.querySelector(".lightbox__cap span").textContent = item.subtitle || "";
    const many = lbItems.length > 1;
    lb.querySelector(".lightbox__nav--prev").hidden = !many;
    lb.querySelector(".lightbox__nav--next").hidden = !many;
  }

  function lightboxStep(delta) {
    if (!lbItems.length) return;
    lbIndex = (lbIndex + delta + lbItems.length) % lbItems.length;
    renderLightbox();
  }

  function closeLightbox() {
    const lb = document.getElementById("lightbox");
    if (!lb) return;
    lb.hidden = true;
    if (!document.querySelector(".modal:not([hidden])")) document.body.classList.remove("is-locked");
  }

  /* -------------------------------------------------------- formatting */
  const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");
  const fmtDateShort = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");
  const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
  const bytes = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB");

  function debounce(fn, wait = 260) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /* ------------------------------------------------------------ reveal */
  function observeReveals(root = document) {
    const targets = root.querySelectorAll(".reveal:not(.is-visible)");
    if (!targets.length) return;
    if (!("IntersectionObserver" in window)) {
      targets.forEach((t) => t.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    targets.forEach((t) => io.observe(t));
  }

  /* -------------------------------------------------------- empty state */
  function emptyState(title, body, action) {
    return `<div class="empty">
      <h3>${esc(title)}</h3>
      <p>${esc(body)}</p>
      ${action ? `<a class="btn btn--ghost btn--sm" href="${escAttr(action.href || "#")}">${esc(action.label)}</a>` : ""}
    </div>`;
  }

  function skeletonCards(count = 6) {
    return Array.from({ length: count })
      .map(() => `<div class="skeleton skeleton-card"></div>`)
      .join("");
  }

  return {
    esc, escAttr, toast,
    openModal, closeModal, wireModal,
    openLightbox, closeLightbox,
    fmtDate, fmtDateShort, stars, bytes, debounce,
    observeReveals, emptyState, skeletonCards,
  };
})();
