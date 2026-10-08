const ENTRY = "pi-fast-mode/preference-v1";
const MODEL = "gpt-6-astra";
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
// Never render arbitrary provider text (including control characters).
const tier = (value) => typeof value === "string" && /^[a-z_]{1,32}$/.test(value) ? value : "unknown";

export function supported(model) {
  if (model?.id !== MODEL) return false;
  return (model.provider === "openai" && model.api === "openai-responses" &&
    /^https:\/\/api\.openai\.com\/v1\/?$/.test(model.baseUrl ?? "")) ||
    (model.provider === "openai-codex" && model.api === "openai-codex-responses" &&
    /^https:\/\/chatgpt\.com\/backend-api\/?$/.test(model.baseUrl ?? ""));
}

/** @param {import('@earendil-works/pi-coding-agent').ExtensionAPI} pi */
export default function fastMode(pi) {
  let enabled = false;
  let last;
  const status = (ctx) => `Fast request ${enabled ? "on" : "off"}${supported(ctx.model) ? "" : " (unsupported model)"}; ` +
    (last ? `last requested: ${last.requested}; confirmed: ${last.confirmed}${last.error ? " (request failed/aborted)" : ""}` :
      "requested: none yet; confirmed: unknown");
  let confirmationTimer;
  let confirmationUI;
  const dismissConfirmation = () => {
    clearTimeout(confirmationTimer);
    confirmationTimer = undefined;
    confirmationUI?.setStatus("pi-fast-mode", undefined);
    confirmationUI = undefined;
  };
  const confirmPreference = (ctx) => {
    if (ctx.mode !== "tui") return;
    dismissConfirmation();
    confirmationUI = ctx.ui;
    // Brief acknowledgment only: never replace Pi's footer or other status keys.
    ctx.ui.setStatus("pi-fast-mode", `Fast ${enabled ? "on" : "off"}${supported(ctx.model) ? "" : " (unsupported)"}`);
    confirmationTimer = setTimeout(dismissConfirmation, 2000);
    confirmationTimer.unref?.();
  };
  const restore = (_event, ctx) => {
    enabled = false;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === ENTRY && typeof entry.data?.enabled === "boolean") {
        enabled = entry.data.enabled;
      }
    }
    last = undefined;
    dismissConfirmation();
    // Also clear a status left by an older version during reload.
    if (ctx.mode === "tui") ctx.ui.setStatus("pi-fast-mode", undefined);
  };
  pi.on("session_start", restore);
  pi.on("session_tree", restore);
  pi.on("session_shutdown", dismissConfirmation);
  pi.on("model_select", () => { last = undefined; dismissConfirmation(); });

  pi.registerCommand("fast", {
    description: "Toggle Astra priority requests: /fast [on|off|status] (may cost more; session preference)",
    handler: async (args, ctx) => {
      const action = args.trim() || (enabled ? "off" : "on");
      if (!["on", "off", "status"].includes(action)) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /fast [on|off|status] (bare /fast toggles)", "warning");
        return;
      }
      const enabling = action === "on" && !enabled;
      if (action !== "status") {
        const next = action === "on";
        // Persist first: a failed append must not silently enable a costly preference.
        pi.appendEntry(ENTRY, { enabled: next });
        enabled = next;
        confirmPreference(ctx);
      }
      if (!ctx.hasUI) return;
      if (action === "status") {
        ctx.ui.notify(status(ctx) + ". On requests priority; it does not guarantee fast service or a speedup. Priority may cost more.", "info");
      } else if (enabling) {
        ctx.ui.notify("Priority requests enabled; may cost more. Fast service is not guaranteed." +
          (supported(ctx.model) ? "" : " Current model unsupported; requests unchanged."), "warning");
      } else if (ctx.mode !== "tui") {
        ctx.ui.notify(`Fast request ${enabled ? "on" : "off"}${supported(ctx.model) ? "" : " (unsupported model)"}.`, "info");
      }
    },
  });

  pi.on("before_provider_request", (event, ctx) => {
    // The request hook has no model argument. Check BOTH the context and wire model.
    last = undefined;
    if (!supported(ctx.model) || !record(event.payload) || event.payload.model !== MODEL) {
      return;
    }
    last = { requested: enabled ? "priority" :
      (event.payload.service_tier === undefined ? "unspecified" : tier(event.payload.service_tier)),
      confirmed: "unknown", error: false,
      provider: ctx.model.provider, api: ctx.model.api };
    if (enabled) return { ...event.payload, service_tier: "priority" };
    // Off does not remove another extension's/provider's tier choice.
  });

  pi.on("provider_stream_event", (event) => {
    if (!last || event.provider !== last.provider || event.api !== last.api || event.model !== MODEL) return;
    const data = event.data;
    if (!record(data)) return;
    // response.created/in_progress often echo 'auto', not the tier actually used.
    if (data.type === "response.completed") {
      last.confirmed = tier(data.response?.service_tier);
      // Routine tier evidence belongs only in /fast status, not the transcript.
    } else if (["error", "response.failed", "response.incomplete"].includes(data.type)) {
      last.confirmed = "unknown";
      last.error = true;
    }
  });
  pi.on("after_provider_response", (event) => {
    if (last && event.status >= 400) {
      last.confirmed = "unknown";
      last.error = true;
    }
  });
  pi.on("message_end", (event) => {
    if (last && event.message.role === "assistant" && ["error", "aborted"].includes(event.message.stopReason)) {
      last.confirmed = "unknown";
      last.error = true;
    }
  });
}
