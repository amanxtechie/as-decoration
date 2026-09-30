/* location.js — district/town selector, persisted in localStorage and used to
   personalise WhatsApp messages and pre-fill the enquiry form. */

window.Location = (function () {
  const KEY = "as_location";
  const SEEN = "as_location_asked";
  let districts = [];
  let value = load();

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || null;
    } catch {
      return null;
    }
  }

  function save(v) {
    value = v;
    try {
      v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY);
    } catch { /* storage full or blocked — location is a nicety, not required */ }
    document.dispatchEvent(new CustomEvent("location:changed", { detail: v }));
  }

  function label() {
    if (!value) return "Select Area";
    return value.town || value.district || "Select Area";
  }

  function get() {
    return value;
  }

  function areaText() {
    if (!value) return "your area";
    return value.town && value.town !== value.district
      ? `${value.town}, ${value.district}`
      : value.district;
  }

  function syncPill() {
    const el = document.getElementById("locLabel");
    if (el) el.textContent = label();
  }

  async function fetchDistricts() {
    try {
      const data = await window.API.get("/locations");
      districts = data.districts || [];
    } catch {
      districts = (window.AS_APP.districts || []).map((name) => ({
        id: name.toLowerCase(), name, towns: [],
      }));
    }
    return districts;
  }

  function fillSelects(districtId) {
    const dSel = document.getElementById("locDistrict");
    const tSel = document.getElementById("locTown");
    if (!dSel || !tSel) return;

    dSel.innerHTML = '<option value="">Choose district…</option>' +
      districts
        .map((x) => `<option value="${window.UI.escAttr(x.id)}"${x.id === districtId ? " selected" : ""}>${window.UI.esc(x.name)}</option>`)
        .join("");

    const d = districts.find((x) => x.id === districtId);
    if (!d) {
      tSel.innerHTML = '<option value="">Choose district first…</option>';
      tSel.disabled = true;
      return;
    }
    tSel.disabled = false;
    tSel.innerHTML = '<option value="">Choose town…</option>' +
      d.towns.map((t) => `<option value="${window.UI.escAttr(t)}">${window.UI.esc(t)}</option>`).join("");
  }

  function open() {
    const modal = document.getElementById("locationModal");
    if (!modal) return;
    fillSelects(value?.district);
    if (value?.town) {
      const tSel = document.getElementById("locTown");
      if (tSel) tSel.value = value.town;
    }
    window.UI.openModal(modal);
  }

  async function init() {
    await fetchDistricts();
    syncPill();

    const pill = document.getElementById("locPill");
    if (pill) pill.addEventListener("click", open);

    const form = document.getElementById("locationForm");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const district = document.getElementById("locDistrict").value;
        const town = document.getElementById("locTown").value;
        if (!district) return window.UI.toast("Please choose a district.", "err");
        save({ district, town: town || districts.find((d) => d.id === district)?.name || "" });
        window.UI.closeModal(document.getElementById("locationModal"));
        window.UI.toast(`Showing designs for ${areaText()}.`, "ok");
      });

      const dSel = document.getElementById("locDistrict");
      dSel.addEventListener("change", () => fillSelects(dSel.value));

      document.getElementById("locSkip")?.addEventListener("click", () => {
        window.UI.closeModal(document.getElementById("locationModal"));
      });
    }

    document.addEventListener("location:changed", syncPill);

    // First visit: ask once, but never block the page.
    let asked = false;
    try { asked = localStorage.getItem(SEEN) === "1"; } catch { /* ignore */ }
    if (!value && !asked) {
      try { localStorage.setItem(SEEN, "1"); } catch { /* ignore */ }
      setTimeout(() => { if (!load()) open(); }, 1400);
    }
  }

  return { init, get, save, open, label, areaText, syncPill };
})();
