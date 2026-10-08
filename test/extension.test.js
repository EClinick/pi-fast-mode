import test from "node:test";
import assert from "node:assert/strict";
import fastMode, { supported } from "../src/extension.js";

const model = { provider: "openai", id: "gpt-6-astra", api: "openai-responses", baseUrl: "https://api.openai.com/v1" };
const payload = { model: model.id, input: [{ role: "user", content: "hello" }] };
function harness(branch = [], options = {}) {
  const handlers = new Map();
  let command, display = "";
  const notices = [];
  const pi = {
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (_name, definition) => { command = definition.handler; },
    appendEntry: (customType, data) => {
      if (options.failSave) throw new Error("disk full");
      branch.push({ type: "custom", customType, data });
    },
  };
  const ctx = {
    model: { ...model }, mode: "tui", hasUI: true,
    sessionManager: { getBranch: () => branch },
    ui: { setStatus: (_key, value) => { display = value; }, notify: (value) => notices.push(value) },
  };
  fastMode(pi);
  const emit = (name, event = {}) => handlers.get(name)(event, ctx);
  emit("session_start");
  return { ctx, branch, notices, emit, command: (args) => command(args, ctx), status: () => display,
    request: (body = payload) => emit("before_provider_request", { payload: body }),
    response: (data, extra = {}) => emit("provider_stream_event", { provider: model.provider, api: model.api, model: model.id, data, ...extra }),
  };
}

test("default off; on replaces only service_tier without mutating payload; off leaves tiers alone", async () => {
  const h = harness();
  assert.equal(h.request(), undefined);
  await h.command("on");
  assert.deepEqual(h.request(), { ...payload, service_tier: "priority" });
  assert.equal(payload.service_tier, undefined);
  assert.match(h.status(), /requested: priority; confirmed: unknown/);
  assert.match(h.notices.at(-1), /may cost more/);
  await h.command("off");
  assert.equal(h.request({ ...payload, service_tier: "flex" }), undefined);
  assert.match(h.status(), /requested: flex/);
});

test("strict provider, model, API, endpoint and payload scoping", async () => {
  const h = harness();
  await h.command("on");
  for (const override of [{ provider: "openai-codex" }, { provider: "azure-openai" }, { id: "gpt-6-astra-mini" },
    { api: "openai-completions" }, { baseUrl: "https://proxy.example/v1" }, { baseUrl: "http://api.openai.com/v1" },
    { baseUrl: "https://api.openai.com.evil/v1" }]) {
    h.ctx.model = { ...model, ...override };
    assert.equal(supported(h.ctx.model), false);
    assert.equal(h.request(), undefined);
  }
  h.ctx.model = model;
  for (const body of [null, [], "text", {}, { ...payload, model: "other" }]) assert.equal(h.request(body), undefined);
  assert.equal(supported({ ...model, baseUrl: model.baseUrl + "/" }), true);
});

test("preference persists on resume/reload, honors branch, and new sessions default off", async () => {
  const h = harness();
  await h.command("on");
  const resumed = harness(h.branch);
  assert.equal(resumed.request().service_tier, "priority");
  await resumed.command("off");
  assert.equal(harness(h.branch).request(), undefined);
  assert.equal(harness(h.branch.slice(0, 1)).request().service_tier, "priority");
  assert.equal(harness().request(), undefined);
  h.emit("session_tree");
  assert.match(h.status(), /Fast off/);
});

test("status and bare command report without changing preference or saving", async () => {
  const h = harness();
  await h.command("status");
  await h.command("");
  assert.equal(h.branch.length, 0);
  assert.match(h.notices.at(-1), /Fast off.*confirmed: unknown/);
  await h.command("on");
  h.request();
  h.emit("after_provider_response", { status: 200 });
  await h.command("status");
  assert.equal(h.branch.length, 1);
  assert.match(h.notices.at(-1), /requested: priority; confirmed: unknown/);
});

test("save failure does not enable; invalid commands do not persist", async () => {
  const h = harness([], { failSave: true });
  await assert.rejects(h.command("on"), /disk full/);
  assert.equal(h.request(), undefined);
  await h.command("yes");
  assert.equal(h.branch.length, 0);
  assert.match(h.notices.at(-1), /Usage/);
});

test("only terminal provider evidence confirms tier, never requested or early echo", async () => {
  const h = harness();
  await h.command("on");
  for (const [value, expected] of [[undefined, "unknown"], [null, "unknown"], ["default", "default"], ["priority", "priority"], ["flex", "flex"], ["\x1b[2J", "unknown"]]) {
    h.request();
    h.response({ type: "response.created", response: { service_tier: "priority" } });
    assert.match(h.status(), /confirmed: unknown/);
    h.response({ type: "response.completed", response: { service_tier: value } });
    assert.match(h.status(), new RegExp(`confirmed: ${expected}`));
  }
  h.request();
  h.response({ type: "response.completed", response: { service_tier: "priority" } }, { provider: "other" });
  assert.match(h.status(), /confirmed: unknown/);
});

test("request retry, model change and errors cannot retain stale priority confirmation", async () => {
  const h = harness();
  await h.command("on");
  for (const fail of [
    () => h.emit("after_provider_response", { status: 429 }),
    () => h.response({ type: "response.failed" }),
    () => h.response({ type: "response.incomplete" }),
    () => h.response({ type: "error" }),
    () => h.emit("message_end", { message: { role: "assistant", stopReason: "error" } }),
    () => h.emit("message_end", { message: { role: "assistant", stopReason: "aborted" } }),
  ]) {
    h.request();
    h.response({ type: "response.completed", response: { service_tier: "priority" } });
    fail();
    assert.match(h.status(), /confirmed: unknown \(request failed\/aborted\)/);
  }
  h.request();
  assert.doesNotMatch(h.status(), /failed/);
  assert.match(h.status(), /confirmed: unknown/);
  h.emit("model_select");
  assert.match(h.status(), /none yet/);
});

test("headless mode mutates requests without terminal output", async () => {
  const h = harness();
  h.ctx.mode = "json";
  h.ctx.hasUI = false;
  h.ctx.ui = new Proxy({}, { get() { throw new Error("UI should not be used"); } });
  await h.command("on");
  await h.command("status");
  assert.equal(h.request().service_tier, "priority");
  h.response({ type: "response.completed", response: { service_tier: "priority" } });
});
