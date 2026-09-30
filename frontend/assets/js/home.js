/* home.js — the homepage is a category showcase.
   Each visible category becomes a major section, each visible subcategory a
   sub-heading, and each design a photo card. Everything is driven by
   /api/home-sections, so the owner controls the page from the admin panel. */

(function () {
  const { esc, escAttr } = window.UI;

  const SECTIONS = "#sections";
  const CONTACT = "#homeContact";

  /* One photo card. Kept deliberately simpler than the catalogue card: on the
     homepage the photo is the point, so the name is a caption under the image
     rather than a heading with body copy. */
  function photoCard(d) {
    const cover = d.cover;
    const img = cover ? cover.thumb || cover.url : "";
    return `
      <article class="shot reveal" data-design="${d.id}">
        <a class="shot__media" href="/design.html?slug=${escAttr(d.slug)}"
           aria-label="View ${escAttr(d.name)}">
          ${img ? `<img src="${escAttr(img)}" alt="${escAttr(d.name)} — ${escAttr(d.subcategoryName || d.categoryName || "")} decoration by AS Decoration"
                   loading="lazy" decoding="async"
                   width="${cover.width || 800}" height="${cover.height || 600}" />`
                : '<span class="shot__empty" aria-hidden="true">No photo yet</span>'}
          <span class="shot__zoom" aria-hidden="true">＋</span>
        </a>
        <div class="shot__caption">
          <h3>${esc(d.name)}</h3>
          <div class="shot__acts">
            <a class="btn btn--gold btn--sm" href="${escAttr(window.WhatsApp.forDesign(d.name))}"
               target="_blank" rel="noopener">Enquire</a>
            <a class="btn btn--ghost btn--sm" href="/design.html?slug=${escAttr(d.slug)}">Details</a>
          </div>
        </div>
      </article>`;
  }

  function section(s) {
    const groups = s.groups
      .map(
        (g) => `
        <section class="group" id="grp-${escAttr(g.slug)}">
          <h3 class="group__title">${esc(g.name)}</h3>
          <div class="shots">${g.designs.map(photoCard).join("")}</div>
        </section>`
      )
      .join("");

    return `
      <section class="cat" id="cat-${escAttr(s.slug)}">
        <header class="cat__head">
          <h2 class="cat__title">${esc(s.name)}</h2>
          ${s.intro ? `<p class="cat__intro">${esc(s.intro)}</p>` : ""}
          <span class="cat__count">${s.total} design${s.total === 1 ? "" : "s"}</span>
        </header>
        ${groups}
      </section>`;
  }

  /* Lightbox across every photo on the page, so arrow keys walk the whole
     showcase rather than stopping at a sub-heading. */
  function bindLightbox() {
    const cards = Array.from(document.querySelectorAll(".shot"));
    const items = cards
      .map((c) => {
        const img = c.querySelector("img");
        return img
          ? {
              src: img.getAttribute("src").replace(/\?w=\d+$/, ""),
              full: img.getAttribute("src"),
              caption: c.querySelector("h3")?.textContent?.trim() || "",
            }
          : null;
      })
      .filter(Boolean);

    cards.forEach((c, i) => {
      if (!c.querySelector("img")) return;
      const open = (e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        window.UI.openLightbox(items, i);
      };
      c.querySelector(".shot__media").addEventListener("click", open);
      c.querySelector(".shot__media").addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") open(e);
      });
    });
  }

  function stickyNav(sections) {
    const bar = document.getElementById("jumpNav");
    if (!bar) return;
    bar.innerHTML = sections
      .map(
        (s) =>
          `<a href="#cat-${escAttr(s.slug)}" data-jump="${escAttr(s.slug)}">${esc(s.name)}</a>`
      )
      .join("");
    bar.hidden = false;
  }

  async function load() {
    const host = document.querySelector(SECTIONS);
    if (!host) return;
    host.innerHTML = window.UI.skeletonCards(8);

    let sections = [];
    try {
      const data = await window.API.get("/home-sections");
      sections = data.sections || [];
    } catch (e) {
      host.innerHTML = window.UI.emptyState(
        "Could not load the designs",
        "Please refresh the page, or message us on WhatsApp and we will send our work directly."
      );
      return;
    }

    if (!sections.length) {
      host.innerHTML = window.UI.emptyState(
        "Designs are being added",
        "Our photo gallery is being updated. Please message us on WhatsApp and we will share our recent work."
      );
      return;
    }

    host.innerHTML = sections.map(section).join("");
    stickyNav(sections);
    bindLightbox();
    window.UI.observeReveals(host);
  }

  document.addEventListener("DOMContentLoaded", load);
})();
