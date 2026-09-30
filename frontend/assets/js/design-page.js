/* design-page.js — single design view: gallery, highlights, contextual WhatsApp,
   enquiry pre-filled with this design, and related designs. */

(async function () {
  const { esc, escAttr } = window.UI;
  const slug = new URLSearchParams(location.search).get("slug");
  const root = document.getElementById("detail");

  if (!slug) {
    location.replace("/catalogue.html");
    return;
  }

  function render(d) {
    document.title = `${d.name} — ${d.categoryName || "Decoration"} | AS Decoration`;

    const meta = [d.categoryName, d.subcategoryName, d.town].filter(Boolean);
    const images = d.images?.length ? d.images : d.cover ? [d.cover] : [];

    const thumbs = images.length > 1
      ? `<div class="detail-gallery__thumbs">
          ${images
            .map(
              (img, i) =>
                `<button class="${i === 0 ? "is-active" : ""}" data-thumb="${i}" aria-label="Show photo ${i + 1}">
                   <img src="${escAttr(img.thumb || img.url)}" alt="" loading="lazy" />
                 </button>`
            )
            .join("")}
        </div>`
      : "";

    root.innerHTML = `
      <section class="section" style="padding-top:calc(var(--header-h) + 3rem)">
        <div class="container">
          <p class="breadcrumbs" style="color:var(--muted)">
            <a href="/index.html">Home</a> /
            <a href="/catalogue.html">Catalogue</a>
            ${d.categorySlug ? ` / <a href="/catalogue.html?category=${escAttr(d.categorySlug)}">${esc(d.categoryName)}</a>` : ""} /
            ${esc(d.name)}
          </p>

          <div class="detail-layout">
            <div class="detail-gallery">
              <div class="detail-gallery__main" id="mainImage" role="button" tabindex="0" aria-label="Enlarge photo">
                <img id="mainImg" src="${escAttr(images[0]?.url || "")}" alt="${escAttr(d.name)} — ${escAttr(meta.join(", "))} decoration by AS Decoration" />
                ${images[0]?.isPlaceholder ? '<span class="badge-ph">Placeholder photo</span>' : ""}
              </div>
              ${thumbs}
            </div>

            <aside class="detail-aside">
              <div class="detail-meta">
                ${meta.map((m) => `<span class="pill">${esc(m)}</span>`).join("")}
              </div>
              <h1>${esc(d.name)}</h1>
              ${d.description ? `<p style="color:var(--muted);margin-top:.75rem">${esc(d.description)}</p>` : ""}

              ${d.highlights?.length
                ? `<ul class="detail-list">
                     ${d.highlights.map((h) => `<li><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8L12 2Z"/></svg><span>${esc(h)}</span></li>`).join("")}
                   </ul>`
                : ""}

              <p style="font-size:.88rem;color:var(--muted-light);margin-top:1rem">
                Pricing is tailored to your venue, guest count and date — ask us and we'll suggest the best fit.
              </p>

              <div class="detail-cta">
                <a class="btn btn--gold" id="waDesign" href="#" target="_blank" rel="noopener">Enquire about this design</a>
                <a class="btn btn--ghost" id="enqDesign" href="#enquiry">Send a detailed enquiry</a>
                <button class="btn btn--ghost" id="saveDesign" data-save-id="${d.id}">♡ Save to shortlist</button>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section class="section section--alt" id="enquiry">
        <div class="container" style="max-width:720px">
          <div class="section-head">
            <span class="eyebrow">Next step</span>
            <h2>Tell us about your event</h2>
            <p>We'll come back with ideas and a quote for "${esc(d.name)}", usually the same day.</p>
          </div>
          <form class="form" id="designEnquiryForm">
            <div class="form-row">
              <div class="field"><label for="dName">Your name <span class="req">*</span></label><input id="dName" name="name" required /></div>
              <div class="field"><label for="dPhone">Phone <span class="req">*</span></label><input id="dPhone" name="phone" type="tel" inputmode="numeric" required placeholder="10-digit mobile" /></div>
            </div>
            <div class="form-row">
              <div class="field"><label for="dEmail">Email (optional)</label><input id="dEmail" name="email" type="email" /></div>
              <div class="field"><label for="dDate">Event date</label><input id="dDate" name="eventDate" type="date" /></div>
            </div>
            <div class="field">
              <label for="dReq">What do you have in mind?</label>
              <textarea id="dReq" name="requirement" rows="4" placeholder="Venue, guest count, colours you like, anything you're unsure about…"></textarea>
            </div>
            <div class="hp-field" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off" /></label></div>
            <button type="submit" class="btn btn--gold">Send enquiry</button>
          </form>
        </div>
      </section>

      ${d.related?.length
        ? `<section class="section">
            <div class="container">
              <div class="section-head"><span class="eyebrow">You may also like</span><h2>Related designs</h2></div>
              <div class="grid grid--4" id="relatedGrid">${d.related.map(window.Cards.designCard).join("")}</div>
            </div>
          </section>`
        : ""}`;

    /* ---- behaviour ---- */
    const mainImg = document.getElementById("mainImg");
    const mainBox = document.getElementById("mainImage");

    document.querySelectorAll("[data-thumb]").forEach((b) =>
      b.addEventListener("click", () => {
        const img = images[Number(b.dataset.thumb)];
        mainImg.src = img.url;
        document.querySelectorAll("[data-thumb]").forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
      })
    );

    const zoom = () =>
      window.UI.openLightbox(
        images.map((img, i) => ({ url: img.url, title: d.name, subtitle: meta.join(" · ") })),
        Math.max(0, images.findIndex((i) => i.url === mainImg.src))
      );
    mainBox.addEventListener("click", zoom);
    mainBox.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); zoom(); }
    });

    document.getElementById("waDesign").href = window.WhatsApp.forDesign(d.name);
    document.addEventListener("location:changed", () => {
      document.getElementById("waDesign").href = window.WhatsApp.forDesign(d.name);
    });

    const saveBtn = document.getElementById("saveDesign");
    const syncSave = () => {
      const on = window.Saved.has(d.id);
      saveBtn.classList.toggle("is-saved", on);
      saveBtn.textContent = on ? "♥ Saved to shortlist" : "♡ Save to shortlist";
    };
    saveBtn.addEventListener("click", () => {
      const wasSaved = window.Saved.has(d.id);
      window.Saved.toggle({ id: d.id, slug: d.slug, name: d.name, categoryName: d.categoryName, cover: d.cover });
      syncSave();
      window.UI.toast(wasSaved ? "Removed from shortlist." : `Saved "${d.name}".`, "ok");
    });
    window.Saved.onChange(syncSave);
    syncSave();

    const related = document.getElementById("relatedGrid");
    if (related) window.Cards.bindCards(related);

    /* ---- enquiry form ---- */
    const form = document.getElementById("designEnquiryForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      const loc = window.Location.get() || {};
      btn.disabled = true;
      btn.textContent = "Sending…";
      try {
        await window.API.post("/enquiries", {
          name: form.name.value.trim(),
          phone: form.phone.value.trim(),
          email: form.email.value.trim(),
          eventDate: form.eventDate.value,
          requirement: form.requirement.value.trim(),
          district: loc.district || "",
          town: loc.town || "",
          designId: d.id,
          designName: d.name,
          source: "design-page",
          referrer: document.referrer,
        });
        form.reset();
        window.UI.toast("Thank you! We'll call you shortly.", "ok");
      } catch (err) {
        window.UI.toast(err.message, "err");
      } finally {
        btn.disabled = false;
        btn.textContent = "Send enquiry";
      }
    });

    // Pre-fill the district/town hint from the saved location.
    const loc = window.Location.get();
    if (loc?.town) {
      form.requirement.placeholder = `Venue in ${loc.town} — tell us about guest count and the look you want…`;
    }

    window.UI.observeReveals(root);
  }

  function notFound() {
    document.title = "Design not found | AS Decoration";
    root.innerHTML = `
      <section class="section" style="padding-top:calc(var(--header-h) + 5rem);text-align:center">
        <div class="container">
          <h1>We couldn't find that design</h1>
          <p style="color:var(--muted);margin:1rem 0 2rem">It may have been replaced. Browse the catalogue to see what we have today.</p>
          <a href="/catalogue.html" class="btn btn--gold">Back to the catalogue</a>
        </div>
      </section>`;
  }

  try {
    const { design } = await window.API.get(`/designs/${encodeURIComponent(slug)}`);
    render(design);
  } catch {
    notFound();
  }
})();
