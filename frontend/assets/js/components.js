/* components.js — shared renderers. Every value from the API goes through
   UI.esc / UI.escAttr before it reaches innerHTML. */

window.Cards = (function () {
  const { esc, escAttr } = window.UI;

  function designCard(d) {
    const cover = d.cover;
    const img = cover ? (cover.thumb || cover.url) : "";
    const cat = d.categoryName || d.category || "";
    const sub = d.subcategoryName || d.subcategory || "";
    const meta = [cat, sub].filter(Boolean).join(" · ");

    return `
      <article class="design-card reveal">
        <div class="design-card__media">
          <a href="/design.html?slug=${escAttr(d.slug)}" aria-label="View ${escAttr(d.name)}">
            <img src="${escAttr(img)}" alt="${escAttr(d.name)} — ${escAttr(cat)} decoration by AS Decoration"
                 loading="lazy" decoding="async" width="${cover?.width || 800}" height="${cover?.height || 600}" />
          </a>
          <span class="design-card__tag">${esc(cat)}</span>
          ${cover?.isPlaceholder ? '<span class="badge-ph">Placeholder photo</span>' : ""}
          <button class="design-card__save" data-save-id="${d.id}" type="button" aria-pressed="false" aria-label="Save this design">♡</button>
        </div>
        <div class="design-card__body">
          ${meta ? `<span class="design-card__meta">${esc(meta)}</span>` : ""}
          <h3><a href="/design.html?slug=${escAttr(d.slug)}">${esc(d.name)}</a></h3>
          ${d.description ? `<p class="design-card__desc">${esc(d.description)}</p>` : ""}
          <div class="design-card__foot">
            <a class="btn btn--gold btn--sm" href="${escAttr(window.WhatsApp.forDesign(d.name))}" target="_blank" rel="noopener">Enquire</a>
            <a class="btn btn--ghost btn--sm" href="/design.html?slug=${escAttr(d.slug)}">Details</a>
          </div>
        </div>
      </article>`;
  }

  function bindCards(root = document) {
    root.querySelectorAll("[data-save-id]").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const list = window.Saved.all();
        const existing = list.find((d) => (d.id || d._id) === Number(btn.dataset.saveId));
        if (existing) {
          window.Saved.remove(Number(btn.dataset.saveId));
          window.UI.toast("Removed from saved designs.");
        } else {
          const card = btn.closest(".design-card");
          const name = card?.querySelector("h3")?.textContent?.trim() || "design";
          const cover = card?.querySelector("img")?.getAttribute("src") || null;
          window.Saved.toggle({
            id: Number(btn.dataset.saveId),
            slug: new URL(card?.querySelector("a")?.href || location.href, location.origin).searchParams.get("slug"),
            name,
            cover,
          });
          window.UI.toast(`Saved "${name}".`, "ok");
        }
        window.Saved.render();
      });
    });
    window.Saved.syncButtons();
  }

  function galleryItem(item) {
    return `
      <div class="gallery-item reveal" data-gallery-index="placeholder" tabindex="0" role="button"
           aria-label="View ${escAttr(item.title)}">
        <img src="${escAttr(item.image?.thumb || item.image?.url || "")}" alt="${escAttr(item.title)} — AS Decoration project"
             loading="lazy" decoding="async" width="${item.image?.width || 600}" height="${item.image?.height || 600}" />
        <div class="gallery-item__overlay">
          <strong>${esc(item.title)}</strong>
          <span>${esc([item.categoryName, item.town].filter(Boolean).join(" · "))}</span>
        </div>
      </div>`;
  }

  /** Wire gallery tiles to open the shared lightbox with keyboard support. */
  function bindGallery(root, items) {
    const tiles = root.querySelectorAll("[data-gallery-index]");
    tiles.forEach((tile, i) => {
      tile.dataset.galleryIndex = String(i);
      const open = () => window.UI.openLightbox(
        items.map((it) => ({
          url: it.image?.url || it.image?.thumb,
          title: it.title,
          subtitle: [it.categoryName, it.town].filter(Boolean).join(" · "),
        })),
        i
      );
      tile.addEventListener("click", open);
      tile.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });
  }

  function videoCard(v) {
    return `
      <article class="video-card reveal" data-video="${escAttr(v.youtube_id)}">
        <div class="video-card__frame">
          <img src="https://i.ytimg.com/vi/${escAttr(v.youtube_id)}/hqdefault.jpg" alt="" loading="lazy" decoding="async" />
          ${v.categoryName ? `<span class="video-cat">${esc(v.categoryName)}</span>` : ""}
          <button class="video-card__play" type="button" aria-label="Play video">▶</button>
        </div>
        <div class="video-card__body">
          <h3>${esc(v.title)}</h3>
          ${v.description ? `<p>${esc(v.description)}</p>` : ""}
        </div>
      </article>`;
  }

  /** Click-to-load YouTube: keeps the page fast, loads no YouTube JS until asked. */
  function bindVideos(root) {
    root.querySelectorAll("[data-video]").forEach((card) => {
      const btn = card.querySelector(".video-card__play");
      if (!btn) return;
      btn.addEventListener("click", () => {
        const id = card.dataset.video;
        const frame = card.querySelector(".video-card__frame");
        frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0"
          title="${escAttr(card.querySelector("h3")?.textContent || "Video")}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen loading="lazy"></iframe>`;
      });
    });
  }

  function reviewCard(r) {
    return `
      <article class="review-card reveal">
        <div class="review-card__stars" aria-label="${r.rating} out of 5 stars">${window.UI.stars(r.rating)}</div>
        <p class="review-card__text">“${esc(r.text)}”</p>
        ${r.reply ? `<div class="review-card__reply"><strong>AS Decoration</strong><br />${esc(r.reply)}</div>` : ""}
        <div>
          <div class="review-card__who">${esc(r.name)}${r.isCustomer ? ' <span class="pill" style="font-size:.65rem">Verified</span>' : ""}</div>
          <div class="review-card__meta">${esc([r.eventType, r.location].filter(Boolean).join(" · "))}</div>
        </div>
      </article>`;
  }

  function reviewSummary(s) {
    if (!s || !s.total) return "";
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    (s.distribution || []).forEach((d) => (dist[d.rating] = d.n));

    return `
      <div class="review-summary reveal">
        <div class="review-score">
          <div class="review-score__num">${Number(s.average).toFixed(1)}</div>
          <div class="review-score__stars" aria-hidden="true">${window.UI.stars(Math.round(s.average))}</div>
          <div class="review-score__count">from ${s.total} review${s.total === 1 ? "" : "s"}</div>
        </div>
        <div class="review-bars">
          ${[5, 4, 3, 2, 1]
            .map((n) => {
              const pct = s.total ? Math.round((dist[n] / s.total) * 100) : 0;
              return `<div class="review-bar">
                <span>${n} star</span>
                <span class="review-bar__track"><span class="review-bar__fill" style="width:${pct}%"></span></span>
                <span>${dist[n]}</span>
              </div>`;
            })
            .join("")}
        </div>
      </div>`;
  }

  function eventCard(ev) {
    const days = Number(ev.days_left);
    const countdown =
      days > 0
        ? `<span class="event-card__count">${days} day${days === 1 ? "" : "s"} left</span>`
        : `<span class="event-card__count">Running now</span>`;

    return `
      <article class="event-card reveal">
        ${ev.media_id ? `<img src="/api/media/${Number(ev.media_id)}?w=400" alt="${escAttr(ev.title)}" loading="lazy" />` : ""}
        <div>
          <h3>${esc(ev.title)}</h3>
          ${ev.subtitle ? `<p>${esc(ev.subtitle)}</p>` : ""}
          ${ev.description ? `<p>${esc(ev.description)}</p>` : ""}
          ${countdown}
        </div>
      </article>`;
  }

  return { designCard, bindCards, galleryItem, bindGallery, videoCard, bindVideos, reviewCard, reviewSummary, eventCard };
})();
