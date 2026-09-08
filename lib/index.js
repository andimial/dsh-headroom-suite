// src/index.ts
import { spawn as spawn2, execFile } from "node:child_process";
import { existsSync as existsSync3, mkdirSync, writeFileSync as writeFileSync2 } from "node:fs";

// src/constants.ts
var PLUGIN_NAME = "dsh-headroom";
var HEADROOM_PORT = 8787;
var DEEPSEEK_ANTHROPIC_URL = "https://api.deepseek.com/anthropic";
var DEEPSEEK_OPENAI_URL = "https://api.deepseek.com";
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

// src/paths.ts
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function pluginHome() {
  return join(homedir(), ".dsh-headroom");
}
function venvDir() {
  return join(pluginHome(), "venv");
}
function venvPython() {
  return process.platform === "win32" ? join(venvDir(), "Scripts", "python.exe") : join(venvDir(), "bin", "python");
}
function venvHeadroom() {
  return process.platform === "win32" ? join(venvDir(), "Scripts", "headroom.exe") : join(venvDir(), "bin", "headroom");
}
function proxyLogPath() {
  return join(pluginHome(), "proxy.log");
}
function startupLogPath() {
  return join(pluginHome(), "startup.log");
}
function appendStartupLog(line) {
  try {
    writeFileSync(startupLogPath(), line, { flag: "a" });
  } catch {
  }
}
function venvCreateLogPath() {
  return join(pluginHome(), "venv-create.log");
}
function installLogPath() {
  return join(pluginHome(), "install.log");
}
var SAVED_BASEURL_PATH = join(pluginHome(), "saved-baseurl");
function readSavedBaseURL() {
  try {
    if (!existsSync(SAVED_BASEURL_PATH)) return void 0;
    const value = readFileSync(SAVED_BASEURL_PATH, "utf8").trim();
    return value.length > 0 ? value : void 0;
  } catch {
    return void 0;
  }
}
function writeSavedBaseURL(baseURL) {
  writeFileSync(SAVED_BASEURL_PATH, baseURL, "utf8");
}
function deleteSavedBaseURL() {
  try {
    unlinkSync(SAVED_BASEURL_PATH);
    return true;
  } catch (error) {
    return error?.code === "ENOENT";
  }
}

// src/routes.ts
import { spawn, exec } from "node:child_process";
import { existsSync as existsSync2 } from "node:fs";
import { request as httpRequest } from "node:http";

// src/spawn.ts
var ANTHROPIC_DISABLED_URL = "http://127.0.0.1:9";
function readSettingsBaseURL(ctx) {
  const section = ctx.settings.get(LLM_DEEPSEEK_NAMESPACE);
  return typeof section?.baseURL === "string" ? section.baseURL : void 0;
}
function buildProxySpawnPlan(upstream, logFile = proxyLogPath()) {
  let anthropicTarget;
  if (upstream.anthropicEnabled) {
    if (upstream.anthropicApiUrl === void 0) {
      throw new Error("resolved upstream enables anthropic but carries no anthropic URL");
    }
    anthropicTarget = upstream.anthropicApiUrl;
  } else {
    anthropicTarget = ANTHROPIC_DISABLED_URL;
  }
  const args = [
    "proxy",
    "--port",
    String(HEADROOM_PORT),
    "--anthropic-api-url",
    anthropicTarget,
    "--openai-api-url",
    upstream.openaiApiUrl,
    "--host",
    "127.0.0.1",
    "--connect-timeout-seconds",
    "15",
    "--request-timeout-seconds",
    "120",
    "--log-file",
    logFile
  ];
  return {
    args,
    env: { ...process.env, ...upstream.envPreset },
    upstream: {
      kind: upstream.kind,
      openaiApiUrl: upstream.openaiApiUrl,
      anthropicApiUrl: anthropicTarget
    }
  };
}
function formatUpstream(u) {
  return `upstream=${u.kind} openai=${u.openaiApiUrl} anthropic=${u.anthropicApiUrl}`;
}
function startupLogLine(plan, pid) {
  return `${(/* @__PURE__ */ new Date()).toISOString()} spawned headroom proxy pid=${pid ?? "?"} ${formatUpstream(plan.upstream)}
`;
}

// src/upstream.ts
var HEADROOM_ENV_PRESET = {
  HEADROOM_DETECT_BACKEND: "python",
  HEADROOM_TOOL_SEARCH: "off",
  HEADROOM_DISABLE_KOMPRESS: "1"
};
var OFFICIAL_UPSTREAM = {
  kind: "official",
  openaiApiUrl: DEEPSEEK_OPENAI_URL,
  anthropicEnabled: true,
  anthropicApiUrl: DEEPSEEK_ANTHROPIC_URL,
  envPreset: HEADROOM_ENV_PRESET
};
function thirdPartyUpstream(openaiApiUrl) {
  return {
    kind: "third-party",
    openaiApiUrl,
    anthropicEnabled: false,
    anthropicApiUrl: void 0,
    envPreset: HEADROOM_ENV_PRESET
  };
}
function savedThirdPartyAddress(savedFileContent) {
  const value = savedFileContent?.trim();
  if (value === void 0 || value.length === 0) return void 0;
  return isUsableThirdPartyBaseURL(value) ? value : void 0;
}
function resolveExpectedUpstream(currentBaseURL, savedFileContent) {
  const current = currentBaseURL?.trim();
  const route = routeOf(current);
  if (current !== void 0 && route === "third-party") {
    return thirdPartyUpstream(current);
  }
  if (route === "headroom") {
    const saved = savedThirdPartyAddress(savedFileContent);
    if (saved !== void 0) return thirdPartyUpstream(saved);
  }
  return OFFICIAL_UPSTREAM;
}

// src/routes.ts
function isThirdPartyBaseURL(baseURL) {
  return typeof baseURL === "string" && routeOf(baseURL) === "third-party";
}
function sameOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (origin === void 0 || host === void 0) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
function sendJson(response, status2, body) {
  response.writeHead(status2, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}
function guardWrite(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "method not allowed; use POST" });
    return false;
  }
  if (!sameOrigin(request)) {
    sendJson(response, 403, { error: "untrusted origin" });
    return false;
  }
  return true;
}
var MAX_BODY_BYTES = 64 * 1024;
function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(c);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}
function fetchJson(url, timeoutMs = 3e3) {
  return new Promise((resolve) => {
    const req = httpRequest(url, { method: "GET", timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          resolve(void 0);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(void 0);
    });
    req.on("error", () => resolve(void 0));
    req.end();
  });
}
function findPortPid() {
  return new Promise((resolve) => {
    exec(`netstat -ano`, { encoding: "utf8" }, (err, stdout) => {
      if (err) return resolve(void 0);
      for (const line of stdout.split("\n")) {
        if (line.includes(`:${HEADROOM_PORT}`) && line.includes("LISTENING")) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (/^\d+$/.test(pid)) return resolve(pid);
        }
      }
      resolve(void 0);
    });
  });
}
function killPid(pid) {
  return new Promise((resolve) => {
    exec(`taskkill /F /PID ${pid}`, (err) => resolve(!err));
  });
}
function mountManagerRoutes(ctx) {
  const webServer = ctx.get("webServer");
  if (webServer === void 0) {
    console.error("[dsh-headroom-suite] webServer absent \u2014 routes not mounted");
    return () => {
    };
  }
  async function status2() {
    const livez = await fetchJson(HEADROOM_LIVEZ_URL);
    const running = livez !== void 0;
    let pid;
    if (running) pid = await findPortPid();
    let savings;
    if (running) {
      const history = await fetchJson(`http://127.0.0.1:${HEADROOM_PORT}/stats-history`);
      savings = history?.lifetime;
    }
    return {
      running,
      version: livez?.version,
      pid,
      exe: venvHeadroom(),
      port: HEADROOM_PORT,
      savings: savings ?? null,
      savedBaseURL: readSavedBaseURL() ?? null
    };
  }
  async function applyRoute(body) {
    const target = body.target;
    if (target !== "direct" && target !== "headroom" && target !== "third-party") {
      return { status: 400, body: { error: 'target must be "direct", "headroom" or "third-party"' } };
    }
    if (target === "headroom") {
      const current = readSettingsBaseURL(ctx);
      const saved2 = isThirdPartyBaseURL(current) ? current : void 0;
      const prevSaved = readSavedBaseURL();
      let staleCleanupFailed = false;
      if (saved2 !== void 0) writeSavedBaseURL(saved2);
      else staleCleanupFailed = !deleteSavedBaseURL();
      try {
        await ctx.settings.mutate(LLM_DEEPSEEK_NAMESPACE, [{ op: "set", path: ["baseURL"], value: HEADROOM_BASE_URL }]);
      } catch (error) {
        if (prevSaved !== void 0) writeSavedBaseURL(prevSaved);
        else deleteSavedBaseURL();
        throw error;
      }
      return { status: 200, body: { ok: true, savedBaseURL: saved2 ?? null, sidecarCleanupFailed: staleCleanupFailed } };
    }
    if (target === "third-party") {
      const requested = typeof body.baseURL === "string" ? body.baseURL.trim() : "";
      if (!isUsableThirdPartyBaseURL(requested)) {
        return { status: 400, body: { error: "baseURL must be a third-party http(s) endpoint" } };
      }
      await ctx.settings.mutate(LLM_DEEPSEEK_NAMESPACE, [{ op: "set", path: ["baseURL"], value: requested }]);
      const removed = deleteSavedBaseURL();
      return { status: 200, body: { ok: true, baseURL: requested, sidecarCleanupFailed: !removed } };
    }
    const saved = readSavedBaseURL();
    if (saved !== void 0) {
      await ctx.settings.mutate(LLM_DEEPSEEK_NAMESPACE, [{ op: "set", path: ["baseURL"], value: saved }]);
      const removed = deleteSavedBaseURL();
      return { status: 200, body: { ok: true, restoredBaseURL: saved, sidecarCleanupFailed: !removed } };
    }
    await ctx.settings.mutate(LLM_DEEPSEEK_NAMESPACE, [{ op: "unset", path: ["baseURL"] }]);
    return { status: 200, body: { ok: true, restoredBaseURL: null } };
  }
  let routeQueue = Promise.resolve();
  const disposers = [
    webServer.register({
      kind: "exact",
      path: MGR_STATUS_PATH,
      handler: (_request, response) => {
        void status2().then((s) => sendJson(response, 200, s));
      }
    }),
    webServer.register({
      kind: "exact",
      path: MGR_ROUTE_PATH,
      handler: async (request, response) => {
        if (!guardWrite(request, response)) return;
        let parsed;
        try {
          parsed = JSON.parse(await readBody(request));
        } catch {
          sendJson(response, 400, { error: "invalid JSON body" });
          return;
        }
        const outcome = routeQueue.then(() => applyRoute(parsed));
        routeQueue = outcome.catch(() => {
        });
        try {
          const result = await outcome;
          sendJson(response, result.status, result.body);
        } catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      }
    }),
    webServer.register({
      kind: "exact",
      path: MGR_START_PATH,
      handler: async (request, response) => {
        if (!guardWrite(request, response)) return;
        const already = await fetchJson(HEADROOM_LIVEZ_URL);
        if (already !== void 0) {
          sendJson(response, 200, { ok: true, alreadyRunning: true });
          return;
        }
        try {
          const exe = venvHeadroom();
          if (!existsSync2(exe)) {
            sendJson(response, 409, { ok: false, error: "headroom not installed; run /headroom-install" });
            return;
          }
          const plan = buildProxySpawnPlan(
            resolveExpectedUpstream(readSettingsBaseURL(ctx), readSavedBaseURL()),
            proxyLogPath()
          );
          const child = spawn(exe, [...plan.args], {
            detached: true,
            stdio: "ignore",
            env: plan.env
          });
          child.unref();
          appendStartupLog(startupLogLine(plan, child.pid));
          const deadline = Date.now() + 12e4;
          let live = void 0;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 1500));
            live = await fetchJson(HEADROOM_LIVEZ_URL);
            if (live !== void 0) break;
          }
          sendJson(response, 200, {
            ok: true,
            healthyAfterStart: live !== void 0,
            upstream: plan.upstream
          });
        } catch (err) {
          sendJson(response, 500, { error: String(err) });
        }
      }
    }),
    webServer.register({
      kind: "exact",
      path: MGR_STOP_PATH,
      handler: async (request, response) => {
        if (!guardWrite(request, response)) return;
        const pid = await findPortPid();
        if (pid === void 0) {
          sendJson(response, 200, { ok: true, wasRunning: false });
          return;
        }
        const killed = await killPid(pid);
        sendJson(response, killed ? 200 : 500, {
          ok: killed,
          stoppedPid: killed ? pid : void 0
        });
      }
    })
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}

// src/index.ts
function findSystemPython() {
  const candidates = process.platform === "win32" ? ["python", "py -3.13", "py -3.12", "py -3.11", "py -3.10"] : ["python3", "python"];
  return new Promise((resolve) => {
    let index = 0;
    const tryNext = () => {
      if (index >= candidates.length) {
        resolve(void 0);
        return;
      }
      const candidate = candidates[index++];
      execFile(candidate.split(" ")[0], [...candidate.split(" ").slice(1), "--version"], { timeout: 8e3 }, (error, stdout, stderr) => {
        if (!error && /Python 3\.(1[0-9]|[0-9])/.test(`${stdout}${stderr}`)) resolve(candidate);
        else tryNext();
      });
    };
    tryNext();
  });
}
function venvReady() {
  return existsSync3(venvPython()) && existsSync3(venvHeadroom());
}
async function probeHealth(timeoutMs = 3e3) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`http://127.0.0.1:${HEADROOM_PORT}/livez`, { signal: controller.signal });
      if (!response.ok) return { healthy: false };
      const body = await response.json();
      return { healthy: true, version: typeof body.version === "string" ? body.version : void 0 };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { healthy: false };
  }
}
function run(command, logPath) {
  return new Promise((resolve) => {
    const child = spawn2(command[0], command.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32" ? true : false,
      env: { ...process.env }
    });
    const chunks = [];
    child.stdout?.on("data", (c) => chunks.push(c));
    child.stderr?.on("data", (c) => chunks.push(c));
    child.on("close", (code) => {
      try {
        writeFileSync2(logPath, Buffer.concat(chunks).toString("utf8"), { flag: "a" });
      } catch {
      }
      resolve(code ?? -1);
    });
  });
}
async function ensureInstalled(log) {
  mkdirSync(pluginHome(), { recursive: true });
  if (venvReady()) return { ok: true, message: "Headroom already installed (plugin venv)." };
  const systemPython = await findSystemPython();
  if (systemPython === void 0) {
    return { ok: false, message: "No Python 3.10+ found. Install Python first (Windows: also need MSVC Build Tools + Rust, see README)." };
  }
  log(`Creating venv with ${systemPython} ...`);
  const createCode = await run(
    process.platform === "win32" ? [systemPython, "-m", "venv", venvDir()] : [...systemPython.split(" "), "-m", "venv", venvDir()],
    venvCreateLogPath()
  );
  if (createCode !== 0) {
    return { ok: false, message: `Failed to create venv (exit ${createCode}). See ~/.dsh-headroom/venv-create.log` };
  }
  log("Installing headroom-ai[proxy] (lightweight, no torch) ...");
  const pip = process.platform === "win32" ? [venvPython(), "-m", "pip", "install", "--disable-pip-version-check", "headroom-ai[proxy]"] : [venvPython(), "-m", "pip", "install", "--disable-pip-version-check", "headroom-ai[proxy]"];
  const installCode = await run(pip, installLogPath());
  if (installCode !== 0) {
    return { ok: false, message: "pip install headroom-ai[proxy] failed. See ~/.dsh-headroom/install.log. On Windows, Rust/MSVC may be required (README)." };
  }
  return { ok: true, message: "Headroom installed into plugin venv." };
}
async function startProxy(log, getBaseURL) {
  if (!venvReady()) {
    const installed = await ensureInstalled(log);
    if (!installed.ok) return installed;
  }
  mkdirSync(pluginHome(), { recursive: true });
  const health = await probeHealth(1500);
  if (health.healthy) return { ok: true, message: "Headroom already running." };
  const plan = buildProxySpawnPlan(resolveExpectedUpstream(getBaseURL(), readSavedBaseURL()), proxyLogPath());
  try {
    const child = spawn2(venvHeadroom(), [...plan.args], {
      detached: true,
      stdio: "ignore",
      env: plan.env
    });
    child.unref();
    appendStartupLog(startupLogLine(plan, child.pid));
    log(`Headroom proxy starting (pid ${child.pid}, ${formatUpstream(plan.upstream)}). Waiting for health...`);
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 1e3));
      const now = await probeHealth(1500);
      if (now.healthy) {
        return {
          ok: true,
          message: `Headroom healthy (v${now.version ?? "?"}). ${formatUpstream(plan.upstream)}.`,
          upstream: plan.upstream
        };
      }
    }
    return {
      ok: true,
      message: `Headroom process started; health check still warming up (cold start). ${formatUpstream(plan.upstream)}.`,
      upstream: plan.upstream
    };
  } catch (error) {
    return { ok: false, message: `Failed to start Headroom: ${error instanceof Error ? error.message : String(error)}` };
  }
}
async function stopProxy(log) {
  const health = await probeHealth(1500);
  if (!health.healthy) return { ok: true, message: "Headroom is not running." };
  const owner = await new Promise((resolve) => {
    execFile("powershell", [
      "-NoProfile",
      "-Command",
      `(Get-NetTCPConnection -LocalPort ${HEADROOM_PORT} -State Listen -ErrorAction SilentlyContinue).OwningProcess`
    ], { timeout: 8e3 }, (error, stdout) => {
      if (error) {
        resolve(void 0);
        return;
      }
      const pid = Number(String(stdout).trim());
      resolve(Number.isInteger(pid) && pid > 0 ? pid : void 0);
    });
  });
  if (owner !== void 0) {
    await new Promise((resolve) => {
      execFile("taskkill", ["/PID", String(owner), "/T", "/F"], { timeout: 8e3 }, () => resolve());
    });
  } else {
    await new Promise((resolve) => {
      execFile("taskkill", ["/F", "/IM", "headroom.exe"], { timeout: 8e3 }, () => resolve());
    });
  }
  log("Headroom proxy stopped.");
  return { ok: true, message: "Headroom proxy stopped." };
}
async function status() {
  const [health, py] = await Promise.all([probeHealth(2e3), findSystemPython()]);
  return {
    installed: venvReady(),
    running: health.healthy,
    healthy: health.healthy,
    version: health.version,
    python: py
  };
}
var inject = ["commands", "settings"];
function apply(ctx) {
  const log = (message) => {
    ctx.logger?.info(`[dsh-headroom-suite] ${message}`);
  };
  ctx.inject(["settings", "webServer"], (scoped) => {
    scoped.effect(() => mountManagerRoutes(scoped), "dsh-headroom-suite http routes");
  });
  ctx.effect(function* () {
    yield ctx.commands.register({
      name: "headroom-status",
      description: "Show Headroom proxy status (installed / running / healthy)",
      handler: async () => {
        const s = await status();
        const text = [
          `Headroom: ${s.healthy ? `healthy v${s.version ?? "?"}` : s.running ? "running (not healthy yet)" : "not running"}`,
          `Installed: ${s.installed ? "yes (plugin venv)" : "no (run /headroom install)"}`,
          `Python: ${s.python ?? "not found"}`
        ].join("\n");
        return { kind: "success", text };
      }
    });
    yield ctx.commands.register({
      name: "headroom-install",
      description: "Install the Headroom compression engine into the plugin venv",
      handler: async () => {
        const result = await ensureInstalled(log);
        return { kind: result.ok ? "success" : "error", text: result.message };
      }
    });
    yield ctx.commands.register({
      name: "headroom-start",
      description: "Start the Headroom compression proxy (with DeepSeek compatibility presets)",
      handler: async () => {
        const result = await startProxy(log, () => readSettingsBaseURL(ctx));
        return { kind: result.ok ? "success" : "error", text: result.message };
      }
    });
    yield ctx.commands.register({
      name: "headroom-stop",
      description: "Stop the Headroom compression proxy",
      handler: async () => {
        const result = await stopProxy(log);
        return { kind: result.ok ? "success" : "error", text: result.message };
      }
    });
  }, "dsh-headroom command lifecycle");
}
export {
  DEEPSEEK_ANTHROPIC_URL,
  DEEPSEEK_OPENAI_URL,
  DIRECT_BASE_URL,
  HEADROOM_BASE_URL,
  HEADROOM_LIVEZ_URL,
  HEADROOM_PORT,
  LLM_DEEPSEEK_NAMESPACE,
  PLUGIN_NAME,
  apply,
  ensureInstalled,
  inject,
  probeHealth,
  startProxy,
  status,
  stopProxy
};
//# sourceMappingURL=index.js.map
