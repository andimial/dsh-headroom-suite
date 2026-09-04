// src/index.ts
import { spawn as spawn2, execFile } from "node:child_process";
import { existsSync as existsSync2, mkdirSync, writeFileSync } from "node:fs";
import { join as join2 } from "node:path";
import { homedir as homedir2 } from "node:os";

// src/constants.ts
var PLUGIN_NAME = "dsh-headroom";
var HEADROOM_PORT = 8787;
var DEEPSEEK_ANTHROPIC_URL = "https://api.deepseek.com/anthropic";
var DEEPSEEK_OPENAI_URL = "https://api.deepseek.com";
var HEADROOM_BASE_URL = `http://127.0.0.1:${HEADROOM_PORT}/v1`;
var DIRECT_BASE_URL = "https://api.deepseek.com";
var LLM_DEEPSEEK_NAMESPACE = "llm-deepseek";
var HEADROOM_LIVEZ_URL = `http://127.0.0.1:${HEADROOM_PORT}/livez`;

// src/routes.ts
import { spawn, exec } from "node:child_process";
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
var HEADROOM_PORT2 = 8787;
var LIVEZ_URL = `http://127.0.0.1:${HEADROOM_PORT2}/livez`;
var HEADROOM_ENV = {
  HEADROOM_DETECT_BACKEND: "python",
  HEADROOM_TOOL_SEARCH: "off",
  // The Kompress ONNX model (chopratejas/kompress-base) has never completed
  // downloading on this machine (HF cache holds a 0-byte .incomplete blob);
  // proxy startup hangs forever in "Pre-loading compressors and parsers..."
  // trying to fetch it. Skip Kompress so the proxy binds the port; TEXT/CODE
  // compression still works. Remove once the model is cached
  // (set HF_ENDPOINT=https://hf-mirror.com and start without this flag).
  HEADROOM_DISABLE_KOMPRESS: "1"
};
var PLUGIN_HOME = join(homedir(), ".dsh-headroom");
function venvHeadroomExe() {
  return process.platform === "win32" ? join(PLUGIN_HOME, "venv", "Scripts", "headroom.exe") : join(PLUGIN_HOME, "venv", "bin", "headroom");
}
function proxyLogPath() {
  return join(PLUGIN_HOME, "proxy.log");
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
        if (line.includes(`:${HEADROOM_PORT2}`) && line.includes("LISTENING")) {
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
    const livez = await fetchJson(LIVEZ_URL);
    const running = livez !== void 0;
    let pid;
    if (running) pid = await findPortPid();
    let savings;
    if (running) {
      const history = await fetchJson(`http://127.0.0.1:${HEADROOM_PORT2}/stats-history`);
      savings = history?.lifetime;
    }
    return {
      running,
      version: livez?.version,
      pid,
      exe: venvHeadroomExe(),
      port: HEADROOM_PORT2,
      savings: savings ?? null
    };
  }
  const disposers = [
    webServer.register({
      kind: "exact",
      path: "/headroom-mgr/status",
      handler: (_request, response) => {
        void status2().then((s) => sendJson(response, 200, s));
      }
    }),
    webServer.register({
      kind: "exact",
      path: "/headroom-mgr/start",
      handler: async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "method not allowed; use POST" });
          return;
        }
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: "untrusted origin" });
          return;
        }
        const already = await fetchJson(LIVEZ_URL);
        if (already !== void 0) {
          sendJson(response, 200, { ok: true, alreadyRunning: true });
          return;
        }
        try {
          const exe = venvHeadroomExe();
          if (!existsSync(exe)) {
            sendJson(response, 409, { ok: false, error: "headroom not installed; run /headroom-install" });
            return;
          }
          const startArgs = [
            "proxy",
            "--port",
            String(HEADROOM_PORT2),
            "--anthropic-api-url",
            DEEPSEEK_ANTHROPIC_URL,
            "--openai-api-url",
            DEEPSEEK_OPENAI_URL,
            "--host",
            "127.0.0.1",
            "--connect-timeout-seconds",
            "15",
            "--request-timeout-seconds",
            "120",
            "--log-file",
            proxyLogPath()
          ];
          const child = spawn(exe, startArgs, {
            detached: true,
            stdio: "ignore",
            env: { ...process.env, ...HEADROOM_ENV }
          });
          child.unref();
          const deadline = Date.now() + 12e4;
          let live = void 0;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 1500));
            live = await fetchJson(LIVEZ_URL);
            if (live !== void 0) break;
          }
          sendJson(response, 200, {
            ok: true,
            healthyAfterStart: live !== void 0
          });
        } catch (err) {
          sendJson(response, 500, { error: String(err) });
        }
      }
    }),
    webServer.register({
      kind: "exact",
      path: "/headroom-mgr/stop",
      handler: async (request, response) => {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "method not allowed; use POST" });
          return;
        }
        if (!sameOrigin(request)) {
          sendJson(response, 403, { error: "untrusted origin" });
          return;
        }
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
function pluginHome() {
  return join2(homedir2(), ".dsh-headroom");
}
function venvDir() {
  return join2(pluginHome(), "venv");
}
function proxyLogPath2() {
  return join2(pluginHome(), "proxy.log");
}
function startupLogPath() {
  return join2(pluginHome(), "startup.log");
}
function venvPython() {
  return process.platform === "win32" ? join2(venvDir(), "Scripts", "python.exe") : join2(venvDir(), "bin", "python");
}
function venvHeadroom() {
  return process.platform === "win32" ? join2(venvDir(), "Scripts", "headroom.exe") : join2(venvDir(), "bin", "headroom");
}
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
  return existsSync2(venvPython()) && existsSync2(venvHeadroom());
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
        writeFileSync(logPath, Buffer.concat(chunks).toString("utf8"), { flag: "a" });
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
    join2(pluginHome(), "venv-create.log")
  );
  if (createCode !== 0) {
    return { ok: false, message: `Failed to create venv (exit ${createCode}). See ~/.dsh-headroom/venv-create.log` };
  }
  log("Installing headroom-ai[proxy] (lightweight, no torch) ...");
  const pip = process.platform === "win32" ? [venvPython(), "-m", "pip", "install", "--disable-pip-version-check", "headroom-ai[proxy]"] : [venvPython(), "-m", "pip", "install", "--disable-pip-version-check", "headroom-ai[proxy]"];
  const installCode = await run(pip, join2(pluginHome(), "install.log"));
  if (installCode !== 0) {
    return { ok: false, message: "pip install headroom-ai[proxy] failed. See ~/.dsh-headroom/install.log. On Windows, Rust/MSVC may be required (README)." };
  }
  return { ok: true, message: "Headroom installed into plugin venv." };
}
async function startProxy(log) {
  if (!venvReady()) {
    const installed = await ensureInstalled(log);
    if (!installed.ok) return installed;
  }
  mkdirSync(pluginHome(), { recursive: true });
  const health = await probeHealth(1500);
  if (health.healthy) return { ok: true, message: "Headroom already running." };
  const args = [
    "proxy",
    "--port",
    String(HEADROOM_PORT),
    "--anthropic-api-url",
    DEEPSEEK_ANTHROPIC_URL,
    "--openai-api-url",
    DEEPSEEK_OPENAI_URL,
    "--host",
    "127.0.0.1",
    "--connect-timeout-seconds",
    "15",
    "--request-timeout-seconds",
    "120",
    "--log-file",
    proxyLogPath2()
  ];
  try {
    const child = spawn2(venvHeadroom(), args, {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        HEADROOM_DETECT_BACKEND: "python",
        // avoid Windows detect_content_type deadlock
        HEADROOM_TOOL_SEARCH: "off",
        // DeepSeek does not know the Anthropic tool_search type
        // Kompress ONNX model never finished downloading on this machine (0-byte
        // .incomplete blob in the HF cache); proxy hangs in pre-load without this.
        // See routes.ts HEADROOM_ENV for the full note.
        HEADROOM_DISABLE_KOMPRESS: "1"
      }
    });
    child.unref();
    writeFileSync(startupLogPath(), `${(/* @__PURE__ */ new Date()).toISOString()} spawned headroom proxy pid=${child.pid}
`, { flag: "a" });
    log(`Headroom proxy starting (pid ${child.pid}). Waiting for health...`);
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 1e3));
      const now = await probeHealth(1500);
      if (now.healthy) return { ok: true, message: `Headroom healthy (v${now.version ?? "?"}).` };
    }
    return { ok: true, message: "Headroom process started; health check still warming up (cold start)." };
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
var inject = ["commands"];
function apply(ctx) {
  const log = (message) => {
    ctx.logger?.info(`[dsh-headroom-suite] ${message}`);
  };
  ctx.inject(["webServer"], (scoped) => {
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
        const result = await startProxy(log);
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
