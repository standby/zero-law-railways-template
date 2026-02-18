import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import express from "express";
import httpProxy from "http-proxy";
import * as tar from "tar";

// Railway injects PORT at runtime and routes traffic to that port.
const PORT = Number.parseInt(process.env.PORT ?? process.env.ZEROCLAW_PUBLIC_PORT ?? "3000", 10);

// State/workspace directories
// ZeroClaw defaults to ~/.zeroclaw
const STATE_DIR =
  process.env.ZEROCLAW_STATE_DIR?.trim() ||
  path.join(os.homedir(), ".zeroclaw");

const WORKSPACE_DIR =
  process.env.ZEROCLAW_WORKSPACE_DIR?.trim() ||
  path.join(STATE_DIR, "workspace");

// Protect /setup with a user-provided password
const SETUP_PASSWORD = process.env.SETUP_PASSWORD?.trim();

// Gateway admin token
function resolveGatewayToken() {
  const envTok = process.env.ZEROCLAW_GATEWAY_TOKEN?.trim();
  if (envTok) return envTok;

  const tokenPath = path.join(STATE_DIR, "gateway.token");
  try {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    if (existing) return existing;
  } catch {
    // ignore
  }

  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(tokenPath, generated, { encoding: "utf8", mode: 0o600 });
  } catch {
    // best-effort
  }
  return generated;
}

const ZEROCLAW_GATEWAY_TOKEN = resolveGatewayToken();

// Where the gateway will listen internally (we proxy to it)
const INTERNAL_GATEWAY_PORT = Number.parseInt(process.env.INTERNAL_GATEWAY_PORT ?? "18789", 10);
const INTERNAL_GATEWAY_HOST = process.env.INTERNAL_GATEWAY_HOST ?? "127.0.0.1";
const GATEWAY_TARGET = `http://${INTERNAL_GATEWAY_HOST}:${INTERNAL_GATEWAY_PORT}`;

// ZeroClaw binary path
const ZEROCLAW_BIN = process.env.ZEROCLAW_BIN?.trim() || "/usr/local/bin/zeroclaw";

function configPath() {
  // ZeroClaw uses config.toml by default
  return path.join(STATE_DIR, "config.toml");
}

function isConfigured() {
  try {
    return fs.existsSync(configPath());
  } catch {
    return false;
  }
}

let gatewayProc = null;
let gatewayStarting = null;
let lastGatewayError = null;
let lastGatewayExit = null;
let lastDoctorOutput = null;
let lastDoctorAt = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForGatewayReady(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const paths = ["/", "/health"];
      for (const p of paths) {
        try {
          const res = await fetch(`${GATEWAY_TARGET}${p}`, { method: "GET" });
          if (res) return true;
        } catch {
          // try next
        }
      }
    } catch {
      // not ready
    }
    await sleep(250);
  }
  return false;
}

async function startGateway() {
  if (gatewayProc) return;
  if (!isConfigured()) throw new Error("Gateway cannot start: not configured");

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  const args = [
    "gateway",
    "--port",
    String(INTERNAL_GATEWAY_PORT),
  ];

  gatewayProc = childProcess.spawn(ZEROCLAW_BIN, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ZEROCLAW_STATE_DIR: STATE_DIR,
      ZEROCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
    },
  });

  gatewayProc.on("error", (err) => {
    const msg = `[gateway] spawn error: ${String(err)}`;
    console.error(msg);
    lastGatewayError = msg;
    gatewayProc = null;
  });

  gatewayProc.on("exit", (code, signal) => {
    const msg = `[gateway] exited code=${code} signal=${signal}`;
    console.error(msg);
    lastGatewayExit = { code, signal, at: new Date().toISOString() };
    gatewayProc = null;
  });
}

async function runDoctorBestEffort() {
  const now = Date.now();
  if (lastDoctorAt && now - lastDoctorAt < 5 * 60 * 1000) return;
  lastDoctorAt = now;

  try {
    const r = await runCmd(ZEROCLAW_BIN, ["doctor"]);
    const out = redactSecrets(r.output || "");
    lastDoctorOutput = out.length > 50_000 ? out.slice(0, 50_000) + "\n... (truncated)\n" : out;
  } catch (err) {
    lastDoctorOutput = `doctor failed: ${String(err)}`;
  }
}

async function ensureGatewayRunning() {
  if (!isConfigured()) return { ok: false, reason: "not configured" };
  if (gatewayProc) return { ok: true };
  if (!gatewayStarting) {
    gatewayStarting = (async () => {
      try {
        lastGatewayError = null;
        await startGateway();
        const ready = await waitForGatewayReady({ timeoutMs: 20_000 });
        if (!ready) {
          throw new Error("Gateway did not become ready in time");
        }
      } catch (err) {
        const msg = `[gateway] start failure: ${String(err)}`;
        lastGatewayError = msg;
        await runDoctorBestEffort();
        throw err;
      }
    })().finally(() => {
      gatewayStarting = null;
    });
  }
  await gatewayStarting;
  return { ok: true };
}

async function restartGateway() {
  if (gatewayProc) {
    try {
      gatewayProc.kill("SIGTERM");
    } catch {
      // ignore
    }
    await sleep(750);
    gatewayProc = null;
  }
  return ensureGatewayRunning();
}

function requireSetupAuth(req, res, next) {
  if (!SETUP_PASSWORD) {
    return res
      .status(500)
      .type("text/plain")
      .send("SETUP_PASSWORD is not set. Set it in Railway Variables before using /setup.");
  }

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.set("WWW-Authenticate", 'Basic realm="ZeroClaw Setup"');
    return res.status(401).send("Auth required");
  }
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  const password = idx >= 0 ? decoded.slice(idx + 1) : "";
  if (password !== SETUP_PASSWORD) {
    res.set("WWW-Authenticate", 'Basic realm="ZeroClaw Setup"');
    return res.status(401).send("Invalid password");
  }
  return next();
}

// Simple rate limiting for file system operations
// Tracks requests per IP with a sliding window
const rateLimitMap = new Map();
function rateLimit(maxRequests = 30, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || "unknown";
    const now = Date.now();
    
    if (!rateLimitMap.has(ip)) {
      rateLimitMap.set(ip, []);
    }
    
    const requests = rateLimitMap.get(ip);
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({ 
        ok: false, 
        error: "Too many requests. Please try again later." 
      });
    }
    
    validRequests.push(now);
    rateLimitMap.set(ip, validRequests);
    
    // Cleanup old entries periodically
    if (Math.random() < 0.01) {
      for (const [key, times] of rateLimitMap.entries()) {
        const valid = times.filter(t => now - t < windowMs);
        if (valid.length === 0) {
          rateLimitMap.delete(key);
        } else {
          rateLimitMap.set(key, valid);
        }
      }
    }
    
    next();
  };
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Minimal health endpoint for Railway
app.get("/setup/healthz", (_req, res) => res.json({ ok: true }));

async function probeGateway() {
  const net = await import("node:net");

  return await new Promise((resolve) => {
    const sock = net.createConnection({
      host: INTERNAL_GATEWAY_HOST,
      port: INTERNAL_GATEWAY_PORT,
      timeout: 750,
    });

    const done = (ok) => {
      try { sock.destroy(); } catch {}
      resolve(ok);
    };

    sock.on("connect", () => done(true));
    sock.on("timeout", () => done(false));
    sock.on("error", () => done(false));
  });
}

app.get("/healthz", async (_req, res) => {
  let gatewayReachable = false;
  if (isConfigured()) {
    try {
      gatewayReachable = await probeGateway();
    } catch {
      gatewayReachable = false;
    }
  }

  res.json({
    ok: true,
    wrapper: {
      configured: isConfigured(),
      stateDir: STATE_DIR,
      workspaceDir: WORKSPACE_DIR,
    },
    gateway: {
      target: GATEWAY_TARGET,
      reachable: gatewayReachable,
      lastError: lastGatewayError,
      lastExit: lastGatewayExit,
      lastDoctorAt,
    },
  });
});

app.get("/setup/app.js", requireSetupAuth, rateLimit(60, 60000), (_req, res) => {
  res.type("application/javascript");
  res.send(fs.readFileSync(path.join(process.cwd(), "src", "setup-app.js"), "utf8"));
});

app.get("/setup", requireSetupAuth, (_req, res) => {
  res.type("html").send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ZeroClaw Setup</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 2rem; max-width: 900px; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 1.25rem; margin: 1rem 0; }
    label { display:block; margin-top: 0.75rem; font-weight: 600; }
    input, select { width: 100%; padding: 0.6rem; margin-top: 0.25rem; }
    button { padding: 0.8rem 1.2rem; border-radius: 10px; border: 0; background: #111; color: #fff; font-weight: 700; cursor: pointer; }
    code { background: #f6f6f6; padding: 0.1rem 0.3rem; border-radius: 6px; }
    .muted { color: #555; }
  </style>
</head>
<body>
  <h1>🦀 ZeroClaw Setup</h1>
  <p class="muted">This wizard configures ZeroClaw for Railway deployment with persistent storage.</p>

  <div class="card">
    <h2>Status</h2>
    <div id="status">Loading...</div>
    <div id="statusDetails" class="muted" style="margin-top:0.5rem"></div>
    <div style="margin-top: 0.75rem">
      <a href="/" target="_blank">Open ZeroClaw</a>
      &nbsp;|&nbsp;
      <a href="/setup/export" target="_blank">Download backup (.tar.gz)</a>
    </div>
  </div>

  <div class="card">
    <h2>Debug console</h2>
    <p class="muted">Run ZeroClaw commands for debugging and recovery.</p>

    <div style="display:flex; gap:0.5rem; align-items:center">
      <select id="consoleCmd" style="flex: 1">
        <option value="gateway.restart">gateway.restart (wrapper-managed)</option>
        <option value="gateway.stop">gateway.stop (wrapper-managed)</option>
        <option value="gateway.start">gateway.start (wrapper-managed)</option>
        <option value="zeroclaw.status">zeroclaw status</option>
        <option value="zeroclaw.doctor">zeroclaw doctor</option>
        <option value="zeroclaw.version">zeroclaw --version</option>
      </select>
      <button id="consoleRun" style="background:#0f172a">Run</button>
    </div>
    <pre id="consoleOut" style="white-space:pre-wrap"></pre>
  </div>

  <div class="card">
    <h2>1) Provider & API Key</h2>
    <p class="muted">Configure your AI provider for ZeroClaw.</p>
    
    <label>Provider</label>
    <select id="provider">
      <option value="openrouter">OpenRouter</option>
      <option value="openai">OpenAI</option>
      <option value="anthropic">Anthropic</option>
      <option value="openai-codex">OpenAI Codex</option>
    </select>

    <label>API Key</label>
    <input id="apiKey" type="password" placeholder="Your API key" />
  </div>

  <div class="card">
    <h2>2) Optional: Channels</h2>
    <p class="muted">Configure messaging channels (Telegram, Discord, Slack).</p>

    <label>Telegram bot token (optional)</label>
    <input id="telegramToken" type="password" placeholder="123456:ABC..." />
    <div class="muted" style="margin-top: 0.25rem">
      Get it from BotFather: open Telegram, message <code>@BotFather</code>, run <code>/newbot</code>, then copy the token.
    </div>

    <label>Discord bot token (optional)</label>
    <input id="discordToken" type="password" placeholder="Bot token" />
    <div class="muted" style="margin-top: 0.25rem">
      Get it from the Discord Developer Portal: create an application, add a Bot, then copy the Bot Token.
    </div>
  </div>

  <div class="card">
    <h2>3) Run onboarding</h2>
    <button id="run">Run setup</button>
    <button id="reset" style="background:#444; margin-left:0.5rem">Reset setup</button>
    <pre id="log" style="white-space:pre-wrap"></pre>
    <p class="muted">Reset deletes the ZeroClaw config file so you can rerun onboarding.</p>
  </div>

  <script src="/setup/app.js"></script>
</body>
</html>`);
});

const AUTH_GROUPS = [
  { value: "openrouter", label: "OpenRouter", hint: "API key" },
  { value: "openai", label: "OpenAI", hint: "API key" },
  { value: "anthropic", label: "Anthropic", hint: "API key" },
  { value: "openai-codex", label: "OpenAI Codex", hint: "OAuth" },
];

app.get("/setup/api/status", requireSetupAuth, async (_req, res) => {
  const version = await runCmd(ZEROCLAW_BIN, ["--version"]);

  res.json({
    configured: isConfigured(),
    gatewayTarget: GATEWAY_TARGET,
    zeroclawVersion: version.output.trim(),
    authGroups: AUTH_GROUPS,
  });
});

app.get("/setup/api/auth-groups", requireSetupAuth, (_req, res) => {
  res.json({ ok: true, authGroups: AUTH_GROUPS });
});

function buildOnboardArgs(payload) {
  const args = [
    "onboard",
    "--api-key",
    payload.apiKey || "",
    "--provider",
    payload.provider || "openrouter",
  ];

  // Add channel configuration if provided
  if (payload.telegramToken?.trim()) {
    // ZeroClaw will handle channel configuration through config after onboarding
  }

  if (payload.discordToken?.trim()) {
    // ZeroClaw will handle channel configuration through config after onboarding
  }

  return args;
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 120_000;

    const proc = childProcess.spawn(cmd, args, {
      ...opts,
      env: {
        ...process.env,
        ZEROCLAW_STATE_DIR: STATE_DIR,
        ZEROCLAW_WORKSPACE_DIR: WORKSPACE_DIR,
      },
    });

    let out = "";
    proc.stdout?.on("data", (d) => (out += d.toString("utf8")));
    proc.stderr?.on("data", (d) => (out += d.toString("utf8")));

    let killTimer;
    const timer = setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch {}
      killTimer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch {}
      }, 2_000);
      out += `\n[timeout] Command exceeded ${timeoutMs}ms and was terminated.\n`;
      resolve({ code: 124, output: out });
    }, timeoutMs);

    proc.on("error", (err) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      out += `\n[spawn error] ${String(err)}\n`;
      resolve({ code: 127, output: out });
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ code: code ?? 0, output: out });
    });
  });
}

app.post("/setup/api/run", requireSetupAuth, rateLimit(10, 60000), async (req, res) => {
  try {
    if (isConfigured()) {
      await ensureGatewayRunning();
      return res.json({ ok: true, output: "Already configured.\nUse Reset setup if you want to rerun onboarding.\n" });
    }

    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

    const payload = req.body || {};

    let onboardArgs;
    try {
      onboardArgs = buildOnboardArgs(payload);
    } catch (err) {
      return res.status(400).json({ ok: false, output: `Setup input error: ${String(err)}` });
    }

    const onboard = await runCmd(ZEROCLAW_BIN, onboardArgs);
    const ok = onboard.code === 0 && isConfigured();

    let extra = "";

    // Configure channels if tokens were provided
    if (ok) {
      if (payload.telegramToken?.trim()) {
        const token = payload.telegramToken.trim();
        const bindResult = await runCmd(ZEROCLAW_BIN, ["channel", "bind-telegram", token]);
        extra += `\n[telegram] exit=${bindResult.code}\n${bindResult.output || ""}`;
      }

      if (payload.discordToken?.trim()) {
        // Discord configuration would go here
        extra += `\n[discord] Configuration not yet implemented in ZeroClaw\n`;
      }

      // Start the gateway
      await restartGateway();
    }

    return res.status(ok ? 200 : 500).json({
      ok,
      output: `${onboard.output}${extra}`,
    });
  } catch (err) {
    console.error("[/setup/api/run] error:", err);
    return res.status(500).json({ ok: false, output: `Internal error: ${String(err)}` });
  }
});

app.get("/setup/api/debug", requireSetupAuth, async (_req, res) => {
  const v = await runCmd(ZEROCLAW_BIN, ["--version"]);

  res.json({
    wrapper: {
      node: process.version,
      port: PORT,
      publicPortEnv: process.env.PORT || null,
      stateDir: STATE_DIR,
      workspaceDir: WORKSPACE_DIR,
      configured: isConfigured(),
      configPath: configPath(),
      internalGatewayHost: INTERNAL_GATEWAY_HOST,
      internalGatewayPort: INTERNAL_GATEWAY_PORT,
      gatewayTarget: GATEWAY_TARGET,
      gatewayRunning: Boolean(gatewayProc),
      lastGatewayError,
      lastGatewayExit,
      lastDoctorAt,
      lastDoctorOutput,
      railwayCommit: process.env.RAILWAY_GIT_COMMIT_SHA || null,
    },
    zeroclaw: {
      bin: ZEROCLAW_BIN,
      version: v.output.trim(),
    },
  });
});

function redactSecrets(text) {
  if (!text) return text;
  return String(text)
    .replace(/(sk-[A-Za-z0-9_-]{10,})/g, "[REDACTED]")
    .replace(/(gho_[A-Za-z0-9_]{10,})/g, "[REDACTED]")
    .replace(/(xox[baprs]-[A-Za-z0-9-]{10,})/g, "[REDACTED]")
    .replace(/(\d{5,}:[A-Za-z0-9_-]{10,})/g, "[REDACTED]")
    .replace(/(AA[A-Za-z0-9_-]{10,}:\S{10,})/g, "[REDACTED]");
}

const ALLOWED_CONSOLE_COMMANDS = new Set([
  "gateway.restart",
  "gateway.stop",
  "gateway.start",
  "zeroclaw.version",
  "zeroclaw.status",
  "zeroclaw.doctor",
]);

app.post("/setup/api/console/run", requireSetupAuth, async (req, res) => {
  const payload = req.body || {};
  const cmd = String(payload.cmd || "").trim();

  if (!ALLOWED_CONSOLE_COMMANDS.has(cmd)) {
    return res.status(400).json({ ok: false, error: "Command not allowed" });
  }

  try {
    if (cmd === "gateway.restart") {
      await restartGateway();
      return res.json({ ok: true, output: "Gateway restarted (wrapper-managed).\n" });
    }
    if (cmd === "gateway.stop") {
      if (gatewayProc) {
        try { gatewayProc.kill("SIGTERM"); } catch {}
        await sleep(750);
        gatewayProc = null;
      }
      return res.json({ ok: true, output: "Gateway stopped (wrapper-managed).\n" });
    }
    if (cmd === "gateway.start") {
      const r = await ensureGatewayRunning();
      return res.json({ ok: Boolean(r.ok), output: r.ok ? "Gateway started.\n" : `Gateway not started: ${r.reason}\n` });
    }

    if (cmd === "zeroclaw.version") {
      const r = await runCmd(ZEROCLAW_BIN, ["--version"]);
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "zeroclaw.status") {
      const r = await runCmd(ZEROCLAW_BIN, ["status"]);
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }
    if (cmd === "zeroclaw.doctor") {
      const r = await runCmd(ZEROCLAW_BIN, ["doctor"]);
      return res.status(r.code === 0 ? 200 : 500).json({ ok: r.code === 0, output: redactSecrets(r.output) });
    }

    return res.status(400).json({ ok: false, error: "Unhandled command" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post("/setup/api/reset", requireSetupAuth, rateLimit(5, 60000), async (_req, res) => {
  try {
    if (gatewayProc) {
      try { gatewayProc.kill("SIGTERM"); } catch {}
      await sleep(750);
      gatewayProc = null;
    }

    const p = configPath();
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }

    return res.json({ ok: true, output: "Reset complete. Config deleted.\n" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// Backup/export endpoint
app.get("/setup/export", requireSetupAuth, rateLimit(5, 300000), async (_req, res) => {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      return res.status(404).type("text/plain").send("No state directory to export");
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zeroclaw-export-"));
    const tarPath = path.join(tmpDir, "zeroclaw-backup.tar.gz");

    await tar.create(
      {
        gzip: true,
        file: tarPath,
        cwd: path.dirname(STATE_DIR),
      },
      [path.basename(STATE_DIR)]
    );

    res.download(tarPath, "zeroclaw-backup.tar.gz", (err) => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
      if (err) console.error("Export download error:", err);
    });
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).type("text/plain").send(`Export failed: ${String(err)}`);
  }
});

// Proxy all other traffic to the gateway
const proxy = httpProxy.createProxyServer({
  target: GATEWAY_TARGET,
  ws: true,
  changeOrigin: true,
});

proxy.on("error", (err, req, res) => {
  console.error("[proxy error]", err);
  if (!res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
  }
  if (!res.writableEnded) {
    res.end("Bad Gateway: ZeroClaw gateway not available");
  }
});

app.use((req, res) => {
  if (!isConfigured()) {
    return res.redirect(302, "/setup");
  }
  proxy.web(req, res);
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[wrapper] listening on port ${PORT}`);
  console.log(`[wrapper] state directory: ${STATE_DIR}`);
  console.log(`[wrapper] workspace directory: ${WORKSPACE_DIR}`);
  console.log(`[wrapper] gateway target: ${GATEWAY_TARGET}`);
  console.log(`[wrapper] configured: ${isConfigured()}`);

  // Start gateway if already configured
  if (isConfigured()) {
    ensureGatewayRunning().catch((err) => {
      console.error("[wrapper] failed to start gateway on boot:", err);
    });
  }
});

server.on("upgrade", (req, socket, head) => {
  if (!isConfigured()) {
    socket.destroy();
    return;
  }
  proxy.ws(req, socket, head);
});

process.on("SIGTERM", () => {
  console.log("[wrapper] SIGTERM received, shutting down...");
  server.close(() => {
    if (gatewayProc) {
      try { gatewayProc.kill("SIGTERM"); } catch {}
    }
    process.exit(0);
  });
});
