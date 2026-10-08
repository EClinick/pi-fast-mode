import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Opt-in, offline integration check against a locally installed Pi. No credentials
// or provider requests. Ordinary tests remain dependency-free.
const packageDir = process.env.PI_TEST_PACKAGE_DIR;
test("installed Pi loads extension and preserves native footer layout across widths/themes", { skip: !packageDir }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const load = (path) => import(pathToFileURL(resolve(packageDir, path)).href);
  const { loadExtensions, createExtensionRuntime } = await load("dist/core/extensions/loader.js");
  const { FooterComponent } = await load("dist/modes/interactive/components/footer.js");
  const themeModule = await load("dist/modes/interactive/theme/theme.js");
  const { initTheme } = themeModule;
  initTheme("dark", false);
  const { visibleWidth } = await load("node_modules/@earendil-works/pi-tui/dist/index.js");
  const runtime = createExtensionRuntime();
  const branch = [];
  runtime.appendEntry = (customType, data) => branch.push({ type: "custom", customType, data });
  const result = await loadExtensions([resolve("src/extension.js")], process.cwd(), undefined, runtime);
  assert.deepEqual(result.errors, []);
  assert.equal(result.extensions.length, 1);
  const extension = result.extensions[0];
  const statuses = new Map([["another-extension", "Other ready"]]);
  const model = { provider: "openai", id: "gpt-6-astra", api: "openai-responses", baseUrl: "https://api.openai.com/v1", reasoning: true, contextWindow: 100000 };
  const sessionManager = {
    getBranch: () => branch, getEntries: () => [], getEntryCount: () => 0,
    getSessionId: () => "test", getLeafId: () => "test", getCwd: () => "/tmp/pi-test", getSessionName: () => undefined,
  };
  const notices = [];
  const ctx = { mode: "tui", hasUI: true, model, sessionManager, ui: {
    get theme() { return themeModule.theme; },
    setStatus: (key, value) => value === undefined ? statuses.delete(key) : statuses.set(key, value),
    setFooter: () => assert.fail("must not replace another extension's or Pi's footer"),
    notify: (text) => notices.push(text),
  } };
  const session = { sessionManager, model, state: { model, thinkingLevel: "high" },
    modelRuntime: { isUsingSubscription: () => false }, getContextUsage: () => ({ percent: 0, contextWindow: 100000 }),
  };
  const footer = new FooterComponent(session, {
    getGitBranch: () => "test", getExtensionStatuses: () => statuses, getAvailableProviderCount: () => 1,
  });
  const emit = async (event, data = {}) => {
    for (const handler of extension.handlers.get(event) ?? []) await handler(data, ctx);
  };
  await emit("session_start");
  const command = extension.commands.get("fast").handler;
  const baseline = footer.render(120);
  assert.equal(statuses.has("pi-fast-mode"), false);
  for (const action of ["", "status", "", "on"]) {
    await command(action, ctx);
    for (const theme of ["dark", "light", "system"]) {
      initTheme(theme, false);
      for (const width of [12, 20, 40, 80, 120]) {
        const lines = footer.render(width);
        assert.equal(lines.length, 3);
        assert.ok(lines.every((line) => visibleWidth(line) <= width), `${theme}, width ${width}`);
        if (width >= 80) {
          const plain = lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
          assert.match(plain, /gpt-6-astra.*high/);
          assert.match(plain, /0\.0%\/100k/);
          assert.match(plain, /Other ready.*Fast (on|off)/);
          assert.doesNotMatch(plain, /req on|confirmed|default/);
        }
      }
    }
  }
  initTheme("dark", false);
  t.mock.timers.tick(2000);
  assert.deepEqual(footer.render(120), baseline);
  assert.equal(statuses.get("another-extension"), "Other ready");
  statuses.delete("another-extension");
  for (const next of ["gpt-6-astra", "unsupported-model", "gpt-6-astra"]) {
    model.id = next;
    await emit("model_select");
    for (const width of [12, 20, 40, 80, 120]) {
      const lines = footer.render(width);
      assert.equal(lines.length, 2); // no extension status row at rest
      assert.ok(lines.every((line) => visibleWidth(line) <= width));
      assert.doesNotMatch(lines.join("\n"), /Fast/);
    }
  }
  assert.deepEqual(branch.map((entry) => entry.data.enabled), [true, false, true]);
  assert.equal(notices.length, 3); // two enable disclosures, one explicit status
});
