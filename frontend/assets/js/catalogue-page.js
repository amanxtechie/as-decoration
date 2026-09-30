/* catalogue-page.js — filterable, searchable, paginated catalogue. */

(async function () {
  const { esc, escAttr } = window.UI;
  const PAGE_SIZE = 12;

  const el = {
    grid: document.getElementById("grid"),
    q: document.getElementById("q"),
    category: document.getElementById("fCategory"),
    subcategory: document.getElementById("fSubcategory"),
    sort: document.getElementById("fSort"),
    count: document.getElementById("count"),
    pagination: document.getElementById("pagination"),
  };

  const state = { offset: 0, total: 0, loading: false };
  let categories = [];
  let subcategories = [];

  /* ------------------------------------------------------------- filters */
  async function initFilters() {
    const params = new URLSearchParams(location.search);
    const wantedCategory = params.get("category") || "";
    const wantedSubcategory = params.get("subcategory") || "";
    if (params.get("q")) el.q.value = params.get("q");

    try {
      const data = await window.API.get("/categories");
      categories = data.categories;
      subcategories = data.subcategories;
    } catch {
      return; // filters degrade to "everything", which is still usable
    }

    el.category.innerHTML =
      '<option value="">All occasions</option>' +
      categories
        .map((x) => `<option value="${escAttr(x.slug)}"${x.slug === wantedCategory ? " selected" : ""}>${esc(x.name)} (${x.design_count})</option>`)
        .join("");

    syncSubcategories(el.category.value);

    if (wantedSubcategory) el.subcategory.value = wantedSubcategory;
  }

  function syncSubcategories(categorySlug) {
    const cat = categories.find((c) => c.slug === categorySlug);
    const list = subcategories.filter(
      (s) => !cat || String(s.category_id) === String(cat.id)
    );
    el.subcategory.disabled = list.length === 0;
    el.subcategory.innerHTML =
      '<option value="">All styles</option>' +
      list.map((s) => `<option value="${escAttr(s.slug)}">${esc(s.name)}</option>`).join("");
  }

  /* --------------------------------------------------------------- fetch */
  function params() {
    return {
      q: el.q.value.trim(),
      category: el.category.value,
      subcategory: el.subcategory.value,
      sort: el.sort.value,
      limit: PAGE_SIZE,
      offset: state.offset,
    };
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;
    el.grid.innerHTML = window.UI.skeletonCards(PAGE_SIZE);

    try {
      const { designs, total } = await window.API.get("/designs", params());
      state.total = total;
      el.count.textContent = `${total} design${total === 1 ? "" : "s"}`;

      el.grid.innerHTML = designs.length
        ? designs.map(window.Cards.designCard).join("")
        : window.UI.emptyState(
            "Nothing matches those filters",
            "Try clearing the search or choosing a different occasion.",
            { label: "Clear filters", href: "/catalogue.html" }
          );

      window.Cards.bindCards(el.grid);
      renderPagination();
      syncUrl();
    } catch (err) {
      el.grid.innerHTML = window.UI.emptyState("Couldn't load the catalogue", err.message);
      el.count.textContent = "";
    } finally {
      state.loading = false;
    }
  }

  function renderPagination() {
    const pages = Math.ceil(state.total / PAGE_SIZE);
    el.pagination.hidden = pages <= 1;
    if (pages <= 1) return;

    const current = Math.floor(state.offset / PAGE_SIZE) + 1;
    let html = `<button ${state.offset === 0 ? "disabled" : ""} data-page="${current - 2}">‹</button>`;

    for (let p = 1; p <= pages; p++) {
      if (pages > 7 && Math.abs(p - current) > 2 && p !== 1 && p !== pages) {
        if (html.slice(-12).indexOf("…") === -1) html += `<button disabled>…</button>`;
        continue;
      }
      html += `<button class="${p === current ? "is-active" : ""}" data-page="${p - 1}">${p}</button>`;
    }
    html += `<button ${state.offset + PAGE_SIZE >= state.total ? "disabled" : ""} data-page="${current}">›</button>`;

    el.pagination.innerHTML = html;
    el.pagination.querySelectorAll("[data-page]").forEach((b) =>
      b.addEventListener("click", () => {
        const off = Number(b.dataset.page) * PAGE_SIZE;
        if (off < 0 || off >= state.total) return;
        state.offset = off;
        load();
        document.getElementById("grid").scrollIntoView({ behavior: "smooth", block: "start" });
      })
    );
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (el.category.value) p.set("category", el.category.value);
    if (el.subcategory.value) p.set("subcategory", el.subcategory.value);
    if (el.q.value.trim()) p.set("q", el.q.value.trim());
    const url = p.toString() ? `?${p}` : location.pathname;
    history.replaceState(null, "", url);
  }

  /* -------------------------------------------------------------- events */
  el.q.addEventListener("input", window.UI.debounce(() => { state.offset = 0; load(); }, 320));
  el.category.addEventListener("change", () => {
    syncSubcategories(el.category.value);
    el.subcategory.value = "";
    state.offset = 0;
    load();
  });
  el.subcategory.addEventListener("change", () => { state.offset = 0; load(); });
  el.sort.addEventListener("change", () => { state.offset = 0; load(); });

  await initFilters();
  await load();
})();
