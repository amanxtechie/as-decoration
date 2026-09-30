/* api.js — thin fetch wrapper around the REST API */
window.API = (function () {
  const base = window.AS_APP.apiBase;

  function message(data, fallback) {
    return (data && (data.message || data.error)) || fallback;
  }

  async function request(path, options = {}) {
    let res;
    try {
      res = await fetch(base + path, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
    } catch {
      throw new Error("Network problem. Please check your connection.");
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = new Error(message(data, `Request failed (${res.status})`));
      err.status = res.status;
      err.details = data.details;
      throw err;
    }
    return data;
  }

  const qs = (params = {}) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") sp.set(k, v);
    });
    const s = sp.toString();
    return s ? `?${s}` : "";
  };

  return {
    qs,
    get: (path, params) => request(path + qs(params)),
    post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
    patch: (path, body) => request(path, { method: "PATCH", body: JSON.stringify(body) }),
    del: (path) => request(path, { method: "DELETE" }),
    postForm: (path, formData) =>
      request(path, { method: "POST", body: formData, headers: {} }),
  };
})();
