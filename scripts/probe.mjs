// Explicit, opt-in live diagnostic. Never run from CI: requests can incur charges.
// Usage: node scripts/probe.mjs /path/to/installed/@earendil-works/pi-coding-agent [openai|openai-codex] [auto|sse|websocket]
import { resolve, join } from "node:path";
import * as zlib from "node:zlib";
import { pathToFileURL } from "node:url";
import fastMode, { supported } from "../src/extension.js";

if (!process.argv[2]) throw new Error("Supply the installed Pi package directory (Pi 1.0.0).");
const root = resolve(process.argv[2]);
const load = (path) => import(pathToFileURL(join(root, path)).href);
const { createAgentSession, ModelRuntime, SessionManager, SettingsManager, createExtensionRuntime } = await load("dist/index.js");
// These diagnostic-only imports are version-specific; the extension itself uses no internals.
const { ReadOnlyAuthStorage } = await load("dist/core/auth-storage.js");
const { loadExtensionFromFactory } = await load("dist/core/extensions/loader.js");
const { createEventBus } = await load("dist/core/event-bus.js");
const modelRuntime = await ModelRuntime.create({ credentials: new ReadOnlyAuthStorage(), allowModelNetwork: false });
const provider = process.argv[3] ?? "openai";
const transport = process.argv[4] ?? "auto";
if (!["openai", "openai-codex"].includes(provider) || !["auto", "sse", "websocket"].includes(transport)) {
  throw new Error("Use provider openai|openai-codex and transport auto|sse|websocket.");
}
const model = modelRuntime.getModel(provider, "gpt-6-astra");
const expectedRoute = provider === "openai" ? ["openai-responses", "https://api.openai.com/v1"] :
  ["openai-codex-responses", "https://chatgpt.com/backend-api"];
if (!model || model.api !== expectedRoute[0] || model.baseUrl.replace(/\/$/, "") !== expectedRoute[1]) {
  throw new Error("Official Astra route not present in the installed catalog.");
}
const runtime = createExtensionRuntime();
const bus = createEventBus();
const evidence = [];
// Observe serialized WebSocket metadata, not credentials or prompts. Process-local only.
const OriginalWebSocket = globalThis.WebSocket;
if (provider === "openai-codex" && OriginalWebSocket) {
  globalThis.WebSocket = class extends OriginalWebSocket {
    constructor(url, options) { super(url, options); this.probeUrl = new URL(url); }
    send(data) {
      const body = JSON.parse(data);
      evidence.push({ phase: "wire", transport: "websocket",
        endpoint: this.probeUrl.origin + this.probeUrl.pathname,
        model: body.model, requested: body.service_tier ?? "omitted" });
      return super.send(data);
    }
  };
}
// Observe serialized request metadata at the HTTP boundary, not just the payload hook.
const streamSimple = modelRuntime.streamSimple.bind(modelRuntime);
modelRuntime.streamSimple = (requestModel, context, options) => streamSimple(requestModel, context, {
  ...options,
  fetch: async (input, init) => {
    const request = new Request(input, init);
    const bytes = Buffer.from(await request.clone().arrayBuffer());
    const body = JSON.parse((request.headers.get("content-encoding") === "zstd" ? zlib.zstdDecompressSync(bytes) : bytes).toString());
    const url = new URL(request.url);
    evidence.push({ phase: "wire", transport: "sse", endpoint: url.origin + url.pathname,
      model: body.model, requested: body.service_tier ?? "omitted", stream: body.stream });
    return fetch(request);
  },
});
const extensions = [
  await loadExtensionFromFactory(fastMode, process.cwd(), bus, runtime),
  await loadExtensionFromFactory((pi) => {
    pi.on("before_provider_request", (event) => {
      const p = event.payload;
      evidence.push({ phase: "request", model: p.model, requested: p.service_tier ?? "omitted" });
      // Codex subscription requests do not support max_output_tokens.
      if (provider === "openai") return { ...p, max_output_tokens: 16 };
    });
    pi.on("provider_stream_event", (event) => {
      if (["response.created", "response.completed"].includes(event.data?.type)) {
        evidence.push({ phase: event.data.type, returned: event.data.response?.service_tier ?? "unknown" });
      }
    });
  }, process.cwd(), bus, runtime),
];
const resourceLoader = {
  getExtensions: () => ({ extensions, errors: [], runtime }),
  getSkills: () => ({ skills: [], diagnostics: [] }),
  getPrompts: () => ({ prompts: [], diagnostics: [] }),
  getThemes: () => ({ themes: [], diagnostics: [] }),
  getAgentsFiles: () => ({ agentsFiles: [] }),
  getSystemPrompt: () => "Reply briefly.", getSystemPromptSource: () => undefined,
  getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [],
  extendResources() {}, async reload() {},
};
const settingsManager = SettingsManager.inMemory({
  compaction: { enabled: false }, cacheWarming: "off", transport,
  retry: { enabled: false, provider: { maxRetries: 0, timeoutMs: 20000 } },
});
const { session } = await createAgentSession({
  cwd: process.cwd(), modelRuntime, model, thinkingLevel: "low", resourceLoader,
  settingsManager, sessionManager: SessionManager.inMemory(), tools: [],
});
try {
  await session.bindExtensions({});
  for (const action of ["on", "off"]) {
    await session.prompt(`/fast ${action}`);
    const timer = setTimeout(() => { void session.abort(); }, 20000);
    try { await session.prompt("Reply OK."); } finally { clearTimeout(timer); }
    evidence.push({ phase: "result", preference: action, stopReason: session.messages.at(-1)?.stopReason });
  }
  console.log(JSON.stringify({ provider: model.provider, api: model.api, extensionSupported: supported(model), transport, evidence }, null, 2));
} finally {
  session.dispose();
  globalThis.WebSocket = OriginalWebSocket;
}
