(function () {
  var details = window.ATMINIMAS_BUSINESS || {};
  document.querySelectorAll("[data-business]").forEach(function (element) {
    var key = element.dataset.business;
    var value = String(details[key] || "").trim();
    element.textContent = value || "NEPATEIKTA";
    element.classList.toggle("is-missing", !value);
    if (element.tagName === "A" && key === "email") {
      element.href = value ? "mailto:" + value : "#";
    }
    if (element.tagName === "A" && key === "phone") {
      element.href = value ? "tel:" + value.replace(/\s+/g, "") : "#";
    }
  });

  var required = ["legalName", "activityForm", "registrationCode", "registry", "address", "email"];
  var complete = required.every(function (key) { return String(details[key] || "").trim(); });
  document.querySelectorAll("[data-business-warning]").forEach(function (element) {
    element.hidden = complete;
  });
})();
