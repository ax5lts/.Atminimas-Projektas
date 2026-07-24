function cleanIdentifier(value) {
  return (value || "").trim().replace(/^#/, "");
}

function openMemorial(identifier) {
  window.location.href = "sablonas-viskas.html?slug=" + encodeURIComponent(identifier);
}

var params = new URLSearchParams(window.location.search);
var initialIdentifier = cleanIdentifier(params.get("slug") || params.get("id") || params.get("s"));
var form = document.getElementById("client-access-form");
var input = document.getElementById("client-identifier");
var status = document.getElementById("client-access-status");

if (initialIdentifier) {
  input.value = initialIdentifier;
  status.textContent = "Atidaromas atminimo puslapis...";
  openMemorial(initialIdentifier);
}

form.addEventListener("submit", function (event) {
  event.preventDefault();
  var identifier = cleanIdentifier(input.value);
  if (!identifier) {
    status.textContent = "Įveskite puslapio kodą.";
    return;
  }
  status.textContent = "Atidaromas atminimo puslapis...";
  openMemorial(identifier);
});
