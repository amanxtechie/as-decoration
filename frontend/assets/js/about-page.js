/* about-page.js — service-area cards and live stats. */

(async function () {
  const { esc, escAttr } = window.UI;

  // Two real photos, pulled live. Hardcoded media ids would 404 as soon as the
  // owner replaces a photo in the admin.
  const host = document.getElementById("aboutPhotos");
  if (host) {
    try {
      const { designs } = await window.API.get("/designs?limit=2&sort=newest");
      host.innerHTML = designs
        .filter((d) => d.cover)
        .map(
          (d, i) => `<img src="${escAttr(d.cover.thumb || d.cover.url)}"
            alt="${escAttr(d.name)} — decoration by AS Decoration" loading="lazy"
            style="border-radius:20px;aspect-ratio:${i === 0 ? "3/4" : "4/3"};object-fit:cover;width:100%" />`
        )
        .join("");
    } catch {
      host.innerHTML = "";
    }
  }

  try {
    const { districts } = await window.API.get("/locations");
    document.getElementById("areaGrid").innerHTML = districts
      .map(
        (d) => `<div class="design-card reveal">
          <div class="design-card__body">
            <h3>${esc(d.name)}</h3>
            <p style="color:var(--muted);font-size:.88rem">${esc(d.towns.join(" · "))}</p>
          </div>
        </div>`
      )
      .join("");
  } catch {
    document.getElementById("areaGrid").innerHTML = "";
  }

  Promise.all([
    window.API.get("/gallery").then(({ items }) => items.length).catch(() => 0),
    window.API.get("/reviews").then(({ summary }) => summary).catch(() => null),
  ]).then(([projects, summary]) => {
    if (projects) document.getElementById("statProjects").textContent = `${projects}+`;
    if (summary?.total) {
      document.getElementById("statRating").textContent = `${Number(summary.average).toFixed(1)}★`;
    }
  });

  window.UI.observeReveals();
})();