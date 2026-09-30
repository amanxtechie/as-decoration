/* work-page.js — filterable gallery with lightbox, plus video walkthroughs. */

(async function () {
  const { escAttr } = window.UI;
  const grid = document.getElementById("grid");
  const categorySel = document.getElementById("fCategory");
  const townSel = document.getElementById("fTown");
  const count = document.getElementById("count");
  let items = [];

  function render() {
    count.textContent = `${items.length} project${items.length === 1 ? "" : "s"}`;

    grid.innerHTML = items.length
      ? items.map(window.Cards.galleryItem).join("")
      : window.UI.emptyState(
          "No projects here yet",
          "Try a different filter — or get in touch and we'll show you our full portfolio."
        );

    window.Cards.bindGallery(grid, items);
  }

  async function load() {
    grid.innerHTML = '<div class="skeleton" style="aspect-ratio:1"></div>'.repeat(6);
    try {
      const data = await window.API.get("/gallery", {
        category: categorySel.value,
        town: townSel.value,
      });
      items = data.items || [];

      // Town options come from what actually exists, not a hardcoded list.
      const towns = [...new Set(items.map((i) => i.town).filter(Boolean))].sort();
      const current = townSel.value;
      townSel.innerHTML =
        '<option value="">All towns</option>' +
        towns.map((t) => `<option value="${escAttr(t)}"${t === current ? " selected" : ""}>${escAttr(t)}</option>`).join("");

      render();
    } catch (err) {
      grid.innerHTML = window.UI.emptyState("Gallery unavailable", err.message);
    }
  }

  window.API.get("/categories")
    .then(({ categories }) => {
      categorySel.innerHTML =
        '<option value="">All occasions</option>' +
        categories.map((c) => `<option value="${escAttr(c.slug)}">${escAttr(c.name)}</option>`).join("");
    })
    .catch(() => {});

  categorySel.addEventListener("change", load);
  townSel.addEventListener("change", load);

  window.API.get("/videos")
    .then(({ videos }) => {
      if (!videos.length) return;
      document.getElementById("videoGrid").innerHTML = videos.map(window.Cards.videoCard).join("");
      window.Cards.bindVideos(document.getElementById("videoGrid"));
      document.getElementById("videos").hidden = false;
    })
    .catch(() => {});

  await load();
})();
