(function () {
  var colors = { gold: "Aukso spalvos plienas", silver: "Sidabrinis plienas", black: "Juodas plienas" };
  var patterns = { plain: "Tik QR kodas", tree: "Gyvybės medis", heart: "Širdis ir žvakė", wings: "Angelo sparnai" };
  var key = "atminimas.plaque-design.v1";
  function normalize(value) {
    value = value || {};
    return {
      color: Object.prototype.hasOwnProperty.call(colors, value.color) ? value.color : "gold",
      pattern: value.pattern === "star" ? "plain" : (Object.prototype.hasOwnProperty.call(patterns, value.pattern) ? value.pattern : "plain")
    };
  }
  function read() {
    var saved = {};
    try { saved = JSON.parse(sessionStorage.getItem(key) || "{}") || {}; } catch (_error) {}
    var params = new URLSearchParams(window.location.search);
    return normalize({ color: params.get("color") || saved.color, pattern: params.get("pattern") || saved.pattern });
  }
  function save(value) {
    try { sessionStorage.setItem(key, JSON.stringify(normalize(value))); } catch (_error) {}
  }
  function label(value) {
    var design = normalize(value);
    return colors[design.color] + " · " + (value && value.pattern === "star" ? "Žvaigždė ir šakelė (ankstesnis variantas)" : patterns[design.pattern]);
  }
  function query(value) { return new URLSearchParams(normalize(value)).toString(); }
  function render(element, value) {
    if (!element) return;
    var design = normalize(value);
    element.dataset.color = design.color;
    element.dataset.pattern = design.pattern;
    element.setAttribute("aria-label", label(design));
  }
  window.AtminimasPlaqueDesign = { colors: colors, patterns: patterns, normalize: normalize, read: read, save: save, label: label, query: query, render: render };
})();
