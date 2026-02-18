// Client-side JavaScript for ZeroClaw setup wizard
(function() {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const log = (msg) => {
    const el = $("#log");
    if (el) {
      el.textContent += msg + "\n";
      el.scrollTop = el.scrollHeight;
    }
  };

  const setStatus = (msg, details = "") => {
    const statusEl = $("#status");
    const detailsEl = $("#statusDetails");
    if (statusEl) statusEl.textContent = msg;
    if (detailsEl) detailsEl.textContent = details;
  };

  async function refreshStatus() {
    try {
      const res = await fetch("/setup/api/status");
      const data = await res.json();
      
      if (data.configured) {
        setStatus("✅ Configured", "ZeroClaw is ready. Click 'Open ZeroClaw' to use it.");
      } else {
        setStatus("⚙️ Not configured", "Run the setup wizard below to configure ZeroClaw.");
      }

      // Update provider dropdown
      const providerEl = $("#provider");
      if (providerEl && data.authGroups) {
        providerEl.innerHTML = data.authGroups.map(g => 
          `<option value="${g.value}">${g.label}</option>`
        ).join("");
      }
    } catch (err) {
      setStatus("❌ Error", `Failed to load status: ${err.message}`);
    }
  }

  async function runSetup() {
    const provider = $("#provider")?.value || "openrouter";
    const apiKey = $("#apiKey")?.value || "";
    const telegramToken = $("#telegramToken")?.value || "";
    const discordToken = $("#discordToken")?.value || "";

    if (!apiKey) {
      alert("Please provide an API key");
      return;
    }

    try {
      log("Starting ZeroClaw onboarding...\n");
      const res = await fetch("/setup/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
          telegramToken,
          discordToken,
        }),
      });

      const data = await res.json();
      log(data.output || "(no output)");

      if (data.ok) {
        log("\n✅ Setup complete! ZeroClaw is ready.");
        await refreshStatus();
      } else {
        log("\n❌ Setup failed. Check the output above.");
      }
    } catch (err) {
      log(`\n❌ Error: ${err.message}`);
    }
  }

  async function resetSetup() {
    if (!confirm("This will delete the ZeroClaw config. Continue?")) return;

    try {
      log("Resetting...\n");
      const res = await fetch("/setup/api/reset", { method: "POST" });
      const data = await res.json();
      log(data.output || data.error || "(no output)");
      
      if (data.ok) {
        log("\n✅ Reset complete.");
        await refreshStatus();
      }
    } catch (err) {
      log(`\n❌ Error: ${err.message}`);
    }
  }

  async function runConsoleCommand() {
    const cmd = $("#consoleCmd")?.value || "";
    const out = $("#consoleOut");

    if (!out) return;

    try {
      out.textContent = "Running...\n";
      const res = await fetch("/setup/api/console/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd }),
      });

      const data = await res.json();
      out.textContent = data.output || data.error || "(no output)";
    } catch (err) {
      out.textContent = `Error: ${err.message}`;
    }
  }

  // Event listeners
  const runBtn = $("#run");
  if (runBtn) runBtn.onclick = runSetup;

  const resetBtn = $("#reset");
  if (resetBtn) resetBtn.onclick = resetSetup;

  const consoleRunBtn = $("#consoleRun");
  if (consoleRunBtn) consoleRunBtn.onclick = runConsoleCommand;

  // Initial status refresh
  refreshStatus();
})();
