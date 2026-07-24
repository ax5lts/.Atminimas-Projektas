(function (global) {
  "use strict";

  var errorCounter = 0;

  function setStatus(element, message, state) {
    if (!element) return;
    element.textContent = message || "";
    if (state) element.dataset.state = state;
    else delete element.dataset.state;
  }

  function setBusy(form, busy, label) {
    if (!form) return;
    var button = form.querySelector("button[type='submit']");
    form.setAttribute("aria-busy", String(Boolean(busy)));
    if (!button) return;

    if (!button.dataset.idleText) button.dataset.idleText = button.textContent.trim();
    button.disabled = Boolean(busy);
    button.classList.toggle("is-loading", Boolean(busy));

    if (busy) {
      button.setAttribute("aria-busy", "true");
      if (label) button.textContent = label;
    } else {
      button.removeAttribute("aria-busy");
      button.textContent = button.dataset.idleText;
    }
  }

  function statusFor(form) {
    return form.querySelector(".form-status") ||
      (form.closest(".client-access") && form.closest(".client-access").querySelector(".form-status"));
  }

  function fieldName(field) {
    if (field.type === "email") return "el. paštą";
    if (field.name === "name") return "vardą";
    if (field.name === "password_confirm") return "pakartotą slaptažodį";
    if (field.name === "password" || field.type === "password") return "slaptažodį";
    return "šį lauką";
  }

  function validationMessage(field) {
    if (field.validity.valueMissing) {
      if (field.type === "checkbox") return "Pažymėkite šį patvirtinimą.";
      return "Įrašykite " + fieldName(field) + ".";
    }
    if (field.validity.typeMismatch && field.type === "email") {
      return "Patikrinkite el. pašto adresą, pvz. vardas@gmail.com.";
    }
    if (field.validity.tooShort) {
      return "Įrašykite bent " + field.minLength + " simbolių.";
    }
    if (field.validity.patternMismatch) return "Patikrinkite įvestą reikšmę.";
    if (field.validity.customError) return field.validationMessage;
    return "Patikrinkite " + fieldName(field) + ".";
  }

  function fieldContainer(field) {
    return field.closest("label") || field.closest(".form-field") || field.parentElement;
  }

  function errorAnchor(field) {
    if (field.type === "checkbox" || field.type === "radio") {
      return field.closest("label") || field;
    }
    return field.closest(".password-control") || field;
  }

  function errorElement(field) {
    var existingId = field.dataset.validationErrorId;
    if (existingId) return document.getElementById(existingId);

    errorCounter += 1;
    var error = document.createElement("span");
    error.className = "form-field-error";
    error.id = (field.form && field.form.id ? field.form.id : "form") +
      "-" + (field.name || "field") + "-error-" + errorCounter;
    error.hidden = true;
    errorAnchor(field).insertAdjacentElement("afterend", error);
    field.dataset.validationErrorId = error.id;

    var describedBy = (field.getAttribute("aria-describedby") || "").trim().split(/\s+/).filter(Boolean);
    if (describedBy.indexOf(error.id) === -1) describedBy.push(error.id);
    field.setAttribute("aria-describedby", describedBy.join(" "));
    return error;
  }

  function clearEmailSuggestion(field) {
    if (!field || !field.dataset.validationSuggestionId) return;
    var suggestion = document.getElementById(field.dataset.validationSuggestionId);
    if (suggestion) {
      suggestion.textContent = "";
      suggestion.hidden = true;
    }
  }

  function hasVisibleEmailSuggestion(field) {
    var suggestion = field && field.dataset.validationSuggestionId &&
      document.getElementById(field.dataset.validationSuggestionId);
    return Boolean(suggestion && !suggestion.hidden);
  }

  function clearFieldSuccess(field) {
    if (!field) return;
    var container = fieldContainer(field);
    if (container) container.classList.remove("has-success");
  }

  function showFieldSuccess(field) {
    if (!field || field.type === "checkbox" || field.type === "radio" || !String(field.value || "").trim()) return;
    var container = fieldContainer(field);
    if (container) container.classList.add("has-success");
  }

  function suggestedEmail(value) {
    var parts = String(value || "").trim().split("@");
    if (parts.length !== 2 || !parts[0]) return "";
    var domain = parts[1].toLowerCase();
    var commonTypos = {
      "gamil.com": "gmail.com",
      "gmial.com": "gmail.com",
      "gmai.com": "gmail.com",
      "gmail.co": "gmail.com",
      "gmail.lt": "gmail.com",
      "hotnail.com": "hotmail.com",
      "outlok.com": "outlook.com"
    };
    return commonTypos[domain] ? parts[0] + "@" + commonTypos[domain] : "";
  }

  function showEmailSuggestion(field) {
    if (field.type !== "email") return;
    var suggestionValue = suggestedEmail(field.value);
    if (field.dataset.ignoreEmailSuggestion === field.value.trim().toLowerCase()) return;
    if (!suggestionValue) return;

    var suggestion = field.dataset.validationSuggestionId &&
      document.getElementById(field.dataset.validationSuggestionId);
    if (!suggestion) {
      errorCounter += 1;
      suggestion = document.createElement("span");
      suggestion.className = "form-field-suggestion";
      suggestion.id = (field.form && field.form.id ? field.form.id : "form") +
        "-email-suggestion-" + errorCounter;
      suggestion.setAttribute("role", "status");
      var anchor = field.dataset.validationErrorId &&
        document.getElementById(field.dataset.validationErrorId);
      (anchor || errorAnchor(field)).insertAdjacentElement("afterend", suggestion);
      field.dataset.validationSuggestionId = suggestion.id;
    }

    suggestion.textContent = "Ar turėjote omenyje " + suggestionValue + "? ";
    var fixButton = document.createElement("button");
    fixButton.type = "button";
    fixButton.textContent = "Pataisyti";
    fixButton.addEventListener("click", function () {
      field.value = suggestionValue;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.focus();
    });
    suggestion.appendChild(fixButton);

    var keepButton = document.createElement("button");
    keepButton.type = "button";
    keepButton.textContent = "Palikti kaip įvesta";
    keepButton.addEventListener("click", function () {
      field.dataset.ignoreEmailSuggestion = field.value.trim().toLowerCase();
      clearEmailSuggestion(field);
      showFieldSuccess(field);
      setStatus(statusFor(field.form), "", "");
      field.focus();
    });
    suggestion.appendChild(document.createTextNode(" "));
    suggestion.appendChild(keepButton);
    suggestion.hidden = false;
  }

  function clearFieldError(field) {
    if (!field || !field.matches("input, select, textarea")) return;
    if (field.name === "password" || field.name === "password_confirm" || field.type === "email") {
      field.setCustomValidity("");
    }
    clearEmailSuggestion(field);
    clearFieldSuccess(field);
    field.removeAttribute("aria-invalid");
    var container = fieldContainer(field);
    if (container) container.classList.remove("has-error");
    var error = field.dataset.validationErrorId && document.getElementById(field.dataset.validationErrorId);
    if (error) {
      error.textContent = "";
      error.hidden = true;
    }
  }

  function updateCustomValidity(field) {
    if (field.type === "email") {
      field.setCustomValidity("");
      var value = field.value.trim();
      var emailParts = value.split("@");
      var domainParts = emailParts.length === 2 ? emailParts[1].split(".") : [];
      var topLevelDomain = domainParts[domainParts.length - 1] || "";
      var completeEmail = emailParts.length === 2 &&
        Boolean(emailParts[0]) &&
        domainParts.length >= 2 &&
        domainParts.every(Boolean) &&
        /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(topLevelDomain);
      if (value && !completeEmail) {
        field.setCustomValidity("Patikrinkite el. pašto adresą, pvz. vardas@gmail.com.");
      }
    }

    if (field.name === "password" || field.name === "password_confirm") {
      field.setCustomValidity("");
      if (field.value && field.minLength > 0 && field.value.length < field.minLength) {
        field.setCustomValidity("Įrašykite bent " + field.minLength + " simbolių.");
        return;
      }

      if (field.name === "password_confirm") {
        var password = field.form && field.form.querySelector("[name='password']");
        if (password && field.value && field.value !== password.value) {
          field.setCustomValidity("Slaptažodžiai nesutampa.");
        }
      }
    }
  }

  function validateField(field) {
    if (!field || !field.willValidate) return true;
    clearEmailSuggestion(field);
    updateCustomValidity(field);
    if (field.checkValidity()) {
      clearFieldError(field);
      showEmailSuggestion(field);
      if (!hasVisibleEmailSuggestion(field)) showFieldSuccess(field);
      delete field.dataset.validateLive;
      return true;
    }

    var container = fieldContainer(field);
    var error = errorElement(field);
    clearFieldSuccess(field);
    field.dataset.validateLive = "true";
    field.setAttribute("aria-invalid", "true");
    if (container) container.classList.add("has-error");
    error.textContent = validationMessage(field);
    error.hidden = false;
    return false;
  }

  function validationFields(form) {
    return Array.prototype.slice.call(form.elements).filter(function (field) {
      return field.matches && field.matches("input, select, textarea") && field.willValidate;
    });
  }

  function setupPasswordToggle(field) {
    if (field.type !== "password" || field.closest(".password-control")) return;
    var label = field.closest("label");
    if (label && !field.hasAttribute("aria-label")) {
      var labelText = Array.prototype.slice.call(label.childNodes).filter(function (node) {
        return node.nodeType === Node.TEXT_NODE;
      }).map(function (node) {
        return node.textContent.trim();
      }).filter(Boolean).join(" ");
      if (labelText) field.setAttribute("aria-label", labelText);
    }

    var wrapper = document.createElement("span");
    wrapper.className = "password-control";
    field.parentNode.insertBefore(wrapper, field);
    wrapper.appendChild(field);

    if (!field.id) {
      errorCounter += 1;
      field.id = "password-field-" + errorCounter;
    }

    var toggle = document.createElement("button");
    toggle.className = "password-toggle";
    toggle.type = "button";
    toggle.textContent = "Rodyti";
    toggle.setAttribute("aria-controls", field.id);
    toggle.setAttribute("aria-pressed", "false");
    toggle.setAttribute("aria-label", "Rodyti slaptažodį");
    wrapper.appendChild(toggle);

    toggle.addEventListener("click", function () {
      var show = field.type === "password";
      field.type = show ? "text" : "password";
      toggle.textContent = show ? "Slėpti" : "Rodyti";
      toggle.setAttribute("aria-pressed", String(show));
      toggle.setAttribute("aria-label", show ? "Slėpti slaptažodį" : "Rodyti slaptažodį");
    });

    field.form.addEventListener("reset", function () {
      window.requestAnimationFrame(function () {
        field.type = "password";
        toggle.textContent = "Rodyti";
        toggle.setAttribute("aria-pressed", "false");
        toggle.setAttribute("aria-label", "Rodyti slaptažodį");
      });
    });
  }

  function clearStaleStatus(form) {
    var status = statusFor(form);
    if (status && (status.dataset.state === "error" || status.dataset.state === "info")) {
      setStatus(status, "", "");
    }
  }

  function setupForm(form) {
    form.noValidate = true;
    validationFields(form).forEach(function (field) {
      setupPasswordToggle(field);
    });

    form.addEventListener("input", function (event) {
      var field = event.target;
      if (!field.matches("input, select, textarea")) return;
      field.dataset.wasEdited = "true";
      var validateLive = field.dataset.validateLive === "true";
      if (field.type === "email") delete field.dataset.ignoreEmailSuggestion;
      clearStaleStatus(form);
      if (validateLive) validateField(field);
      else clearFieldError(field);
      if (field.name === "password") {
        var confirmation = form.querySelector("[name='password_confirm']");
        if (confirmation && confirmation.dataset.validateLive === "true") validateField(confirmation);
        else clearFieldError(confirmation);
      }
    });

    form.addEventListener("focusout", function (event) {
      var field = event.target;
      if (field.matches(".password-toggle")) {
        var toggleControl = field.closest(".password-control");
        if (toggleControl && event.relatedTarget && toggleControl.contains(event.relatedTarget)) return;
        field = toggleControl && toggleControl.querySelector("input");
      }
      if (!field || !field.matches("input, select, textarea") || !field.willValidate) return;
      var passwordControl = field.closest(".password-control");
      if (passwordControl && event.relatedTarget && passwordControl.contains(event.relatedTarget)) return;
      var isEmpty = field.type === "checkbox" || field.type === "radio"
        ? !field.checked
        : !field.value.trim();
      if (field.required && isEmpty && field.dataset.wasEdited !== "true") return;
      validateField(field);
    });

    form.addEventListener("reset", function () {
      window.requestAnimationFrame(function () {
        validationFields(form).forEach(function (field) {
          delete field.dataset.wasEdited;
          delete field.dataset.validateLive;
          delete field.dataset.ignoreEmailSuggestion;
          clearFieldError(field);
        });
      });
    });

    form.addEventListener("submit", function (event) {
      var firstInvalid = null;
      var firstSuggestion = null;
      validationFields(form).forEach(function (field) {
        if (!validateField(field) && !firstInvalid) firstInvalid = field;
        var suggestion = field.dataset.validationSuggestionId &&
          document.getElementById(field.dataset.validationSuggestionId);
        if (!firstSuggestion && suggestion && !suggestion.hidden) firstSuggestion = suggestion;
      });
      if (!firstInvalid && !firstSuggestion) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (firstInvalid) {
        setStatus(statusFor(form), "Patikrinkite pažymėtus laukus.", "error");
        firstInvalid.focus({ preventScroll: true });
        firstInvalid.scrollIntoView({ block: "center" });
        return;
      }

      setStatus(statusFor(form), "Patikrinkite el. pašto pasiūlymą arba palikite adresą tokį, kokį įvedėte.", "info");
      var suggestionButton = firstSuggestion.querySelector("button");
      if (suggestionButton) suggestionButton.focus({ preventScroll: true });
      firstSuggestion.scrollIntoView({ block: "center" });
    });
  }

  document.querySelectorAll("form[data-friendly-validation]").forEach(setupForm);

  global.AtminimasForms = {
    clearFieldError: clearFieldError,
    setBusy: setBusy,
    setStatus: setStatus,
    validateField: validateField
  };
})(window);
