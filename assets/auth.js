(function (global) {
  var SESSION_KEY = "atminimas.auth.session.v1";
  var CONFIRMATION_STATE_KEY = "atminimas.auth.confirmation-state.v1";
  var CONFIRMATION_NOTICE_KEY = "atminimas.auth.confirmation-notice.v1";
  var refreshPromise = null;
  var refreshTimer = null;
  var REFRESH_SKEW_MS = 90 * 1000;

  function removeLegacySession() {
    try {
      global.localStorage.removeItem(SESSION_KEY);
    } catch (_err) {
      // Saugykla gali būti išjungta naršyklės privatumo režime.
    }
  }

  function cfg() {
    var config = global.ATMINIMAS_CONFIG;
    if (!config || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
      throw new Error("Prisijungimo paslauga laikinai neparuošta.");
    }
    return config;
  }

  function baseUrl() {
    return cfg().SUPABASE_URL.replace(/\/$/, "");
  }

  function anonKey() {
    return cfg().SUPABASE_ANON_KEY;
  }

  function session() {
    try {
      return JSON.parse(global.sessionStorage.getItem(SESSION_KEY) || "null");
    } catch (_err) {
      return null;
    }
  }

  function tokenPayload(token) {
    if (!token) return null;
    try {
      var part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (part.length % 4) part += "=";
      return JSON.parse(atob(part));
    } catch (_err) {
      return null;
    }
  }

  function expiresAtMs(value) {
    if (!value) return 0;
    if (Number(value.expires_at) > 0) return Number(value.expires_at) * 1000;
    var payload = tokenPayload(value.access_token);
    return payload && Number(payload.exp) > 0 ? Number(payload.exp) * 1000 : 0;
  }

  function needsRefresh(value) {
    var expiry = expiresAtMs(value);
    return !!expiry && expiry - Date.now() <= REFRESH_SKEW_MS;
  }

  function scheduleRefresh(value) {
    if (refreshTimer) {
      global.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    if (!value || !value.refresh_token) return;
    var expiry = expiresAtMs(value);
    if (!expiry) return;
    var delay = Math.max(1000, Math.min(expiry - Date.now() - REFRESH_SKEW_MS, 2147483647));
    refreshTimer = global.setTimeout(function () {
      refreshSession(true).catch(function () {
        // Ryšio klaida nėra priežastis išmesti galiojančią vietinę sesiją.
      });
    }, delay);
  }

  function saveSession(value) {
    if (!value || !value.access_token) return;
    global.sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    removeLegacySession();
    scheduleRefresh(value);
  }

  function clearSession() {
    if (refreshTimer) global.clearTimeout(refreshTimer);
    refreshTimer = null;
    global.sessionStorage.removeItem(SESSION_KEY);
    removeLegacySession();
  }

  function accessToken() {
    var current = session();
    return current && current.access_token ? current.access_token : "";
  }

  function userId() {
    var token = accessToken();
    if (!token) return "";
    var payload = tokenPayload(token);
    return payload && payload.sub ? payload.sub : "";
  }

  function translatedAuthMessage(message) {
    if (/invalid login credentials/i.test(message)) {
      return "Neteisingas el. paštas arba slaptažodis.";
    }
    if (/email not confirmed/i.test(message)) {
      return "El. paštas dar nepatvirtintas. Atidarykite gautą laišką ir paspauskite patvirtinimo nuorodą.";
    }
    if (/user already registered/i.test(message)) {
      return "Jei šiuo el. paštu galima registruotis, patvirtinimo laiškas bus išsiųstas.";
    }
    if (/password should be at least/i.test(message)) {
      return "Slaptažodis per trumpas.";
    }
    if (/email.*limit|over_email_send_rate_limit/i.test(message)) {
      return "Laiškas ką tik buvo siųstas. Palaukite minutę ir bandykite dar kartą.";
    }
    if (/rate limit/i.test(message)) {
      return "Per daug bandymų. Palaukite ir pabandykite dar kartą.";
    }
    if (/refresh token|session.*expired|jwt.*expired/i.test(message)) {
      return "Prisijungimo sesija baigėsi. Prisijunkite dar kartą.";
    }
    return message;
  }

  function headers(json) {
    var token = accessToken();
    var h = {
      apikey: anonKey(),
      Accept: "application/json"
    };
    h.Authorization = "Bearer " + (token || anonKey());
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  async function authFetch(path, options) {
    var res = await fetch(baseUrl() + path, Object.assign({
      headers: headers(true)
    }, options || {}));
    var text = await res.text();
    var data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      var message = data.msg || data.error_description || data.message || "Prisijungti nepavyko.";
      var error = new Error(translatedAuthMessage(message));
      error.status = res.status;
      error.code = data.error_code || data.code || "";
      error.existingAccount = /user already registered/i.test(message) ||
        /user_already_exists|email_exists/i.test(error.code);
      throw error;
    }
    return data;
  }

  async function refreshSession(force) {
    var current = session();
    if (!current || !current.access_token) return null;
    if (!force && !needsRefresh(current)) return current;
    if (!current.refresh_token) {
      clearSession();
      throw new Error("Prisijungimo sesija baigėsi. Prisijunkite dar kartą.");
    }
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async function () {
      var response;
      try {
        response = await fetch(baseUrl() + "/auth/v1/token?grant_type=refresh_token", {
          method: "POST",
          headers: {
            apikey: anonKey(),
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ refresh_token: current.refresh_token })
        });
      } catch (error) {
        throw new Error("Nepavyko atnaujinti prisijungimo. Patikrinkite interneto ryšį ir bandykite dar kartą.");
      }
      var text = await response.text();
      var data = text ? JSON.parse(text) : {};
      if (!response.ok || !data.access_token) {
        var active = session();
        if (
          (response.status === 400 || response.status === 401 || response.status === 403) &&
          active &&
          active.refresh_token === current.refresh_token
        ) {
          clearSession();
        }
        var message = data.msg || data.error_description || data.message || "Prisijungimo sesija baigėsi.";
        var refreshError = new Error(translatedAuthMessage(message));
        refreshError.status = response.status;
        throw refreshError;
      }
      var latest = session();
      if (!latest) return null;
      if (latest.refresh_token !== current.refresh_token) return latest;
      if (!data.refresh_token) data.refresh_token = current.refresh_token;
      saveSession(data);
      return data;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  async function ensureFreshSession() {
    var current = session();
    if (!current || !current.access_token) return null;
    return needsRefresh(current) ? refreshSession(true) : current;
  }

  function requestHeaders(input) {
    var merged = Object.assign({}, input || {});
    var latest = headers(false);
    merged.apikey = latest.apikey;
    merged.Accept = merged.Accept || latest.Accept;
    merged.Authorization = latest.Authorization;
    return merged;
  }

  async function authorizedFetch(url, options) {
    await ensureFreshSession();
    var request = Object.assign({}, options || {});
    request.headers = requestHeaders(request.headers);
    var response = await fetch(url, request);
    var current = session();
    if (response.status !== 401 || !current || !current.refresh_token) return response;

    await refreshSession(true);
    request.headers = requestHeaders(options && options.headers);
    return fetch(url, request);
  }

  function safeNextPage() {
    if (!global.location) return "";
    var value = (new URLSearchParams(global.location.search).get("next") || "").trim();
    return /^[a-z0-9-]+\.html(?:[?#][^\s]*)?$/i.test(value) ? value : "";
  }

  function createConfirmationState() {
    if (!global.crypto || !global.crypto.getRandomValues) return "";
    var bytes = new Uint8Array(24);
    global.crypto.getRandomValues(bytes);
    var value = Array.from(bytes).map(function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
    localStorage.setItem(CONFIRMATION_STATE_KEY, value);
    return value;
  }

  function emailRedirectUrl(state) {
    var configured = String(cfg().PUBLIC_SITE_URL || "").trim();
    var base = configured || global.location.href;
    var redirect = new URL("prisijungti.html", base);
    var next = safeNextPage();
    if (next) redirect.searchParams.set("next", next);
    if (state) redirect.searchParams.set("auth_state", state);
    return redirect.href;
  }

  async function signIn(email, password) {
    var data = await authFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: email, password: password })
    });
    saveSession(data);
    return data;
  }

  async function signUp(email, password, name) {
    var confirmationState = createConfirmationState();
    var data;
    try {
      data = await authFetch("/auth/v1/signup?redirect_to=" + encodeURIComponent(emailRedirectUrl(confirmationState)), {
        method: "POST",
        body: JSON.stringify({
          email: email,
          password: password,
          data: { name: name || "" }
        })
      });
    } catch (error) {
      if (!error || !error.existingAccount) throw error;
      data = { user: { email: email } };
    }
    if (data.access_token) {
      localStorage.removeItem(CONFIRMATION_STATE_KEY);
      saveSession(data);
    }
    return data;
  }

  async function resendSignupConfirmation(email) {
    var confirmationState = createConfirmationState();
    return authFetch("/auth/v1/resend?redirect_to=" + encodeURIComponent(emailRedirectUrl(confirmationState)), {
      method: "POST",
      body: JSON.stringify({ type: "signup", email: email })
    });
  }

  async function user() {
    if (!accessToken()) return null;
    try {
      await ensureFreshSession();
      return await authFetch("/auth/v1/user", { method: "GET" });
    } catch (error) {
      if (error && (error.status === 401 || error.status === 403)) {
        clearSession();
        return null;
      }
      throw error;
    }
  }

  async function isAdmin() {
    var me = await user();
    if (!me) return false;
    var res = await authorizedFetch(baseUrl() + "/rest/v1/user_roles?user_id=eq." + encodeURIComponent(me.id) + "&role=eq.admin&select=role&limit=1", {
      headers: headers(false)
    });
    if (!res.ok) return false;
    var rows = await res.json();
    return rows && rows.length > 0;
  }

  function signOut() {
    var token = accessToken();
    clearSession();
    if (token) {
      fetch(baseUrl() + "/auth/v1/logout", {
        method: "POST",
        keepalive: true,
        headers: {
          apikey: anonKey(),
          Authorization: "Bearer " + token
        }
      }).catch(function () {});
    }
  }

  function consumeSessionFromUrl() {
    if (!global.location || !global.location.hash) return;
    var hash = new URLSearchParams(global.location.hash.slice(1));
    var access = hash.get("access_token");
    var refresh = hash.get("refresh_token");
    if (!access || !refresh || hash.get("type") === "recovery") return;
    var expectedState = localStorage.getItem(CONFIRMATION_STATE_KEY) || "";
    var providedState = (new URLSearchParams(global.location.search).get("auth_state") || "").trim();
    if (expectedState && providedState === expectedState) {
      saveSession({
        access_token: access,
        refresh_token: refresh,
        expires_in: Number(hash.get("expires_in")) || undefined,
        expires_at: Math.floor(Date.now() / 1000) + (Number(hash.get("expires_in")) || 3600),
        token_type: hash.get("token_type") || "bearer"
      });
      localStorage.removeItem(CONFIRMATION_STATE_KEY);
    } else {
      sessionStorage.setItem(
        CONFIRMATION_NOTICE_KEY,
        "El. paštas patvirtintas. Saugumo sumetimais dabar prisijunkite savo el. paštu ir slaptažodžiu."
      );
    }
    if (global.history && global.history.replaceState) {
      var cleanUrl = new URL(global.location.href);
      cleanUrl.hash = "";
      cleanUrl.searchParams.delete("auth_state");
      global.history.replaceState(null, "", cleanUrl.pathname + cleanUrl.search);
    }
  }

  removeLegacySession();
  consumeSessionFromUrl();
  scheduleRefresh(session());
  if (global.document) {
    global.document.addEventListener("visibilitychange", function () {
      if (global.document.visibilityState === "visible") {
        ensureFreshSession().catch(function () {});
      }
    });
  }

  global.AtminimasAuth = {
    session: session,
    accessToken: accessToken,
    userId: userId,
    headers: headers,
    signIn: signIn,
    signUp: signUp,
    resendSignupConfirmation: resendSignupConfirmation,
    refreshSession: refreshSession,
    ensureFreshSession: ensureFreshSession,
    authorizedFetch: authorizedFetch,
    signOut: signOut,
    user: user,
    isAdmin: isAdmin
  };
})(window);


