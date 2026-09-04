window.__ModuleLoader__.load({ id: "@dsh-external/dsh-headroom-suite", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/HeadroomPanel.tsx
var import_react = require("react");

// src/constants.ts
var HEADROOM_PORT = 8787;
var DEEPSEEK_ANTHROPIC_URL = "https://api.deepseek.com/anthropic";
var HEADROOM_BASE_URL = `http://127.0.0.1:${HEADROOM_PORT}/v1`;
var DIRECT_BASE_URL = "https://api.deepseek.com";
var LLM_DEEPSEEK_NAMESPACE = "llm-deepseek";
var HEADROOM_LIVEZ_URL = `http://127.0.0.1:${HEADROOM_PORT}/livez`;
var MGR_STATUS_PATH = "/headroom-mgr/status";
var MGR_ROUTE_PATH = "/headroom-mgr/route";
var MGR_START_PATH = "/headroom-mgr/start";
var MGR_STOP_PATH = "/headroom-mgr/stop";
var DIRECT_ROUTE_VALUES = [
  DIRECT_BASE_URL,
  `${DIRECT_BASE_URL}/`,
  `${DIRECT_BASE_URL}/v1`,
  `${DIRECT_BASE_URL}/v1/`,
  DEEPSEEK_ANTHROPIC_URL,
  `${DEEPSEEK_ANTHROPIC_URL}/`
];
function routeOf(baseURL) {
  const value = baseURL?.trim();
  if (value === void 0 || value.length === 0) return "direct";
  if (value === HEADROOM_BASE_URL) return "headroom";
  if (DIRECT_ROUTE_VALUES.includes(value)) return "direct";
  return "third-party";
}
function isUsableThirdPartyBaseURL(baseURL) {
  return /^https?:\/\//i.test(baseURL) && routeOf(baseURL) === "third-party";
}

// src/client/stats.ts
var EMPTY_STATS = {
  inputTokens: 0,
  tokensSaved: 0,
  sessionSavedTokens: 0,
  lifetimeInputTokens: 0,
  cacheHitRate: 0,
  requests: 0,
  ok: false
};
async function fetchHeadroomStats(base = "http://127.0.0.1:8787") {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4e3);
    try {
      const response = await fetch(`${base}/stats`, { signal: controller.signal });
      if (!response.ok) return EMPTY_STATS;
      const body = await response.json();
      const lifetime = body.persistent_savings?.lifetime;
      const session = body.persistent_savings?.display_session;
      const cache = body.prefix_cache?.totals;
      return {
        // display_session is Headroom's rolling 60-minute activity window.
        inputTokens: session?.total_input_tokens ?? lifetime?.total_input_tokens ?? 0,
        tokensSaved: lifetime?.tokens_saved ?? 0,
        sessionSavedTokens: session?.tokens_saved ?? 0,
        lifetimeInputTokens: lifetime?.total_input_tokens ?? 0,
        cacheHitRate: cache?.hit_rate ?? 0,
        requests: lifetime?.requests ?? 0,
        ok: true
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return EMPTY_STATS;
  }
}
function formatTokens(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(Math.round(value));
}

// src/client/HeadroomPanel.css.ts
var css = ".section_wl13vp {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 16px;\r\n}\r\n\r\n.statsCard_10qmb7z {\r\n  border: 1px solid var(--dsw-color-border-strong, #d0d7de);\r\n  border-radius: 8px;\r\n  padding: 16px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 12px;\r\n  background: var(--dsw-color-canvas-subtle, #f6f8fa);\r\n}\r\n\r\n.statsTitle_2owfzt {\r\n  font-size: 14px;\r\n  font-weight: 700;\r\n  color: var(--dsw-color-text-primary, #1f2328);\r\n}\r\n\r\n.statsGrid_10qp7k5 {\r\n  display: grid;\r\n  grid-template-columns: repeat(3, 1fr);\r\n  gap: 12px;\r\n}\r\n\r\n.statCell_ls7ydy {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n}\r\n\r\n.statValue_10b7nul {\r\n  font-size: 18px;\r\n  font-weight: 700;\r\n  color: var(--dsw-color-accent-fg, #0969da);\r\n}\r\n\r\n.statLabel_105pi4g {\r\n  font-size: 11px;\r\n  color: var(--dsw-color-text-secondary, #57606a);\r\n}\r\n\r\n.statsNote_10qtmi9 {\r\n  font-size: 11px;\r\n  color: var(--dsw-color-text-secondary, #57606a);\r\n}\r\n\r\n.statsWarn_10qz2yt {\r\n  font-size: 11px;\r\n  color: var(--dsw-color-danger-fg, #cf222e);\r\n}\r\n\r\n.card_1tafk {\r\n  border: 1px solid var(--dsw-color-border-strong, #d0d7de);\r\n  border-radius: 8px;\r\n  padding: 16px;\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 12px;\r\n}\r\n\r\n.row_2fa2 {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n}\r\n\r\n.label_1p5sz8 {\r\n  font-size: 13px;\r\n  color: var(--dsw-color-text-secondary, #57606a);\r\n}\r\n\r\n.value_1unypd {\r\n  font-size: 13px;\r\n  font-weight: 600;\r\n  color: var(--dsw-color-text-primary, #1f2328);\r\n}\r\n\r\n.badge_1jnwkj {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  padding: 2px 10px;\r\n  border-radius: 999px;\r\n  font-size: 12px;\r\n  font-weight: 600;\r\n}\r\n\r\n.badgeHealthy_1yuqcmy {\r\n  background: var(--dsw-color-success-bg, #dafbe1);\r\n  color: var(--dsw-color-success-fg, #1a7f37);\r\n}\r\n\r\n.badgeDown_yxl97p {\r\n  background: var(--dsw-color-danger-bg, #ffebe9);\r\n  color: var(--dsw-color-danger-fg, #cf222e);\r\n}\r\n\r\n.badgeProbing_1gks40a {\r\n  background: var(--dsw-color-neutral-bg, #f6f8fa);\r\n  color: var(--dsw-color-text-secondary, #57606a);\r\n}\r\n\r\n.actions_1ftekn1 {\r\n  display: flex;\r\n  gap: 8px;\r\n  margin-top: 4px;\r\n}\r\n\r\n.warning_ilgs64 {\r\n  font-size: 12px;\r\n  color: var(--dsw-color-danger-fg, #cf222e);\r\n  background: var(--dsw-color-danger-bg, #ffebe9);\r\n  border-radius: 6px;\r\n  padding: 8px 12px;\r\n}\r\n\r\n.notes_1qipc1 {\r\n  font-size: 12px;\r\n  color: var(--dsw-color-text-secondary, #57606a);\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 4px;\r\n  padding-left: 16px;\r\n}\r\n\r\n.notesTitle_1xoosuv {\r\n  font-weight: 600;\r\n  color: var(--dsw-color-text-primary, #1f2328);\r\n  margin-bottom: 4px;\r\n}\r\n\r\n.moneyRow_1tj86be {\r\n  display: flex;\r\n  align-items: baseline;\r\n  gap: 8px;\r\n  margin-top: 4px;\r\n}\r\n\r\n.priceGrid_zv9smn {\r\n  display: grid;\r\n  grid-template-columns: repeat(2, 1fr);\r\n  gap: 8px;\r\n  margin-top: 8px;\r\n}\r\n\r\n.priceField_1ag17ox {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 2px;\r\n}\r\n\r\n.input_1nr0sq {\r\n  font-size: 13px;\r\n  padding: 4px 8px;\r\n  border: 1px solid var(--dsw-color-border-strong, #d0d7de);\r\n  border-radius: 6px;\r\n  background: var(--dsw-color-canvas, #ffffff);\r\n  color: var(--dsw-color-text-primary, #1f2328);\r\n  width: 100%;\r\n  box-sizing: border-box;\r\n}\r\n\r\n.priceSection_2ecm70 {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 12px;\r\n  margin-top: 8px;\r\n}\r\n\r\n.priceModelSelect_81e6bg {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  flex-wrap: wrap;\r\n}\r\n\r\n.priceModelActive_1yiqnba {\r\n  border-color: var(--dsw-color-accent-fg, #0969da) !important;\r\n  color: var(--dsw-color-accent-fg, #0969da) !important;\r\n  font-weight: 600;\r\n}\r\n\r\n.priceWindow_r8poyh {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  flex-wrap: wrap;\r\n  border-top: 1px solid var(--dsw-color-border-strong, #d0d7de);\r\n  padding-top: 8px;\r\n}\r\n\r\n.priceSpanRow_7kmkdj {\r\n  display: flex;\r\n  align-items: flex-end;\r\n  gap: 8px;\r\n  width: 100%;\r\n}\r\n\r\n.priceSpanRow_7kmkdj > label {\r\n  flex: 1;\r\n}\r\n";
var tagId = "@dsh-external/dsh-headroom-suite/HeadroomPanel.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "@dsh-external/dsh-headroom-suite";
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
var styles = { "section": "section_wl13vp", "statsCard": "statsCard_10qmb7z", "statsTitle": "statsTitle_2owfzt", "statsGrid": "statsGrid_10qp7k5", "statCell": "statCell_ls7ydy", "statValue": "statValue_10b7nul", "statLabel": "statLabel_105pi4g", "statsNote": "statsNote_10qtmi9", "statsWarn": "statsWarn_10qz2yt", "card": "card_1tafk", "row": "row_2fa2", "label": "label_1p5sz8", "value": "value_1unypd", "badge": "badge_1jnwkj", "badgeHealthy": "badgeHealthy_1yuqcmy", "badgeDown": "badgeDown_yxl97p", "badgeProbing": "badgeProbing_1gks40a", "actions": "actions_1ftekn1", "warning": "warning_ilgs64", "notes": "notes_1qipc1", "notesTitle": "notesTitle_1xoosuv", "moneyRow": "moneyRow_1tj86be", "priceGrid": "priceGrid_zv9smn", "priceField": "priceField_1ag17ox", "input": "input_1nr0sq", "priceSection": "priceSection_2ecm70", "priceModelSelect": "priceModelSelect_81e6bg", "priceModelActive": "priceModelActive_1yiqnba", "priceWindow": "priceWindow_r8poyh", "priceSpanRow": "priceSpanRow_7kmkdj" };
var HeadroomPanel_css_default = styles;

// src/client/HeadroomPanel.tsx
var import_jsx_runtime = require("react/jsx-runtime");
async function probeHeadroom() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3e3);
    try {
      const response = await fetch(HEADROOM_LIVEZ_URL, { signal: controller.signal });
      if (!response.ok) return { kind: "down" };
      const body = await response.json();
      return { kind: "healthy", version: typeof body.version === "string" ? body.version : "?" };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { kind: "down" };
  }
}
async function postRoute(payload) {
  const response = await fetch(MGR_ROUTE_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  const body = await response.json();
  return { status: response.status, body };
}
function HeadroomPanel(props) {
  const { scope, t } = props;
  if (scope === void 0 || t === void 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadroomPanelBody, { scope, t, runCommand: props.runCommand });
}
function HeadroomPanelBody(props) {
  const { scope, t, runCommand } = props;
  const snapshot = (0, import_react.useSyncExternalStore)(
    (listener) => scope.subscribe(listener),
    () => scope.getSnapshot()
  );
  const ready = snapshot.status === "ready";
  const baseURL = ready ? snapshot.value?.baseURL : void 0;
  const writable = ready && snapshot.writable === true;
  const route = routeOf(baseURL);
  const [probe, setProbe] = (0, import_react.useState)({ kind: "idle" });
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [done, setDone] = (0, import_react.useState)(false);
  const [opBusy, setOpBusy] = (0, import_react.useState)(null);
  const [opResult, setOpResult] = (0, import_react.useState)(null);
  const [stats, setStats] = (0, import_react.useState)(EMPTY_STATS);
  const [savedBaseURL, setSavedBaseURL] = (0, import_react.useState)(null);
  const [customURL, setCustomURL] = (0, import_react.useState)("");
  (0, import_react.useEffect)(() => {
    if (!ready || route !== "headroom" || probe.kind !== "idle") return;
    setProbe({ kind: "probing" });
    void probeHeadroom().then(setProbe);
  }, [ready, route, probe.kind]);
  (0, import_react.useEffect)(() => {
    fetch(MGR_STATUS_PATH, { cache: "no-store" }).then((r) => r.json()).then((b) => {
      setSavedBaseURL(typeof b.savedBaseURL === "string" ? b.savedBaseURL : null);
    }).catch(() => {
    });
  }, []);
  (0, import_react.useEffect)(() => {
    let alive = true;
    const refresh = async () => {
      const next = await fetchHeadroomStats();
      if (alive) setStats(next);
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 1e4);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  (0, import_react.useEffect)(() => {
    setCustomURL(route === "third-party" ? baseURL ?? "" : savedBaseURL ?? "");
  }, [route, baseURL, savedBaseURL]);
  if (!ready) return null;
  const switchRoute = async (target) => {
    if (!writable) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const { status, body } = await postRoute({ target });
      if (status < 200 || status >= 300 || body.ok !== true) throw new Error(body.error ?? `HTTP ${status}`);
      if (target === "headroom") {
        setSavedBaseURL(body.savedBaseURL ?? null);
      } else if (body.sidecarCleanupFailed === true && typeof body.restoredBaseURL === "string") {
        setSavedBaseURL(body.restoredBaseURL);
      } else {
        setSavedBaseURL(null);
      }
      setDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  const applyThirdParty = async () => {
    if (!writable) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const { status, body } = await postRoute({ target: "third-party", baseURL: customURL.trim() });
      if (status < 200 || status >= 300 || body.ok !== true) throw new Error(body.error ?? `HTTP ${status}`);
      setDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  const runLifecycle = async (command, label) => {
    if (runCommand === void 0) return;
    setOpBusy(label);
    setOpResult(null);
    try {
      const result = await runCommand(command);
      setOpResult(result);
      setProbe({ kind: "probing" });
      void probeHeadroom().then(setProbe);
    } catch (failure) {
      setOpResult({ kind: "error", text: failure instanceof Error ? failure.message : String(failure) });
    } finally {
      setOpBusy(null);
    }
  };
  const routeLabel = route === "direct" ? t("routeDirect") : route === "headroom" ? t("routeHeadroom") : t("routeThirdParty");
  const customValid = isUsableThirdPartyBaseURL(customURL.trim());
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: HeadroomPanel_css_default["section"], "aria-label": t("title"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["statsCard"], children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: HeadroomPanel_css_default["statsTitle"], children: t("statsTitle") }),
      route === "direct" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: HeadroomPanel_css_default["statsWarn"], children: t("statsFrozenDirect") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["statsGrid"], children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["statCell"], children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["statValue"], children: formatTokens(stats.inputTokens) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["statLabel"], children: t("stat60min") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["statCell"], children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["statValue"], children: formatTokens(stats.tokensSaved) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["statLabel"], children: t("statSavedTotal") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["statCell"], children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["statValue"], children: formatTokens(stats.lifetimeInputTokens) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["statLabel"], children: t("statLifetimeInput") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["statCell"], children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["statValue"], children: stats.cacheHitRate > 0 ? `${stats.cacheHitRate.toFixed(1)}%` : "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["statLabel"], children: t("statCacheHit") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["statCell"], children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["statValue"], children: stats.requests > 0 ? String(stats.requests) : "\u2014" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["statLabel"], children: t("statRequests") })
        ] })
      ] }),
      stats.ok ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["statsNote"], children: t("statsNote") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["statsWarn"], children: t("statsUnavailable") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["card"], children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["row"], children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["label"], children: t("current") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["value"], children: routeLabel })
      ] }),
      route === "headroom" && savedBaseURL !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: HeadroomPanel_css_default["row"], children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["value"], children: t("savedThirdParty").replace("{url}", savedBaseURL) }) }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: HeadroomPanel_css_default["row"], children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["label"], children: t("thirdPartyLabel") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["actions"], children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "text",
            className: HeadroomPanel_css_default["input"],
            value: customURL,
            placeholder: t("thirdPartyPlaceholder"),
            disabled: busy || !writable,
            onChange: (e) => {
              setCustomURL(e.target.value);
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsw-button",
            disabled: busy || !writable || !customValid,
            onClick: () => {
              void applyThirdParty();
            },
            children: t("applyThirdParty")
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: HeadroomPanel_css_default["statsNote"], children: t("thirdPartyHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["row"], children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["label"], children: t("headroomStatus") }),
        probe.kind === "healthy" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${HeadroomPanel_css_default["badge"]} ${HeadroomPanel_css_default["badgeHealthy"]}`, children: t("headroomHealthy").replace("{version}", probe.version) }) : probe.kind === "down" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${HeadroomPanel_css_default["badge"]} ${HeadroomPanel_css_default["badgeDown"]}`, children: t("headroomDown") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `${HeadroomPanel_css_default["badge"]} ${HeadroomPanel_css_default["badgeProbing"]}`, children: t("headroomProbing") })
      ] }),
      probe.kind === "down" && route === "headroom" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: HeadroomPanel_css_default["warning"], children: t("headroomDownWarning") }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["actions"], children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsw-button dsw-button--primary",
            disabled: busy || !writable || route === "headroom",
            onClick: () => {
              void switchRoute("headroom");
            },
            children: busy && route !== "headroom" ? t("switching") : t("switchToHeadroom")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "dsw-button",
            disabled: busy || !writable || route === "direct",
            onClick: () => {
              void switchRoute("direct");
            },
            children: busy && route !== "direct" ? t("switching") : t("switchToDirect")
          }
        )
      ] }),
      done ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: HeadroomPanel_css_default["row"], children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["value"], children: t("switched") }) }) : null,
      error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: HeadroomPanel_css_default["warning"], children: t("error").replace("{message}", error) }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["card"], children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: HeadroomPanel_css_default["row"], children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["label"], children: t("lifecycle") }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: HeadroomPanel_css_default["actions"], children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "dsw-button",
          disabled: opBusy !== null,
          onClick: () => {
            void runLifecycle("/headroom-install", t("installing"));
          },
          children: opBusy === t("installing") ? t("installing") : t("install")
        }
      ) }),
      opResult !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: opResult.kind === "error" ? HeadroomPanel_css_default["warning"] : HeadroomPanel_css_default["row"], children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["value"], children: opResult.text }) }) : null,
      opBusy !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: HeadroomPanel_css_default["row"], children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["value"], children: opBusy }) }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: HeadroomPanel_css_default["notes"], children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: HeadroomPanel_css_default["notesTitle"], children: t("notes") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        "\u2022 ",
        t("noteSource")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        "\u2022 ",
        t("noteCache")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        "\u2022 ",
        t("noteQuality")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        "\u2022 ",
        t("noteFallback")
      ] })
    ] })
  ] });
}

// src/client/ManagerPanel.tsx
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
function fetchJson(url, opts) {
  return fetch(url, Object.assign({ cache: "no-store" }, opts)).then((r) => r.json());
}
function postJson(url) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  }).then((r) => r.json().then((b) => ({ status: r.status, body: b })));
}
var fmtUsd = (v) => typeof v === "number" ? "$" + v.toFixed(2) : "\u2014";
var fmtTok = (v) => typeof v === "number" ? v.toLocaleString() : "\u2014";
var zh = {
  nav: "\u4EE3\u7406\u7BA1\u7406",
  procStatus: "Headroom \u8FDB\u7A0B",
  probing: "\u63A2\u6D4B\u4E2D\u2026",
  running: "\u8FD0\u884C\u4E2D",
  stopped: "\u672A\u8FD0\u884C",
  btnStart: "\u542F\u52A8\u4EE3\u7406\u8FDB\u7A0B",
  btnStop: "\u505C\u6B62\u4EE3\u7406\u8FDB\u7A0B",
  starting: "\u542F\u52A8\u4E2D\u2026",
  stopping: "\u505C\u6B62\u4E2D\u2026",
  startOk: "\u2705 \u4EE3\u7406\u5DF2\u542F\u52A8\u5E76\u901A\u8FC7\u5065\u5EB7\u68C0\u67E5",
  startedSlow: "\u26A0\uFE0F \u5DF2\u53D1\u51FA\u542F\u52A8\u547D\u4EE4\uFF0C\u4F46\u5065\u5EB7\u68C0\u67E5\u5C1A\u672A\u901A\u8FC7\uFF08\u53EF\u80FD\u4ECD\u5728\u521D\u59CB\u5316\uFF0C\u7A0D\u540E\u5237\u65B0\u67E5\u770B\uFF09",
  startFail: "\u274C \u542F\u52A8\u5931\u8D25",
  stopOk: "\u2705 \u4EE3\u7406\u5DF2\u505C\u6B62",
  stopFail: "\u274C \u505C\u6B62\u5931\u8D25",
  savingsTitle: "\u7D2F\u8BA1\u8282\u7701\u7EDF\u8BA1\uFF08lifetime\uFF09",
  totalRequests: "\u5904\u7406\u8BF7\u6C42\u6570",
  cacheSaved: "\u7F13\u5B58\u547D\u4E2D\u8282\u7701",
  compressSaved: "\u4E0A\u4E0B\u6587\u538B\u7F29\u8282\u7701",
  compressTokens: "\u538B\u7F29\u8282\u7701 token \u6570"
};
function ManagerPanel() {
  const [st, setSt] = (0, import_react2.useState)({});
  const [loading, setLoading] = (0, import_react2.useState)(true);
  const [busy, setBusy] = (0, import_react2.useState)("");
  const [msg, setMsg] = (0, import_react2.useState)(null);
  const refresh = (0, import_react2.useCallback)(() => {
    fetchJson(MGR_STATUS_PATH).then((s) => {
      setSt(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);
  (0, import_react2.useEffect)(() => {
    refresh();
    const timer = setInterval(refresh, 15e3);
    return () => clearInterval(timer);
  }, [refresh]);
  const doStart = async () => {
    setBusy("start");
    setMsg(null);
    try {
      const r = await postJson(MGR_START_PATH);
      if (r.body.ok && r.body.healthyAfterStart) setMsg(zh.startOk);
      else if (r.body.ok) setMsg(zh.startedSlow);
      else setMsg(zh.startFail + ": " + JSON.stringify(r.body));
      refresh();
    } catch (e) {
      setMsg(zh.startFail + ": " + String(e));
    }
    setBusy("");
  };
  const doStop = async () => {
    setBusy("stop");
    setMsg(null);
    try {
      const r = await postJson(MGR_STOP_PATH);
      setMsg(r.body.ok ? zh.stopOk : zh.stopFail + ": " + JSON.stringify(r.body));
      refresh();
    } catch (e) {
      setMsg(zh.stopFail + ": " + String(e));
    }
    setBusy("");
  };
  const running = st.running === true;
  const sv = st.savings ?? {};
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { style: { display: "flex", flexDirection: "column", gap: "16px" }, "aria-label": zh.nav, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { border: "1px solid var(--dsw-color-border-strong,#d0d7de)", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { color: "var(--dsw-color-text-secondary,#57606a)", fontSize: "13px" }, children: zh.procStatus }),
        loading ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: "13px", color: "#57606a" }, children: zh.probing }) : running ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { borderRadius: "999px", padding: "2px 10px", fontSize: "12px", fontWeight: 600, background: "var(--dsw-color-success-bg,#dafbe1)", color: "var(--dsw-color-success-fg,#1a7f37)" }, children: `${zh.running} v${st.version ?? "?"}${st.pid ? " \xB7 PID " + st.pid : ""}` }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { borderRadius: "999px", padding: "2px 10px", fontSize: "12px", fontWeight: 600, background: "var(--dsw-color-danger-bg,#ffebe9)", color: "var(--dsw-color-danger-fg,#cf222e)" }, children: zh.stopped })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: "8px", marginTop: "4px" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dsw-button dsw-button--primary", disabled: busy !== "" || running, onClick: () => {
          void doStart();
        }, children: busy === "start" ? zh.starting : zh.btnStart }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "dsw-button", disabled: busy !== "" || !running, onClick: () => {
          void doStop();
        }, children: busy === "stop" ? zh.stopping : zh.btnStop })
      ] }),
      msg ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: "12px", color: "var(--dsw-color-text-secondary,#57606a)" }, children: msg }) : null
    ] }),
    running ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { border: "1px solid var(--dsw-color-border-strong,#d0d7de)", borderRadius: "8px", padding: "16px", display: "flex", flexDirection: "column", gap: "8px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontWeight: 600, fontSize: "13px", marginBottom: "4px" }, children: zh.savingsTitle }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "13px" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { color: "var(--dsw-color-text-secondary,#57606a)" }, children: zh.totalRequests }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: fmtTok(sv.requests) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "13px" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { color: "var(--dsw-color-text-secondary,#57606a)" }, children: zh.cacheSaved }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: fmtUsd(sv.cache_savings_usd) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "13px" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { color: "var(--dsw-color-text-secondary,#57606a)" }, children: zh.compressSaved }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: fmtUsd(sv.compression_savings_usd) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--dsw-color-text-secondary,#57606a)" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: zh.compressTokens }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: fmtTok(sv.tokens_saved) })
      ] })
    ] }) : null
  ] });
}

// src/client/locales.ts
var zh2 = {
  "nav": "\u7EBF\u8DEF\u5207\u6362",
  "title": "Headroom \u538B\u7F29\u7EBF\u8DEF",
  "description": "\u5728\u76F4\u8FDE\u4E0E Headroom \u538B\u7F29\u4EE3\u7406\u4E4B\u95F4\u4E00\u952E\u5207\u6362\u3002\u5207\u6362\u70ED\u751F\u6548\uFF0C\u4E0B\u4E00\u6B21\u8BF7\u6C42\u5373\u8D70\u65B0\u7EBF\u8DEF\u3002",
  "current": "\u5F53\u524D\u7EBF\u8DEF",
  "routeDirect": "\u76F4\u8FDE\uFF08api.deepseek.com\uFF09",
  "routeHeadroom": "\u538B\u7F29\uFF08Headroom :8787\uFF09",
  "routeThirdParty": "\u7B2C\u4E09\u65B9\u7EBF\u8DEF",
  "savedThirdParty": "\u5207\u56DE\u76F4\u8FDE\u5C06\u6062\u590D {url}",
  "thirdPartyLabel": "\u7B2C\u4E09\u65B9 baseURL",
  "thirdPartyPlaceholder": "https://your-gateway.example.com/v1",
  "applyThirdParty": "\u4F7F\u7528\u7B2C\u4E09\u65B9\u7EBF\u8DEF",
  "thirdPartyHint": "\u7B2C\u4E09\u65B9\u7EBF\u8DEF\u4E0D\u7ECF Headroom \u538B\u7F29\uFF0CDSH \u76F4\u63A5\u8BF7\u6C42\u8BE5\u5730\u5740\uFF1B\u5982\u9700\u538B\u7F29\uFF0C\u8BF7\u4EE5\u5BF9\u5E94\u4E0A\u6E38\u53C2\u6570\u81EA\u884C\u542F\u52A8 Headroom\u3002\u5207\u5230\u538B\u7F29\u7EBF\u8DEF\u65F6\u8BE5\u5730\u5740\u4F1A\u88AB\u4FDD\u5B58\u3002",
  "headroomStatus": "Headroom \u72B6\u6001",
  "headroomHealthy": "\u5065\u5EB7\uFF08v{version}\uFF09",
  "headroomDown": "\u4E0D\u53EF\u8FBE",
  "headroomProbing": "\u63A2\u6D4B\u4E2D\u2026",
  "switchToHeadroom": "\u5207\u6362\u5230\u538B\u7F29\u7EBF\u8DEF",
  "switchToDirect": "\u5207\u56DE\u76F4\u8FDE",
  "switching": "\u5207\u6362\u4E2D\u2026",
  "switched": "\u5DF2\u5207\u6362",
  "error": "\u64CD\u4F5C\u5931\u8D25\uFF1A{message}",
  "headroomDownWarning": "Headroom \u5F53\u524D\u4E0D\u53EF\u8FBE\u3002\u5207\u6362\u540E\u8BF7\u6C42\u4F1A\u5931\u8D25\uFF0CDSH \u4F1A\u81EA\u52A8\u91CD\u8BD5\uFF1B\u8BF7\u5148\u542F\u52A8 Headroom\u3002",
  "notes": "\u8BF4\u660E",
  "noteSource": "\u538B\u7F29\u5F15\u64CE\u4E3A Headroom\uFF08headroomlabs-ai/headroom\uFF0CApache 2.0\uFF09\uFF0C\u672C\u63D2\u4EF6\u4EC5\u8D1F\u8D23\u96C6\u6210\u4E0E\u7BA1\u7406\u3002",
  "noteCache": "Headroom \u7684\u6539\u5199\u662F\u786E\u5B9A\u6027\u7684\uFF0C\u524D\u7F00\u7F13\u5B58\u547D\u4E2D\u7387\u4E0D\u53D7\u5F71\u54CD\uFF08\u5B9E\u6D4B 97.6%+\uFF09\u3002",
  "noteQuality": "\u538B\u7F29\u53EA\u4F5C\u7528\u4E8E\u5DE5\u5177\u63CF\u8FF0\u7B49\u975E\u5173\u952E\u5185\u5BB9\uFF0C\u5BF9\u8BDD\u4E0E\u5DE5\u5177\u7ED3\u679C\u4E0D\u53D7\u5F71\u54CD\u3002",
  "noteFallback": "\u7EBF\u8DEF\u6545\u969C\u65F6\u53EF\u5728\u6B64\u9875\u4E00\u952E\u5207\u56DE\u76F4\u8FDE\uFF0C\u65E0\u9700\u91CD\u542F\u3002",
  "lifecycle": "\u5F15\u64CE\u7BA1\u7406",
  "install": "\u5B89\u88C5 Headroom \u5F15\u64CE",
  "installing": "\u5B89\u88C5\u4E2D\u2026",
  "statsTitle": "Token \u8282\u7701\u7EDF\u8BA1\uFF08\u5B9E\u65F6\uFF09",
  "stat60min": "\u6700\u8FD1 60 \u5206\u949F\u82B1\u8D39 token",
  "statSavedTotal": "\u7D2F\u8BA1\u8282\u7701 token",
  "statLifetimeInput": "\u7D2F\u8BA1\u8F93\u5165 token",
  "statCacheHit": "\u7F13\u5B58\u547D\u4E2D\u7387",
  "statRequests": "\u7D2F\u8BA1\u8BF7\u6C42\u6570",
  "statsFrozenDirect": "\u5F53\u524D\u4E3A\u76F4\u8FDE\u7EBF\u8DEF\uFF0C\u7EDF\u8BA1\u5DF2\u51BB\u7ED3\uFF08\u4E0D\u65B0\u589E\uFF09\u3002",
  "statsNote": "\u6BCF 10 \u79D2\u81EA\u52A8\u5237\u65B0\uFF1B\u300C\u6700\u8FD1 60 \u5206\u949F\u300D\u4E3A Headroom \u6D3B\u52A8\u7A97\u53E3\uFF0C\u95F2\u7F6E\u8D85 60 \u5206\u949F\u81EA\u52A8\u91CD\u7F6E\u3002token \u7EDF\u8BA1\u6765\u81EA Headroom \u4EE3\u7406\u65E5\u5FD7\uFF0C\u4E0E DeepSeek \u5B98\u65B9\u8D26\u5355\u53EF\u80FD\u7565\u6709\u5DEE\u5F02\u3002",
  "statsUnavailable": "\u7EDF\u8BA1\u4E0D\u53EF\u7528\uFF08Headroom \u672A\u8FD0\u884C\uFF09"
};
var en = {
  "nav": "Route Switch",
  "title": "Headroom Compression Route",
  "description": "Toggle between direct DeepSeek and the Headroom compression proxy with one click. The change applies to the next request.",
  "current": "Current route",
  "routeDirect": "Direct (api.deepseek.com)",
  "routeHeadroom": "Compressed (Headroom :8787)",
  "routeThirdParty": "Third-party route",
  "savedThirdParty": "Switching to direct will restore {url}",
  "thirdPartyLabel": "Third-party baseURL",
  "thirdPartyPlaceholder": "https://your-gateway.example.com/v1",
  "applyThirdParty": "Use third-party route",
  "thirdPartyHint": "Third-party routes bypass Headroom compression \u2014 DSH posts straight to this URL. To compress it, start Headroom yourself with matching upstream args. Switching to the compressed route saves this URL.",
  "headroomStatus": "Headroom status",
  "headroomHealthy": "Healthy (v{version})",
  "headroomDown": "Unreachable",
  "headroomProbing": "Probing\u2026",
  "switchToHeadroom": "Switch to compressed",
  "switchToDirect": "Switch to direct",
  "switching": "Switching\u2026",
  "switched": "Switched",
  "error": "Operation failed: {message}",
  "headroomDownWarning": "Headroom is unreachable. Requests will fail and DSH will retry; start Headroom first.",
  "notes": "Notes",
  "noteSource": "Compression engine: Headroom (headroomlabs-ai/headroom, Apache-2.0). This plugin only integrates and manages it.",
  "noteCache": "Headroom rewrites are deterministic; prefix cache hit rate is unaffected (measured 97.6%+).",
  "noteQuality": "Compression only touches tool descriptions, never conversation or tool results.",
  "noteFallback": "If the route fails, switch back here with one click. No restart needed.",
  "lifecycle": "Engine management",
  "install": "Install Headroom engine",
  "installing": "Installing\u2026",
  "statsTitle": "Token savings (live)",
  "stat60min": "Tokens spent (last 60 min)",
  "statSavedTotal": "Tokens saved (lifetime)",
  "statLifetimeInput": "Input tokens (lifetime)",
  "statCacheHit": "Cache hit rate",
  "statRequests": "Requests (lifetime)",
  "statsFrozenDirect": "Direct route active \u2014 stats frozen (not growing).",
  "statsNote": `Auto-refreshes every 10s; "last 60 min" is Headroom's activity window (resets after 60 min idle). Token figures come from Headroom's proxy log and may differ slightly from the DeepSeek billing console.`,
  "statsUnavailable": "Stats unavailable (Headroom not running)"
};

// src/client/agentId.ts
function resolveAgentId(sessions) {
  try {
    return sessions?.list?.getSnapshot?.().current;
  } catch {
    return void 0;
  }
}

// src/client/index.ts
var NS = "dsh-headroom";
var inject = ["slots", "locale", "connection", "remote", "remote.commands", "settingsScope", "sessions"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: zh2, en }), "dsh-headroom-suite: copy dictionaries");
  const scope = ctx.settingsScope.bind({ namespace: LLM_DEEPSEEK_NAMESPACE });
  const t = ctx.locale.bind(NS);
  const remote = ctx.get("remote");
  const sessions = ctx.get("sessions");
  const injected = () => ({
    scope,
    t,
    runCommand: async (line) => {
      const agentId = resolveAgentId(sessions);
      if (agentId === void 0) {
        return { kind: "error", text: t("error").replace("{message}", "no active session \u2014 open a session before running host commands") };
      }
      const commands = remote?.commands;
      if (commands?.execute === void 0) {
        return { kind: "error", text: t("error").replace("{message}", "host command channel unavailable") };
      }
      const raw = await commands.execute(agentId, line, []);
      if (raw.ok === false) {
        return { kind: "error", text: t("error").replace("{message}", `${raw.error.message} (${raw.error.code})`) };
      }
      if (raw.value === void 0) {
        return { kind: "error", text: t("error").replace("{message}", `unknown or malformed command: ${line}`) };
      }
      const outcome = raw.value.result;
      return {
        kind: outcome?.kind === "error" ? "error" : "success",
        text: outcome?.text ?? "OK"
      };
    }
  });
  ctx.slots.inject("settings.section", () => {
    ctx.slots.register({
      name: "settings.section",
      id: "dsh-headroom-route",
      order: 20,
      label: () => t("nav"),
      inject: injected
    }, HeadroomPanel);
    ctx.slots.register({
      name: "settings.section",
      id: "dsh-headroom-mgr",
      order: 21,
      label: () => "\u4EE3\u7406\u7BA1\u7406"
    }, ManagerPanel);
    return () => {
    };
  });
}
return module.exports; } });
//# sourceMappingURL=client.js.map
