/* saved.js — favourites in localStorage. No account, no server. The visitor can
   push their whole shortlist into one WhatsApp message. */

window.Saved = (function () {
  const KEY = "as_saved_designs";
  const listeners = new Set();

  function all() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function persist(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch { /* ignore quota errors */ }
    listeners.forEach((fn) => fn(list));
    document.dispatchEvent(new CustomEvent("saved:changed", { detail: list }));
  }

  function has(id) {
    return all().some((d) => d.id === id || d._id === id);
  }

  function toggle(design) {
    const list = all();
    const id = design.id || design._id;
    const idx = list.findIndex((d) => (d.id || d._id) === id);
    if (idx >= 0) {
      list.splice(idx, 1);
      persist(list);
      return false;
    }
    list.push({
      id,
      slug: design.slug,
      name: design.name,
      category: design.categoryName || design.category || "",
      subcategory: design.subcategoryName || design.subcategory || "",
      cover: design.cover ? design.cover.thumb : null,
    });
    persist(list);
    return true;
  }

  function remove(id) {
    persist(all().filter((d) => (d.id || d._id) !== id));
  }

  function clear() {
    persist([]);
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /** Paint any save button on the page to match current state. */
  function syncButtons() {
    const saved = new Set(all().map((d) => d.id || d._id));
    document.querySelectorAll("[data-save-id]").forEach((btn) => {
      const on = saved.has(Number(btn.dataset.saveId));
      btn.classList.toggle("is-saved", on);
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", on ? "Remove from saved designs" : "Save this design");
    });
  }

  /** Render the shortlist panel on the catalogue page, if present. */
  function render() {
    syncButtons();
    const bar = document.getElementById("savedBar");
    if (!bar) return;
    const list = all();

    if (!list.length) {
      bar.innerHTML = `<span style="color:var(--muted)">No saved designs yet — tap the ♡ on any design to shortlist it.</span>`;
      return;
    }

    bar.innerHTML = `
      <strong>${list.length} saved</strong>
      <span style="color:var(--muted)">${list.map((d) => window.UI.esc(d.name)).join(", ")}</span>
      <span style="margin-left:auto;display:flex;gap:.5rem;flex-wrap:wrap">
        <a class="btn btn--gold btn--sm" href="${window.UI.escAttr(window.WhatsApp.forSaved(list))}" target="_blank" rel="noopener">Send all to WhatsApp</a>
        <button class="btn btn--ghost btn--sm" id="clearSaved">Clear</button>
      </span>`;

    bar.querySelector("#clearSaved")?.addEventListener("click", () => {
      if (confirm("Remove all saved designs?")) clear();
    });
  }

  document.addEventListener("saved:changed", render);

  return { all, has, toggle, remove, clear, onChange, render, syncButtons };
})();
