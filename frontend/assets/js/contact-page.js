/* contact-page.js — enquiry form with inline validation and location pre-fill. */

(function () {
  const { escAttr } = window.UI;
  const form = document.getElementById("enquiryForm");
  if (!form) return;

  const btn = form.querySelector("button[type=submit]");
  const areaBox = document.getElementById("locSummary");
  const areaInput = document.getElementById("enqArea");

  function setError(name, message) {
    const slot = form.querySelector(`[data-err="${name}"]`);
    const input = form.querySelector(`[name="${name}"]`);
    if (slot) slot.textContent = message || "";
    if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function validate() {
    let ok = true;
    const name = form.name.value.trim();
    const phone = form.phone.value.replace(/\D/g, "");
    const email = form.email.value.trim();

    setError("name", "");
    setError("phone", "");
    setError("email", "");

    if (name.length < 2) { setError("name", "Please enter your name."); ok = false; }
    if (!/^[6-9]\d{9}$/.test(phone)) { setError("phone", "Enter a valid 10-digit mobile number."); ok = false; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("email", "Check the email address."); ok = false; }

    return ok;
  }

  function syncArea() {
    const loc = window.Location.get();
    if (loc?.town || loc?.district) {
      areaBox.hidden = false;
      areaInput.value = [loc.town, loc.district].filter(Boolean).join(", ");
    } else {
      areaBox.hidden = true;
    }
  }

  document.getElementById("changeArea")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.Location.open();
  });
  document.addEventListener("location:changed", syncArea);
  syncArea();

  // Instant feedback once the field has been touched.
  ["name", "phone", "email"].forEach((n) => {
    form.querySelector(`[name="${n}"]`).addEventListener("blur", validate);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) {
      window.UI.toast("Please fix the highlighted fields.", "err");
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    const loc = window.Location.get() || {};
    btn.disabled = true;
    btn.textContent = "Sending…";

    try {
      await window.API.post("/enquiries", {
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email.value.trim(),
        eventType: form.eventType.value,
        eventDate: form.eventDate.value,
        guests: form.guests.value,
        requirement: form.requirement.value.trim(),
        district: loc.district || "",
        town: loc.town || "",
        source: "contact-page",
        utmSource: new URLSearchParams(location.search).get("utm_source") || "",
        utmMedium: new URLSearchParams(location.search).get("utm_medium") || "",
        referrer: document.referrer,
      });

      form.reset();
      ["name", "phone", "email"].forEach(setError);
      window.UI.toast("Thank you! We've received your enquiry and will call you shortly.", "ok");
    } catch (err) {
      window.UI.toast(err.message, "err");
    } finally {
      btn.disabled = false;
      btn.textContent = "Send enquiry";
    }
  });

  const wa = document.getElementById("waBig");
  if (wa) {
    wa.href = window.WhatsApp.default();
    document.addEventListener("location:changed", () => (wa.href = window.WhatsApp.default()));
  }

  window.API.get("/social")
    .then(({ links }) => {
      const host = document.getElementById("contactSocial");
      if (host && links.length) {
        host.innerHTML = links
          .map((l) => `<a class="chip" href="${escAttr(l.url)}" target="_blank" rel="noopener">${window.UI.esc(l.label || l.platform)}</a>`)
          .join("");
      }
    })
    .catch(() => {});
})();