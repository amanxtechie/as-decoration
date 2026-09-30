/* whatsapp.js — contextual click-to-chat. Every message knows which design the
   visitor is looking at and which town they are in. */

(function () {
  const NUMBER = window.AS_APP.whatsappNumber;
  const enc = encodeURIComponent;

  function area() {
    return window.Location ? window.Location.areaText() : "your area";
  }

  function link(message) {
    return `https://wa.me/${NUMBER}?text=${enc(message)}`;
  }

  function forDesign(designName, extra) {
    const base = `Hello AS Decoration, I am interested in the "${designName}" design for my event in ${area()}.`;
    return link(extra ? `${base} ${extra}` : `${base} Could you share more details?`);
  }

  function forCategory(categoryName) {
    return link(
      `Hello AS Decoration, I am looking for ${categoryName} decoration in ${area()}. Can you share your packages?`
    );
  }

  function forSaved(list) {
    if (!list.length) return link(`Hello AS Decoration, I am interested in decoration in ${area()}.`);
    const names = list.map((d) => `• ${d.name}`).join("\n");
    return link(
      `Hello AS Decoration, I have shortlisted these designs from your website:\n\n${names}\n\nMy event is in ${area()}. Please let me know details and pricing.`
    );
  }

  function defaultLink() {
    return link(
      `Hello AS Decoration, I would like to discuss decoration for my event in ${area()}.`
    );
  }

  function setHref(id, href) {
    const el = document.getElementById(id);
    if (el) el.href = href;
  }

  function wire() {
    setHref("waFloat", defaultLink());
    setHref("mbWa", defaultLink());
    document.addEventListener("location:changed", () => {
      setHref("waFloat", defaultLink());
      setHref("mbWa", defaultLink());
    });
  }

  window.WhatsApp = { link, forDesign, forCategory, forSaved, default: defaultLink, wire, number: NUMBER };
})();
