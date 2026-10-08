const ENTRY = "pi-fast-mode/preference-v1";
const MODEL = "gpt-6-astra";
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
// Never render arbitrary provider text (including control characters).
const tier = (value) => typeof value === "string" && /^[a-z_]{1,32}$/.test(value) ? value : "unknown";

export function supported(model) {
  return model?.provider === "openai" && model.id === MODEL &&
    model.api === "openai-responses" &&
    /^https:\/\/api\.openai\.com\/v1\/?$/.test(model.baseUrl ?? "");
}

/** @param {import('@earendil-works/pi-coding-agent').ExtensionAPI} pi */
export default function fastMode(pi) {
  let enabled = false;
  let last;
  const status = (ctx) => `Fast ${enabled ? "on" : "off"}${supported(ctx.model) ? "" : " (unsupported model)"}; ` +
    (last ? `last requested: ${last.requested}; confirmed: ${last.confirmed}${last.error ? " (request failed/aborted)" : ""}` :
      "requested: none yet; confirmed: unknown");
  const render = (ctx) => {
    if (ctx.mode === "tui") ctx.ui.setStatus("pi-fast-mode", status(ctx));
  };
  const restore = (_event, ctx) => {
    enabled = false;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === ENTRY && typeof entry.data?.enabled === "boolean") {
        enabled = entry.data.enabled;
      }
    }
    last = undefined;
    render(ctx);
  };
  pi.on("session_start", restore);
  pi.on("session_tree", restore);
  pi.on("model_select", (_event, ctx) => { last = undefined; render(ctx); });

  pi.registerCommand("fast", {
    description: "Astra priority requests: /fast on|off|status (may cost more; saved in this session)",
    handler: async (args, ctx) => {
      const action = args.trim() || "status";
      if (!["on", "off", "status"].includes(action)) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /fast on|off|status", "warning");
        return;
      }
      if (action !== "status") {
        const next = action === "on";
        // Persist first: a failed append must not silently enable a costly preference.
        pi.appendEntry(ENTRY, { enabled: next });
        enabled = next;
      }
      render(ctx);
      if (ctx.hasUI) ctx.ui.notify(status(ctx) + (action === "on" ?
        ". Priority may cost more and is not guaranteed. Applies to subsequent supported requests." : ""), "info");
    },
  });

  pi.on("before_provider_request", (event, ctx) => {
    // The request hook has no model argument. Check BOTH the context and wire model.
    last = undefined;
    if (!supported(ctx.model) || !record(event.payload) || event.payload.model !== MODEL) {
      render(ctx);
      return;
    }
    last = { requested: enabled ? "priority" :
      (event.payload.service_tier === undefined ? "unspecified" : tier(event.payload.service_tier)),
      confirmed: "unknown", error: false };
    render(ctx);
    if (enabled) return { ...event.payload, service_tier: "priority" };
    // Off does not remove another extension's/provider's tier choice.
  });

  pi.on("provider_stream_event", (event, ctx) => {
    if (!last || event.provider !== "openai" || event.api !== "openai-responses" || event.model !== MODEL) return;
    const data = event.data;
    if (!record(data)) return;
    // response.created/in_progress often echo 'auto', not the tier actually used.
    if (data.type === "response.completed") {
      last.confirmed = tier(data.response?.service_tier);
      render(ctx);
    } else if (["error", "response.failed", "response.incomplete"].includes(data.type)) {
      last.confirmed = "unknown";
      last.error = true;
      render(ctx);
    }
  });
  pi.on("after_provider_response", (event, ctx) => {
    if (last && event.status >= 400) {
      last.confirmed = "unknown";
      last.error = true;
      render(ctx);
    }
  });
  pi.on("message_end", (event, ctx) => {
    if (last && event.message.role === "assistant" && ["error", "aborted"].includes(event.message.stopReason)) {
      last.confirmed = "unknown";
      last.error = true;
      render(ctx);
    }
  });
}
