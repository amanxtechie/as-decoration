/* admin.js — AS Decoration admin dashboard
   Vanilla JS, no build step. Every value from the API passes through esc()
   before it reaches innerHTML: this is a stored-XSS fix, not a nicety. */

(function () {
  "use strict";

  const API_BASE = (window.AS_APP && window.AS_APP.apiBase) || "/api";
  const TOKEN_KEY = "as_admin_token";

  /* ------------------------------------------------------------ escaping */
  const ENT = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
  const esc = (v) => (v === null || v === undefined ? "" : String(v).replace(/[&<>"'`]/g, (c) => ENT[c]));
  const escAttr = (v) => (/^\s*(javascript|vbscript|data):/i.test(String(v ?? "")) ? "" : esc(v));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* --------------------------------------------------------------- toasts */
  function toast(msg, kind = "") {
    let stack = $(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      stack.setAttribute("role", "status");
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    const el = document.createElement("div");
    el.className = "toast" + (kind ? ` toast--${kind}` : "");
    el.innerHTML = `<span>${esc(msg)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add("is-out");
      setTimeout(() => el.remove(), 240);
    }, kind === "err" ? 5000 : 3000);
  }

  /* --------------------------------------------------------------- modal */
  const modal = $("#modal");
  const modalBox = $("#modalBox");
  const modalContent = $("#modalContent");

  function openModal(html, wide) {
    modalContent.innerHTML = html;
    modalBox.classList.toggle("modal__box--wide", !!wide);
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    const first = modalContent.querySelector("input:not([type=file]), select, textarea, button");
    if (first) setTimeout(() => first.focus(), 50);
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
    modalContent.innerHTML = "";
  }
  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]") || e.target.classList.contains("modal__backdrop")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  /* ------------------------------------------------------------------ api */
  let token = localStorage.getItem(TOKEN_KEY);

  async function req(path, opts = {}) {
    const res = await fetch(API_BASE + path, {
      ...opts,
      headers: {
        ...(opts.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(opts.headers || {}),
      },
    });
    if (res.status === 401 && !path.startsWith("/auth/login")) {
      localStorage.removeItem(TOKEN_KEY);
      token = null;
      showLogin();
      throw new Error("Session expired. Please sign in again.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const api = {
    get: (p) => req(p),
    post: (p, b) => req(p, { method: "POST", body: JSON.stringify(b) }),
    patch: (p, b) => req(p, { method: "PATCH", body: JSON.stringify(b) }),
    del: (p) => req(p, { method: "DELETE" }),
    upload: (p, fd, onProgress) =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", API_BASE + p);
        if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          let data = {};
          try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
          if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
          if (xhr.status === 401) { localStorage.removeItem(TOKEN_KEY); token = null; showLogin(); }
          reject(new Error(data.message || data.error || `Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.send(fd);
      }),
  };

  /* --------------------------------------------------------------- state */
  const state = {
    stats: {},
    categories: [],
    subcategories: [],
    designs: [],
    enqStatus: "all",
    enqQuery: "",
    photoDesign: null,
    socialLinks: [],
  };

  /* ------------------------------------------------------------ utilities */
  const fmtDate = (v) =>
    v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const fmtShort = (v) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—");
  const fmtAgo = (v) => {
    if (!v) return "—";
    const s = (Date.now() - new Date(v).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return fmtDate(v);
  };
  const bytes = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB");
  const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
  const empty = (title, body) =>
    `<div class="empty-state"><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;
  const loading = () => `<div class="loading"><span class="spinner"></span> Loading…</div>`;

  async function loadCategories() {
    try {
      const data = await api.get("/categories");
      state.categories = data.categories || [];
      state.subcategories = data.subcategories || [];
    } catch {
      state.categories = [];
      state.subcategories = [];
    }
  }

  const catOptions = (sel) =>
    '<option value="">— occasion —</option>' +
    state.categories.map((c) => `<option value="${escAttr(c.id)}"${String(c.id) === String(sel) ? " selected" : ""}>${esc(c.name)}</option>`).join("");

  const subOptions = (sel, catId) => {
    const list = state.subcategories.filter((s) => !catId || String(s.category_id) === String(catId));
    return '<option value="">— style —</option>' +
      list.map((s) => `<option value="${escAttr(s.id)}"${String(s.id) === String(sel) ? " selected" : ""}>${esc(s.name)}</option>`).join("");
  };

  /* ============================================================== LOGIN */

  function showLogin() {
    $("#loginScreen").hidden = false;
    $("#adminShell").hidden = true;
  }

  function showShell(admin) {
    $("#loginScreen").hidden = true;
    $("#adminShell").hidden = false;
    $("#whoami").textContent = `${admin.name || admin.email}`;
    if (admin.email === "admin@asdecoration.com") {
      $("#profileInfo").innerHTML =
        `<span class="badge badge--pending">Default password</span> You are still signed in with the password created by the seed script. Please change it below.`;
    } else {
      $("#profileInfo").textContent = `Signed in as ${admin.email}`;
    }
    refreshStats();
  }

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#loginError");
    err.hidden = true;
    const btn = $("#loginForm button");
    btn.disabled = true;
    try {
      const data = await req("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: $("#email").value.trim(), password: $("#password").value }),
      });
      token = data.token;
      localStorage.setItem(TOKEN_KEY, token);
      showShell(data.admin);
      toast("Welcome back.", "ok");
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("#logoutBtn").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    token = null;
    showLogin();
  });

  /* ============================================================ NAV */

  const TITLES = {
    dashboard: "Dashboard", enquiries: "Enquiries", designs: "Designs", categories: "Home Sections",
    media: "Photo library", social: "Social Links", profile: "Profile",
  };

  const LOADERS = {
    dashboard: loadDashboard, enquiries: loadEnquiries, designs: loadDesigns,
    categories: loadTaxonomy, media: loadMedia,
    social: loadSocial, profile: async () => {},
  };

  function show(view) {
    $$("#nav a").forEach((a) => a.classList.toggle("is-active", a.dataset.view === view));
    $$(".view").forEach((v) => (v.hidden = v.dataset.view !== view));
    $("#viewTitle").textContent = TITLES[view] || "";
    $("#sidebar").classList.remove("is-open");
    history.replaceState(null, "", "#" + view);
    (LOADERS[view] || (() => {}))();
  }

  $("#nav").addEventListener("click", (e) => {
    const a = e.target.closest("a[data-view]");
    if (!a) return;
    e.preventDefault();
    show(a.dataset.view);
  });
  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-goto]");
    if (g) show(g.dataset.goto);
  });
  $("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("is-open"));

  /* ======================================================== DASHBOARD */

  async function refreshStats() {
    try {
      const { stats } = await api.get("/admin/stats");
      state.stats = stats;
      ["newEnquiries", "pendingReviews", "pendingUploads", "placeholders"].forEach((k) => {
        const el = $(`[data-count="${k}"]`);
        if (!el) return;
        const n = stats[k] || 0;
        el.textContent = n;
        el.hidden = !n;
      });
    } catch { /* non-fatal */ }
  }

  async function loadDashboard() {
    await refreshStats();
    const s = state.stats;

    const ph = s.placeholders || 0;
    $("#placeholderAlert").innerHTML = ph
      ? `<div class="alert alert--warn"><strong>${ph} placeholder photo${ph === 1 ? "" : "s"} left.</strong>
         These are stock images standing in for your real work. Replace them from the
         <a href="#media" data-goto="media" style="text-decoration:underline">photo library</a> or
         from a design's photo manager.</div>`
      : "";

    const cards = [
      ["New enquiries", s.newEnquiries, 0],
      ["Total enquiries", s.totalEnquiries, 0],
      ["This month", s.monthEnquiries, 0],
      ["Active designs", s.activeDesigns, 0],
      ["Pending reviews", s.pendingReviews, 0],
      ["Pending photos", s.pendingUploads, 0],
      ["Live events", s.liveEvents, 0],
      ["Average rating", Number(s.averageRating || 0).toFixed(1), 0],
      ["30-day views", s.views30d, 0],
      ["Unique leads", s.uniqueLeads, 0],
    ];
    $("#statGrid").innerHTML = cards
      .map(
        ([label, num]) =>
          `<div class="stat"><div class="stat__num">${esc(num)}</div><div class="stat__label">${esc(label)}</div></div>`
      )
      .join("");

    $("#timelineChart").innerHTML = loading();
    $("#areaChart").innerHTML = loading();
    $("#eventChart").innerHTML = loading();

    try {
      const a = await api.get("/admin/analytics?days=30");

      /* line chart, hand-rolled SVG */
      const tl = a.timeline || [];
      const W = 700, H = 180, PAD = 24;
      const max = Math.max(1, ...tl.map((d) => d.enquiries));
      const step = tl.length > 1 ? (W - PAD * 2) / (tl.length - 1) : 0;
      const pts = tl.map((d, i) => [PAD + i * step, H - PAD - (d.enquiries / max) * (H - PAD * 2)]);
      const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
      const area = pts.length
        ? `${line} L${pts[pts.length - 1][0].toFixed(1)},${H - PAD} L${pts[0][0].toFixed(1)},${H - PAD} Z`
        : "";
      $("#timelineChart").innerHTML = `
        <svg class="line-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Enquiries per day over 30 days">
          <line class="axis" x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" />
          <text class="lbl" x="${PAD}" y="${H - 6}">${esc(fmtShort(tl[0]?.day))}</text>
          <text class="lbl" x="${W - PAD}" y="${H - 6}" text-anchor="end">${esc(fmtShort(tl[tl.length - 1]?.day))}</text>
          <text class="lbl" x="2" y="${PAD}">${max}</text>
          <path class="area" d="${area}" />
          <path class="line" d="${line}" />
          ${pts.filter((_, i) => tl[i].enquiries > 0).map((p) => `<circle class="pt" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5"/>`).join("")}
        </svg>`;

      /* bar rows */
      const bars = (rows, key, label) => {
        if (!rows.length) return empty("No data yet", "Nothing recorded in this period.");
        const max2 = Math.max(1, ...rows.map((r) => r[key]));
        return rows
          .map(
            (r) => `<div class="bar-row">
              <span>${esc(r[label] ?? "—")}</span>
              <span class="bar-row__track"><span class="bar-row__fill" style="width:${Math.round((r[key] / max2) * 100)}%"></span></span>
              <span class="bar-row__val">${esc(r[key])}</span>
            </div>`
          )
          .join("");
      };
      $("#areaChart").innerHTML = bars(a.byArea || [], "enquiries", "area");
      $("#eventChart").innerHTML = bars(a.byEventType || [], "enquiries", "event_type");

      const f = a.funnel || {};
      $("#funnel").innerHTML = `
        <div class="funnel__step"><strong>${esc(f.views || 0)}</strong><span>Page views</span></div>
        <div class="funnel__step"><strong>${esc(f.designViews || 0)}</strong><span>Design pages</span></div>
        <div class="funnel__step"><strong>${esc(f.enquiries || 0)}</strong><span>Enquiries sent</span></div>`;

      const top = a.top || [];
      $("#topDesigns").innerHTML = top.length
        ? top
            .map(
              (d) => `<div class="bar-row">
                <span>${esc(d.name)}</span>
                <span class="bar-row__track"><span class="bar-row__fill" style="width:${Math.min(100, (d.views / Math.max(1, top[0].views)) * 100)}%"></span></span>
                <span class="bar-row__val">${esc(d.views)}</span>
              </div>`
            )
            .join("")
        : empty("No views yet", "Design view counts will appear here.");

      if (a.storage) {
        $("#storageInfo").textContent = `${a.storage.files} file(s) · ${bytes(Number(a.storage.total_bytes))}`;
      }
    } catch (ex) {
      $("#timelineChart").innerHTML = empty("Analytics unavailable", ex.message);
    }

    /* recent enquiries */
    try {
      const { enquiries } = await api.get("/admin/enquiries");
      const rows = enquiries.slice(0, 6);
      $("#recentEnq").innerHTML = rows.length
        ? `<thead><tr><th>Name</th><th>Phone</th><th>Occasion</th><th>Town</th><th>Status</th><th>When</th></tr></thead><tbody>${rows
            .map(
              (e) => `<tr>
                <td><strong>${esc(e.name)}</strong></td>
                <td>${esc(e.phone)}</td>
                <td>${esc(e.eventType || "—")}</td>
                <td>${esc(e.town || e.district || "—")}</td>
                <td><span class="badge badge--${escAttr(e.status)}">${esc(e.status)}</span></td>
                <td class="muted">${esc(fmtAgo(e.createdAt))}</td>
              </tr>`
            )
            .join("")}</tbody>`
        : `<tbody><tr><td>${empty("No enquiries yet", "Enquiries from the website will appear here.")}</td></tr></tbody>`;
    } catch { /* non-fatal */ }
  }

  /* ======================================================== ENQUIRIES */

  const ENQ_STATUSES = ["all", "new", "contacted", "quoted", "confirmed", "completed", "cancelled"];

  function renderTabs() {
    $("#enqTabs").innerHTML = ENQ_STATUSES
      .map(
        (s) => `<button class="tab ${s === state.enqStatus ? "is-active" : ""}" data-status="${s}">${esc(s)}</button>`
      )
      .join("");
  }

  async function loadEnquiries() {
    renderTabs();
    const t = $("#enqTable");
    t.innerHTML = `<tbody><tr><td>${loading()}</td></tr></tbody>`;
    try {
      const q = new URLSearchParams();
      if (state.enqStatus !== "all") q.set("status", state.enqStatus);
      if (state.enqQuery) q.set("q", state.enqQuery);
      const { enquiries } = await api.get("/admin/enquiries?" + q.toString());

      t.innerHTML = enquiries.length
        ? `<thead><tr><th>Name</th><th>Phone</th><th>Occasion</th><th>Date</th><th>Town</th><th>Status</th><th></th></tr></thead>
           <tbody>${enquiries
             .map(
               (e) => `<tr>
                 <td><strong>${esc(e.name)}</strong><br><small class="muted">${esc(e.email || "")}</small></td>
                 <td>${esc(e.phone)}</td>
                 <td>${esc(e.eventType || "—")}</td>
                 <td>${esc(fmtDate(e.eventDate))}</td>
                 <td>${esc(e.town || e.district || "—")}</td>
                 <td><span class="badge badge--${escAttr(e.status)}">${esc(e.status)}</span></td>
                 <td><button class="btn btn--ghost btn--sm" data-open-enq="${e.id}">Open</button></td>
               </tr>`
             )
             .join("")}</tbody>`
        : `<tbody><tr><td>${empty("Nothing here", "No enquiries match this filter yet.")}</td></tr></tbody>`;

      $$("[data-open-enq]", t).forEach((b) =>
        b.addEventListener("click", () => openEnquiry(Number(b.dataset.openEnq)))
      );
    } catch (ex) {
      t.innerHTML = `<tbody><tr><td>${empty("Could not load", ex.message)}</td></tr></tbody>`;
    }
  }

  async function openEnquiry(id) {
    try {
      const { enquiry: e } = await api.get(`/admin/enquiries/${id}`);
      openModal(`
        <h2 style="font-size:1.4rem;margin-bottom:.25rem">${esc(e.name)}</h2>
        <p class="muted" style="margin-bottom:1.25rem">Received ${esc(fmtDate(e.createdAt))} · ${esc(fmtAgo(e.createdAt))}</p>

        <div class="detail-grid">
          <div class="detail-item"><small>Phone</small><strong>${esc(e.phone)}</strong></div>
          <div class="detail-item"><small>Email</small><strong>${esc(e.email || "—")}</strong></div>
          <div class="detail-item"><small>Occasion</small><strong>${esc(e.eventType || "—")}</strong></div>
          <div class="detail-item"><small>Event date</small><strong>${esc(fmtDate(e.eventDate))}</strong></div>
          <div class="detail-item"><small>Area</small><strong>${esc([e.town, e.district].filter(Boolean).join(", ") || "—")}</strong></div>
          <div class="detail-item"><small>Design</small><strong>${esc(e.designName || "—")}</strong></div>
          <div class="detail-item"><small>Source</small><strong>${esc(e.source || "—")}</strong></div>
          <div class="detail-item"><small>Budget note</small><strong>${esc(e.budgetNote || "—")}</strong></div>
        </div>

        ${e.requirement ? `<div class="field"><label>Their message</label><p style="background:var(--purple-100);padding:.85rem;border-radius:8px;white-space:pre-wrap">${esc(e.requirement)}</p></div>` : ""}

        <div class="field">
          <label for="enqStatusSel">Status</label>
          <select id="enqStatusSel">
            ${["new", "contacted", "quoted", "confirmed", "completed", "cancelled"]
              .map((s) => `<option value="${s}"${s === e.status ? " selected" : ""}>${esc(s)}</option>`)
              .join("")}
          </select>
        </div>

        <div class="field">
          <label for="enqNotes">Your private notes</label>
          <textarea id="enqNotes" rows="3" placeholder="Quoted 45k, waiting for confirmation…">${esc(e.notes || "")}</textarea>
          <span class="hint">Saved when you click Save notes. Never shown to the customer.</span>
        </div>

        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem">
          <a class="btn btn--gold btn--sm" href="${escAttr(e.whatsappLink)}" target="_blank" rel="noopener">WhatsApp them</a>
          <a class="btn btn--ghost btn--sm" href="tel:${escAttr("+" + e.phone)}">Call</a>
          <button class="btn btn--ghost btn--sm" id="enqSaveNotes">Save notes</button>
          <span style="flex:1"></span>
          <button class="btn btn--danger btn--sm" id="enqDelete">Delete</button>
        </div>`, true);

      $("#enqStatusSel").addEventListener("change", async (ev) => {
        try {
          await api.patch(`/admin/enquiries/${id}`, { status: ev.target.value });
          toast(`Marked as ${ev.target.value}.`, "ok");
          refreshStats();
          loadEnquiries();
        } catch (ex) { toast(ex.message, "err"); }
      });

      $("#enqSaveNotes").addEventListener("click", async () => {
        try {
          await api.patch(`/admin/enquiries/${id}/notes`, { notes: $("#enqNotes").value });
          toast("Notes saved.", "ok");
          loadEnquiries();
        } catch (ex) { toast(ex.message, "err"); }
      });

      $("#enqDelete").addEventListener("click", async () => {
        if (!confirm(`Delete the enquiry from ${e.name}? This cannot be undone.`)) return;
        try {
          await api.del(`/admin/enquiries/${id}`);
          toast("Enquiry deleted.");
          closeModal();
          refreshStats();
          loadEnquiries();
        } catch (ex) { toast(ex.message, "err"); }
      });
    } catch (ex) {
      toast(ex.message, "err");
    }
  }

  $("#enqTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-status]");
    if (!b) return;
    state.enqStatus = b.dataset.status;
    loadEnquiries();
  });

  let searchTimer;
  $("#enqSearch").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.enqQuery = e.target.value.trim();
      loadEnquiries();
    }, 300);
  });

  $("#exportCsv").addEventListener("click", async () => {
    try {
      const res = await fetch(API_BASE + "/admin/enquiries/export", {
        headers: { Authorization: "Bearer " + token },
      });
      if (!res.ok) throw new Error("Export failed.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "as-decoration-enquiries.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast("CSV downloaded.", "ok");
    } catch (ex) { toast(ex.message, "err"); }
  });

  /* =========================================================== DESIGNS */

  async function loadDesigns() {
    const t = $("#designTable");
    t.innerHTML = `<tbody><tr><td>${loading()}</td></tr></tbody>`;
    try {
      const { items } = await api.get("/admin/designs");
      state.designs = items;

      t.innerHTML = items.length
        ? `<thead><tr><th></th><th>Name</th><th>Occasion / style</th><th>Photos</th><th>Views</th><th>Enquiries</th><th>Flags</th><th></th></tr></thead>
           <tbody>${items
             .map(
               (d) => `<tr>
                 <td>${d.cover ? `<img class="row-thumb" src="${escAttr(d.cover.thumb)}" alt="" loading="lazy" />` : '<span class="muted">none</span>'}</td>
                 <td><strong>${esc(d.name)}</strong><br><small class="muted">/design.html?slug=${escAttr(d.slug)}</small></td>
                 <td>${esc([d.categoryName, d.subcategoryName].filter(Boolean).join(" · ") || "—")}</td>
                 <td>${esc(d.imageCount || 0)} / 8</td>
                 <td>${esc(d.views || 0)}</td>
                 <td>${esc(d.enquiryCount || 0)}</td>
                 <td>
                   ${d.featured ? '<span class="badge badge--approved">featured</span> ' : ""}
                   ${d.active ? "" : '<span class="badge badge--inactive">hidden</span>'}
                   ${d.isInspiration ? "" : '<span class="badge badge--completed">our work</span>'}
                 </td>
                 <td style="white-space:nowrap">
                   <button class="btn btn--gold btn--sm" data-photos="${d.id}">Photos</button>
                   <button class="btn btn--ghost btn--sm" data-edit="${d.id}">Edit</button>
                   <button class="btn btn--ghost btn--sm" data-del="${d.id}">✕</button>
                 </td>
               </tr>`
             )
             .join("")}</tbody>`
        : `<tbody><tr><td>${empty("No designs yet", "Add your first design to start building the catalogue.")}</td></tr></tbody>`;

      $$("[data-edit]", t).forEach((b) => b.addEventListener("click", () => openDesignEditor(Number(b.dataset.edit))));
      $$("[data-del]", t).forEach((b) =>
        b.addEventListener("click", async () => {
          const d = state.designs.find((x) => x.id === Number(b.dataset.del));
          if (!confirm(`Delete "${d?.name}"? This cannot be undone.`)) return;
          try {
            await api.del(`/admin/designs/${b.dataset.del}`);
            toast("Design deleted.");
            loadDesigns();
            refreshStats();
          } catch (ex) { toast(ex.message, "err"); }
        })
      );
      $$("[data-photos]", t).forEach((b) =>
        b.addEventListener("click", () => openPhotoManager(Number(b.dataset.photos)))
      );
    } catch (ex) {
      t.innerHTML = `<tbody><tr><td>${empty("Could not load", ex.message)}</td></tr></tbody>`;
    }
  }

  async function openDesignEditor(id) {
    await loadCategories();
    const d = id ? state.designs.find((x) => x.id === id) : null;

    openModal(`
      <h2 style="font-size:1.35rem;margin-bottom:1.25rem">${d ? "Edit design" : "New design"}</h2>
      <form id="designForm">
        <div class="field"><label for="dName">Name <span style="color:var(--danger)">*</span></label>
          <input id="dName" value="${escAttr(d?.name || "")}" required /></div>

        <div class="form-row">
          <div class="field"><label>Occasion</label><select id="dCat">${catOptions(d?.categoryId)}</select></div>
          <div class="field"><label>Style</label><select id="dSub">${subOptions(d?.subcategoryId, d?.categoryId)}</select></div>
        </div>

        <div class="field"><label for="dDesc">Description</label>
          <textarea id="dDesc" rows="3" placeholder="What makes this design work?">${esc(d?.description || "")}</textarea></div>

        <div class="field"><label for="dHighlights">What's included (one per line)</label>
          <textarea id="dHighlights" rows="4" placeholder="Four-pillar mandap&#10;Fresh floral frame&#10;Warm uplighting">${esc((d?.highlights || []).join("\n"))}</textarea>
          <span class="hint">Shown as a bullet list on the design page.</span></div>

        <div class="form-row">
          <div class="field"><label for="dTown">Town (for real projects)</label>
            <input id="dTown" value="${escAttr(d?.town || "")}" placeholder="Rajgir" /></div>
          <div class="field"><label for="dDate">Event date</label>
            <input id="dDate" type="date" value="${escAttr((d?.eventDate || "").slice(0, 10))}" /></div>
        </div>

        <div style="display:flex;gap:1.25rem;flex-wrap:wrap;margin-bottom:1rem">
          <label class="check"><input type="checkbox" id="dInsp" ${d ? (d.isInspiration ? "checked" : "") : "checked"} /> Catalogue design</label>
          <label class="check"><input type="checkbox" id="dFeat" ${d?.featured ? "checked" : ""} /> Featured</label>
          <label class="check"><input type="checkbox" id="dActive" ${d ? (d.active ? "checked" : "") : "checked"} /> Visible on site</label>
        </div>

        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn--gold" type="submit">${d ? "Save changes" : "Create design"}</button>
          ${d ? '<button class="btn btn--ghost" type="button" id="goPhotos">Manage photos</button>' : ""}
        </div>
        <p class="hint" style="margin-top:.75rem">Add the photos next — a design with no photo won't look right in the catalogue.</p>
      </form>`);

    const catSel = $("#dCat"), subSel = $("#dSub");
    catSel.addEventListener("change", () => (subSel.innerHTML = subOptions(null, catSel.value)));

    $("#designForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      const payload = {
        name: $("#dName").value.trim(),
        categoryId: catSel.value || null,
        subcategoryId: subSel.value || null,
        description: $("#dDesc").value.trim(),
        highlights: $("#dHighlights").value.split("\n").map((s) => s.trim()).filter(Boolean),
        town: $("#dTown").value.trim() || null,
        eventDate: $("#dDate").value || null,
        isInspiration: $("#dInsp").checked,
        featured: $("#dFeat").checked,
        active: $("#dActive").checked,
      };
      try {
        if (d) await api.patch(`/admin/designs/${d.id}`, payload);
        else await api.post("/admin/designs", payload);
        toast(d ? "Design updated." : "Design created — now add its photos.", "ok");
        closeModal();
        loadDesigns();
        refreshStats();
      } catch (ex) {
        toast(ex.message, "err");
        btn.disabled = false;
      }
    });

    $("#goPhotos")?.addEventListener("click", () => openPhotoManager(d.id));
  }

  $("#addDesign").addEventListener("click", () => openDesignEditor(null));

  /* ====================================================== PHOTO MANAGER */

  async function openPhotoManager(designId) {
    state.photoDesign = designId;
    let design;
    try {
      const { design: d } = await api.get(`/admin/designs/${designId}`);
      design = d;
    } catch (ex) {
      return toast(ex.message, "err");
    }

    const render = (d) => {
      const imgs = d.images || [];
      return `
        <h2 style="font-size:1.35rem;margin-bottom:.25rem">${esc(d.name)}</h2>
        <p class="muted" style="margin-bottom:1.25rem">${imgs.length} of 8 photos. Drag a photo to reorder — the first one is the cover.</p>

        <div class="dropzone" id="drop">
          <strong>Tap to choose photos, or drag them here</strong>
          You can select several at once. JPG, PNG or WEBP, up to 8 MB each.
          <input type="file" id="fileInput" accept="image/*" multiple hidden />
        </div>
        <div class="progress" id="prog" hidden><div class="progress__fill" style="width:0"></div></div>

        <div class="thumb-grid" id="thumbs">
          ${imgs
            .map(
              (img, i) => `<div class="thumb" draggable="true" data-media="${img.id}">
                <img src="${escAttr(img.thumb)}" alt="" loading="lazy" />
                ${i === 0 ? '<span class="thumb__cover">Cover</span>' : ""}
                ${img.isPlaceholder ? '<span class="thumb__ph">Placeholder</span>' : ""}
                <div class="thumb__tools">
                  ${i !== 0 ? `<button type="button" data-cover="${img.id}">Make cover</button>` : ""}
                  <button type="button" data-delimg="${img.id}">Remove</button>
                </div>
              </div>`
            )
            .join("")}
        </div>
        ${imgs.length ? '<p class="hint" style="margin-top:.75rem">Use "Make cover" or drag to reorder. Removing a photo deletes it from storage.</p>' : ""}`;
    };

    const reload = async () => {
      const { design: d } = await api.get(`/admin/designs/${designId}`);
      modalContent.innerHTML = render(d);
      bind();
      refreshStats();
    };

    function bind() {
      const drop = $("#drop");
      const input = $("#fileInput");
      if (!drop) return;

      drop.addEventListener("click", () => input.click());
      input.addEventListener("change", () => {
        if (input.files.length) upload([...input.files]);
        input.value = "";
      });

      ["dragenter", "dragover"].forEach((ev) =>
        drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); })
      );
      ["dragleave", "drop"].forEach((ev) =>
        drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); })
      );
      drop.addEventListener("drop", (e) => {
        const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
        if (files.length) upload(files);
      });

      /* delete */
      $$("[data-delimg]").forEach((b) =>
        b.addEventListener("click", async () => {
          if (!confirm("Remove this photo? It will be deleted from storage.")) return;
          try {
            await api.del(`/admin/designs/${designId}/images/${b.dataset.delimg}`);
            toast("Photo removed.");
            reload();
          } catch (ex) { toast(ex.message, "err"); }
        })
      );

      /* make cover */
      $$("[data-cover]").forEach((b) =>
        b.addEventListener("click", async () => {
          const { design: d } = await api.get(`/admin/designs/${designId}`);
          const ids = (d.images || []).map((i) => i.id);
          const target = Number(b.dataset.cover);
          const rest = ids.filter((x) => x !== target);
          try {
            await api.patch(`/admin/designs/${designId}/images/reorder`, { mediaIds: [target, ...rest] });
            toast("Cover photo updated.", "ok");
            reload();
          } catch (ex) { toast(ex.message, "err"); }
        })
      );

      /* drag to reorder */
      let dragId = null;
      $$("#thumbs .thumb").forEach((el) => {
        el.addEventListener("dragstart", () => { dragId = Number(el.dataset.media); el.classList.add("is-dragging"); });
        el.addEventListener("dragend", () => { el.classList.remove("is-dragging"); saveOrder(); });
        el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("is-over"); });
        el.addEventListener("dragleave", () => el.classList.remove("is-over"));
        el.addEventListener("drop", async (e) => {
          e.preventDefault();
          el.classList.remove("is-over");
          if (!dragId || dragId === Number(el.dataset.media)) return;
          const ids = $$("#thumbs .thumb").map((x) => Number(x.dataset.media));
          const from = ids.indexOf(dragId);
          const to = ids.indexOf(Number(el.dataset.media));
          if (from < 0 || to < 0) return;
          ids.splice(to, 0, ids.splice(from, 1)[0]);
          const target = ids.indexOf(dragId);
          ids.splice(target, 1);
          ids.unshift(dragId);
          try {
            await api.patch(`/admin/designs/${designId}/images/reorder`, { mediaIds: ids });
            toast("Order saved.");
            reload();
          } catch (ex) { toast(ex.message, "err"); }
        });
      });

      async function saveOrder() {
        const ids = $$("#thumbs .thumb").map((x) => Number(x.dataset.media));
        if (!ids.length) return;
        try {
          await api.patch(`/admin/designs/${designId}/images/reorder`, { mediaIds: ids });
        } catch (ex) { toast(ex.message, "err"); }
      }
    }

    async function upload(files) {
      const current = state.designs.find((d) => d.id === designId);
      const have = current ? current.imageCount || (current.images || []).length : (design.images || []).length;
      if (have + files.length > 8) {
        return toast(`That would exceed 8 photos (currently ${have}).`, "err");
      }
      const big = files.find((f) => f.size > 8 * 1024 * 1024);
      if (big) return toast(`"${big.name}" is over 8 MB.`, "err");

      const fd = new FormData();
      files.forEach((f) => fd.append("images", f));
      const prog = $("#prog");
      const fill = prog.firstElementChild;
      prog.hidden = false;

      try {
        await api.upload(`/admin/designs/${designId}/images`, fd, (p) => (fill.style.width = p + "%"));
        toast(`${files.length} photo${files.length === 1 ? "" : "s"} uploaded.`, "ok");
        await reload();
      } catch (ex) {
        toast(ex.message, "err");
      } finally {
        prog.hidden = true;
        fill.style.width = "0";
      }
    }

    openModal(render(design), true);
    bind();
  }

  /* ============================================================== MEDIA */

  async function loadMedia() {
    const grid = $("#mediaGrid");
    grid.innerHTML = loading();
    try {
      const { items, placeholders } = await api.get("/admin/media");
      $("#phHelp").innerHTML = placeholders
        ? `<strong>${placeholders} placeholder photo${placeholders === 1 ? "" : "s"}.</strong>
           These are stock images, not your real work. Upload your own from a design's photo manager,
           then delete the placeholder.`
        : `All photos are your own — no placeholders left.`;

      grid.innerHTML = items.length
        ? items
            .map(
              (m) => `<div class="media-card">
                <div class="media-card__img">
                  <img src="${escAttr(m.thumb)}" alt="${escAttr(m.alt || "")}" loading="lazy" />
                  ${m.is_placeholder ? '<span class="thumb__ph" style="top:.35rem;right:.35rem">Placeholder</span>' : ""}
                </div>
                <div class="media-card__body">
                  <div class="name" title="${escAttr(m.alt || m.filename)}">${esc(m.alt || m.filename)}</div>
                  <div class="muted">${esc(bytes(Number(m.bytes || 0)))} · used ${esc(m.design_uses + m.gallery_uses + m.upload_uses)}×</div>
                </div>
                <div class="media-card__actions">
                  <button type="button" data-ph-toggle="${m.id}" data-current="${m.is_placeholder}">
                    ${m.is_placeholder ? "Mark real" : "Mark PH"}
                  </button>
                  <button type="button" data-med-del="${m.id}">Delete</button>
                </div>
              </div>`
            )
            .join("")
        : empty("No photos yet", "Upload your first real event photo above.");

      $$("[data-ph-toggle]", grid).forEach((b) =>
        b.addEventListener("click", async () => {
          try {
            await api.patch(`/admin/media/${b.dataset.phToggle}`, { isPlaceholder: b.dataset.current !== "true" });
            toast("Updated.");
            loadMedia();
          } catch (ex) { toast(ex.message, "err"); }
        })
      );

      $$("[data-med-del]", grid).forEach((b) =>
        b.addEventListener("click", async () => {
          if (!confirm("Delete this photo permanently?")) return;
          try {
            await api.del(`/admin/media/${b.dataset.medDel}`);
            toast("Photo deleted.");
            loadMedia();
            refreshStats();
          } catch (ex) { toast(ex.message, "err"); }
        })
      );
    } catch (ex) {
      grid.innerHTML = empty("Could not load", ex.message);
    }
  }

  function bindMediaDrop() {
    const drop = $("#mediaDrop");
    const input = $("#mediaInput");
    drop.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      if (input.files.length) uploadMedia([...input.files]);
      input.value = "";
    });
    ["dragenter", "dragover"].forEach((ev) =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); })
    );
    ["dragleave", "drop"].forEach((ev) =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); })
    );
    drop.addEventListener("drop", (e) => {
      const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) uploadMedia(files);
    });
  }

  async function uploadMedia(files) {
    const big = files.find((f) => f.size > 8 * 1024 * 1024);
    if (big) return toast(`"${big.name}" is over 8 MB.`, "err");
    const fd = new FormData();
    files.forEach((f) => fd.append("images", f));
    const prog = $("#mediaProgress");
    const fill = prog.firstElementChild;
    prog.hidden = false;
    try {
      await api.upload("/admin/media", fd, (p) => (fill.style.width = p + "%"));
      toast(`${files.length} photo${files.length === 1 ? "" : "s"} uploaded.`, "ok");
      loadMedia();
    } catch (ex) {
      toast(ex.message, "err");
    } finally {
      prog.hidden = true;
      fill.style.width = "0";
    }
  }

  /* ============================================================= SOCIAL
   * Only the Instagram and YouTube profile links, which render in the site
   * footer on every page. Edited here; the videos and Instagram post embeds
   * were dropped from the admin at the owner's request.
   * -------------------------------------------------------------------- */

  const SOCIAL_PLATFORMS = [
    { key: "instagram", label: "Instagram", hint: "https://instagram.com/yourpage" },
    { key: "youtube", label: "YouTube", hint: "https://youtube.com/@yourchannel" },
  ];

  function socialCard(link, meta) {
    if (!link) {
      return `
        <div class="soc-card" data-platform="${meta.key}">
          <div class="soc-card__head">
            <strong>${esc(meta.label)}</strong>
            <span class="badge badge--pending">Not set</span>
          </div>
          <div class="soc-card__row">
            <input class="soc-url" data-soc-url="${meta.key}" placeholder="${escAttr(meta.hint)}" />
            <input class="soc-label" data-soc-label="${meta.key}" placeholder="Label shown in the footer" value="${escAttr(meta.label)}" />
            <button class="btn btn--gold btn--sm" data-soc-save="${meta.key}">Save</button>
          </div>
        </div>`;
    }
    return `
      <div class="soc-card ${link.active ? "" : "is-off"}" data-platform="${link.platform}">
        <div class="soc-card__head">
          <strong>${esc(link.label || meta.label)}</strong>
          <label class="check">
            <input type="checkbox" data-soc-on="${link.id}" ${link.active ? "checked" : ""} />
            Show in footer
          </label>
        </div>
        <div class="soc-card__row">
          <input class="soc-url" data-soc-url="${link.platform}" value="${escAttr(link.url)}" placeholder="${escAttr(meta.hint)}" />
          <input class="soc-label" data-soc-label="${link.platform}" value="${escAttr(link.label || "")}" placeholder="Label shown in the footer" />
          <button class="btn btn--gold btn--sm" data-soc-save="${link.platform}">Save</button>
          <a class="btn btn--ghost btn--sm" href="${escAttr(link.url)}" target="_blank" rel="noopener">Open</a>
        </div>
        ${link.handle ? `<p class="hint" style="margin-top:.5rem">${esc(link.handle)}</p>` : ""}
      </div>`;
  }

  async function loadSocial() {
    const host = $("#socialCards");
    if (!host) return;
    let links = [];
    try {
      /* the admin endpoint returns { items }, the public one returns { links } */
      const data = await api.get("/admin/social");
      links = data.items || [];
    } catch (e) {
      host.innerHTML = `<div class="alert alert--warn">${esc(e.message)}</div>`;
      return;
    }
    state.socialLinks = links;
    host.innerHTML = SOCIAL_PLATFORMS.map((meta) => {
      const found = links.find((l) => l.platform === meta.key);
      return socialCard(found, meta);
    }).join("");
  }

  $("#socialCards")?.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-soc-save]");
    if (!b) return;
    const key = b.dataset.socSave;
    const url = $(`[data-soc-url="${key}"]`)?.value.trim();
    const label = $(`[data-soc-label="${key}"]`)?.value.trim();
    if (!url) return toast("Paste the link first.", "err");
    if (!/^https?:\/\//i.test(url)) return toast("The link must start with https://", "err");
    try {
      const existing = state.socialLinks?.find((l) => l.platform === key);
      if (existing) await api.patch(`/admin/social/${existing.id}`, { url, label });
      else await api.post("/admin/social", { platform: key, url, label });
      toast("Saved. The footer is updated.", "ok");
      loadSocial();
    } catch (err) { toast(err.message, "err"); }
  });

  $("#socialCards")?.addEventListener("change", async (e) => {
    const t = e.target;
    if (!t.dataset.socOn) return;
    try {
      await api.patch(`/admin/social/${t.dataset.socOn}`, { active: t.checked });
      t.closest(".soc-card")?.classList.toggle("is-off", !t.checked);
      toast(t.checked ? "Shown in the footer." : "Hidden from the footer.", "ok");
    } catch (err) { toast(err.message, "err"); loadSocial(); }
  });

  /* ============================================================ PROFILE */

  $("#profileForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const { admin } = await api.patch("/auth/me", {
        name: $("#pfName").value.trim(),
        email: $("#pfEmail").value.trim(),
      });
      $("#whoami").textContent = admin.name || admin.email;
      toast("Profile updated.", "ok");
    } catch (ex) { toast(ex.message, "err"); }
  });

  $("#passwordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const next = $("#pwNew").value;
    if (next !== $("#pwConfirm").value) return toast("The new passwords don't match.", "err");
    try {
      await api.post("/auth/password", { currentPassword: $("#pwCurrent").value, newPassword: next });
      $("#passwordForm").reset();
      toast("Password changed.", "ok");
    } catch (ex) { toast(ex.message, "err"); }
  });

  /* ================================================================ BOOT */

  async function boot() {
    bindMediaDrop();
    wireTaxonomy();
    if (!token) return showLogin();
    try {
      const { admin } = await api.get("/auth/me");
      $("#pfName").value = admin.name || "";
      $("#pfEmail").value = admin.email || "";
      showShell(admin);
      show((location.hash || "#dashboard").slice(1));
    } catch {
      showLogin();
    }
  }

  /* ================================================== HOME SECTIONS
   * The homepage is a stack of sections, each with sub-headings. These rows
   * decide what appears and in what order, so the owner can rename a heading,
   * hide one, or drag the order around without any code change. Hiding is
   * always non-destructive: the designs stay attached and reappear on unhide.
   * -------------------------------------------------------------------- */

  const move = async (kind, ids) => {
    try {
      await api.post("/admin/taxonomy/reorder", { kind, ids });
      toast("Order saved.", "ok");
      loadTaxonomy();
    } catch (e) {
      toast(e.message);
    }
  };

  function subRow(s) {
    return `
      <li class="tax-sub" data-sub="${s.id}">
        <span class="tax-drag" aria-hidden="true">⠿</span>
        <input class="tax-name" value="${escAttr(s.name)}" aria-label="Sub-heading name" />
        <span class="tax-count">${s.design_count} design${s.design_count === 1 ? "" : "s"}</span>
        <label class="check" title="Show this heading on the homepage">
          <input type="checkbox" data-sub-on="${s.id}" ${s.show_on_home ? "checked" : ""} />
          On homepage
        </label>
        <button class="btn btn--ghost btn--sm" data-sub-add="${s.id}" data-sub-name="${escAttr(s.name)}">+ Design</button>
        <button class="icon-btn danger" data-sub-del="${s.id}" title="Delete this heading"
          aria-label="Delete ${escAttr(s.name)}">✕</button>
      </li>`;
  }

  function catBlock(c) {
    return `
      <article class="tax-cat ${c.show_on_home ? "" : "is-hidden"}" data-cat="${c.id}">
        <header class="tax-cat__head">
          <span class="tax-drag" aria-hidden="true">⠿</span>
          <input class="tax-name tax-name--big" value="${escAttr(c.name)}" data-cat-name="${c.id}"
                 aria-label="Section name" />
          <span class="tax-count">${c.design_count} design${c.design_count === 1 ? "" : "s"}</span>
          <label class="check">
            <input type="checkbox" data-cat-on="${c.id}" ${c.show_on_home ? "checked" : ""} />
            On homepage
          </label>
          <button class="btn btn--ghost btn--sm" data-cat-up="${c.id}">↑</button>
          <button class="btn btn--ghost btn--sm" data-cat-down="${c.id}">↓</button>
          <button class="icon-btn danger" data-cat-del="${c.id}" title="Delete this section"
            aria-label="Delete ${escAttr(c.name)}">✕</button>
        </header>
        <ul class="tax-subs">${c.subcategories.map(subRow).join("")}</ul>
        <button class="btn btn--ghost btn--sm" data-sub-new="${c.id}">+ Add heading to ${esc(c.name)}</button>
      </article>`;
  }

  async function loadTaxonomy() {
    const host = $("#taxonomyTree");
    if (!host) return;
    host.innerHTML = `<div class="loading">Loading sections…</div>`;
    let tree;
    try {
      ({ taxonomy: tree } = await api.get("/admin/taxonomy"));
    } catch (e) {
      host.innerHTML = `<div class="alert alert--warn">${esc(e.message)}</div>`;
      return;
    }
    if (!tree.length) {
      host.innerHTML = empty("No sections yet", "Create your first homepage section.");
      return;
    }
    host.innerHTML = tree.map(catBlock).join("");
  }

  /* Rename on blur, show/hide on change — no save button to forget. */
  function wireTaxonomy() {
    const host = $("#taxonomyTree");
    if (!host) return;

    host.addEventListener("change", async (e) => {
      const t = e.target;
      try {
        if (t.dataset.catOn !== undefined) {
          await api.patch(`/admin/categories/${t.dataset.catOn}`, { showOnHome: t.checked });
          t.closest(".tax-cat")?.classList.toggle("is-hidden", !t.checked);
          toast(t.checked ? "Section is now on the homepage." : "Section hidden.", "ok");
        } else if (t.dataset.subOn !== undefined) {
          await api.patch(`/admin/subcategories/${t.dataset.subOn}`, { showOnHome: t.checked });
          toast("Homepage updated.", "ok");
        }
      } catch (err) {
        toast(err.message);
        loadTaxonomy();
      }
    });

    host.addEventListener("focusout", async (e) => {
      const t = e.target;
      if (!t.dataset.catName) return;
      const name = t.value.trim();
      if (!name) { toast("Section name cannot be empty."); loadTaxonomy(); return; }
      try {
        await api.patch(`/admin/categories/${t.dataset.catName}`, { name });
        toast("Renamed.", "ok");
      } catch (err) { toast(err.message); loadTaxonomy(); }
    });

    host.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const d = b.dataset;
      try {
        if (d.catDel) {
          if (!confirm("Delete this section? Its designs move to no section and are not deleted.")) return;
          await api.del(`/admin/categories/${d.catDel}`);
          toast("Section deleted.");
        } else if (d.subDel) {
          if (!confirm("Delete this heading? Its designs are kept but no longer grouped.")) return;
          await api.del(`/admin/subcategories/${d.subDel}`);
          toast("Heading deleted.");
        } else if (d.subNew) {
          const name = prompt("Heading name", "");
          if (!name) return;
          await api.post("/admin/subcategories", { categoryId: Number(d.subNew), name });
          toast("Heading added.", "ok");
        } else if (d.subAdd) {
          show("designs");
          setTimeout(() => {
            toast(`Create the design, then choose "${d.subName}" as its Style.`);
            $("#addDesign")?.click();
          }, 220);
        } else if (d.catUp || d.catDown) {
          const ids = $$(".tax-cat").map((el) => Number(el.dataset.cat));
          const i = ids.indexOf(Number(d.catUp || d.catDown));
          const j = d.catUp ? i - 1 : i + 1;
          if (j < 0 || j >= ids.length) return;
          [ids[i], ids[j]] = [ids[j], ids[i]];
          await move("category", ids);
          return;
        }
        loadTaxonomy();
      } catch (err) { toast(err.message); }
    });
  }

  $("#addCategory")?.addEventListener("click", async () => {
    const name = prompt("Section name (for example: Wedding)");
    if (!name) return;
    const intro = prompt("One line shown under the heading (optional)", "") || null;
    try {
      await api.post("/admin/categories", { name, intro });
      toast("Section created.", "ok");
      loadTaxonomy();
    } catch (e) { toast(e.message); }
  });

  document.addEventListener("DOMContentLoaded", boot);
})();