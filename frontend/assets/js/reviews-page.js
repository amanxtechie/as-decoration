/* reviews-page.js — approved reviews, review submission, customer photo upload. */

(function () {
  const list = document.getElementById("list");
  const summary = document.getElementById("summary");

  async function load() {
    try {
      const { reviews, summary: s } = await window.API.get("/reviews");
      summary.innerHTML = window.Cards.reviewSummary(s);
      list.innerHTML = reviews.length
        ? reviews.map(window.Cards.reviewCard).join("")
        : window.UI.emptyState("No reviews yet", "Be the first to share your experience.");
      window.UI.observeReveals(list);
    } catch (err) {
      list.innerHTML = window.UI.emptyState("Reviews unavailable", err.message);
    }
  }

  /* ------------------------------------------------------------- review */
  const reviewForm = document.getElementById("reviewForm");
  reviewForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = reviewForm.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Submitting…";
    try {
      const res = await window.API.post("/reviews", {
        name: reviewForm.name.value.trim(),
        location: reviewForm.location.value.trim(),
        eventType: reviewForm.eventType.value,
        rating: Number(reviewForm.rating.value),
        text: reviewForm.text.value.trim(),
        website: reviewForm.website.value,
      });
      reviewForm.reset();
      window.UI.toast(res.message || "Thank you! Your review was submitted for approval.", "ok");
    } catch (err) {
      window.UI.toast(err.message, "err");
    } finally {
      btn.disabled = false;
      btn.textContent = "Submit review";
    }
  });

  /* ------------------------------------------------------------- upload */
  const uploadForm = document.getElementById("uploadForm");
  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = uploadForm.image.files[0];
    if (!file) return window.UI.toast("Please choose a photo.", "err");

    if (file.size > 8 * 1024 * 1024) {
      return window.UI.toast("That photo is over 8 MB. Please pick a smaller one.", "err");
    }

    const btn = uploadForm.querySelector("button[type=submit]");
    const fd = new FormData();
    fd.append("image", file);
    fd.append("name", uploadForm.name.value.trim());
    fd.append("eventType", uploadForm.eventType.value.trim());
    fd.append("website", uploadForm.website.value);
    const loc = window.Location.get();
    if (loc?.town) fd.append("town", loc.town);

    btn.disabled = true;
    btn.textContent = "Uploading…";
    try {
      const res = await window.API.postForm("/uploads", fd);
      uploadForm.reset();
      window.UI.toast(res.message || "Thanks! Your photo was submitted.", "ok");
    } catch (err) {
      window.UI.toast(err.message, "err");
    } finally {
      btn.disabled = false;
      btn.textContent = "Submit photo";
    }
  });

  load();
})();