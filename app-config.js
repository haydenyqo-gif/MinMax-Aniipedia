(() => {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const segment = decodeURIComponent(parts[parts.length - 1] || "");
  let value = 2166136261;
  for (let index = 0; index < segment.length; index += 1) {
    value ^= segment.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  const view = (value >>> 0) === 2619316250;

  window.ANIIPEDIA_CONFIG = Object.freeze({
    shareApiUrl: "https://aniipedia-map-shares.minmax-aniipedia.workers.dev",
    itemDataUrl: view
      ? "./data/catalog-index-v2.json?v=20260725-catalog-v003"
      : "./data/itemlog_data.json?v=20260725-catalog-v003",
    view: view ? 1 : 0,
  });
})();
