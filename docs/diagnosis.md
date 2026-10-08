# Astra fast-mode diagnosis

Investigation on 2026-10-08: Pi 1.0.0 and installed Codex CLI 0.160.1. These are observations, not a claim that an account is ineligible or that a latency improvement was measured.

## Reproduction aligned with the user path

The package was loaded into a real Pi SDK agent session, using its actual extension runner, command dispatch, model runtime, and provider implementation. `/fast on` followed by `Reply OK.` sent `service_tier: "priority"` in the **serialized HTTP body** to `https://api.openai.com/v1/responses`. The completed response reported `default`. `/fast off` followed by the same prompt omitted the tier and also completed with `default`.

This was not merely a mock of the request hook: a fetch-boundary observer checked the actual wire model/tier/stream fields. The session had no tools, project instructions, other extensions, persisted history, automatic retries, or cache warming. Output was bounded to 16 tokens and each turn to 20 seconds. No credentials or request/response content were logged.

Reproduce this explicit opt-in, potentially billable check:

```sh
node scripts/probe.mjs /path/to/installed/@earendil-works/pi-coding-agent
```

The script uses existing Pi authentication through read-only credential storage; it cannot refresh or rewrite credentials. It never loads project data, settings, or instructions. Its diagnostic-only Pi internals are version-specific to Pi 1.0.0; the extension does not import them. Ordinary `npm test` never runs it.

## Native Codex comparison

| Boundary | Pi package | Installed Codex fast path |
| --- | --- | --- |
| Model | `openai/gpt-6-astra` | `gpt-6-astra` on the OpenAI provider |
| Setting/UI | `/fast on`, session preference | `service_tier = "fast"`; Fast toggle selects the catalog tier |
| Actual request tier | `priority` | **`priority`**, not literal `fast` |
| Endpoint | `https://api.openai.com/v1/responses` | `https://chatgpt.com/backend-api/codex/responses` for native ChatGPT auth |
| Authentication | Existing Pi direct ChatGPT OAuth token (`chatgpt.tokens.use.direct`) | Existing Codex ChatGPT OAuth token and account routing header |
| Transport | HTTPS SSE in Pi's `openai-responses` implementation | Catalog prefers WebSocket; HTTPS SSE is also supported |
| Extra routing | No native Codex hint | `x-codex-routing-hint: model=gpt-6-astra;tier=priority` |
| UI meaning | Request preference plus observed final tier | “Fast on” reflects selected configuration/catalog tier, not a provider-confirmation check |

Evidence for the actual native value, rather than an assumption:

1. The installed binary's bundled Astra catalog and the authenticated live Codex catalog both advertised `{ id: "priority", name: "Fast", description: "2x speed, increased usage" }`. The live catalog preferred WebSocket.
2. The installed Codex binary was run against an isolated loopback mock endpoint with `service_tier="fast"`, model `gpt-6-astra`, a dummy non-credential API key, and an empty temporary Codex home inside the checkout. It serialized `POST /v1/responses` with `service_tier: "priority"` and `stream: true`. The mock rejected the request immediately; no model ran, and no real credential was sent. This confirms binary serialization, not live Codex performance.
3. Version-matched upstream source confirms [Fast selection](https://github.com/openai/codex/blob/rust-v0.160.1/codex-rs/tui/src/chatwidget/service_tiers.rs), [configuration aliases](https://github.com/openai/codex/blob/rust-v0.160.1/codex-rs/protocol/src/config_types.rs), and [request/routing hint construction](https://github.com/openai/codex/blob/rust-v0.160.1/codex-rs/core/src/client.rs).
4. The [native status surface](https://github.com/openai/codex/blob/rust-v0.160.1/codex-rs/tui/src/chatwidget/status_surfaces.rs) produces “Fast on” when `current_service_tier()` equals `ServiceTier::Fast.request_value()`. That value comes from configuration/catalog resolution, not `response.completed.service_tier`. Thus native “Fast on” is **not a proven server-granted fast path** against which to infer that Pi must be slower.

The first substantive route divergence is endpoint/authentication/transport, **not the tier value**. The native end-user TUI was not launched against the live account: avoiding native persisted state/credential writes was a constraint. Actual binary serialization was verified locally; live native-endpoint probes used the existing native credentials read-only and minimal input. Those observations are not presented as a full live native TUI run. The two existing OAuth tokens have different token formats; equal account membership was not assumed or established. No account was selected/switched and no credentials were changed or copied to files.

## Counterfactuals and disconfirming evidence

All completed live rows below reported early `auto` and final **`default`**:

| Probe | Result |
| --- | --- |
| Pi direct OAuth, tier `priority`, real package `/fast on` | HTTP 200, completed `default` |
| Pi direct OAuth, tier omitted, real package `/fast off` | HTTP 200, completed `default` |
| Pi direct OAuth, literal tier `fast` | HTTP 400: `Unsupported service_tier: fast` |
| Pi direct OAuth, priority plus native Codex routing hint | Completed `default` |
| Native Codex endpoint/auth, priority, SSE | HTTP 200, completed `default` |
| Native Codex endpoint/auth, omitted tier, SSE | HTTP 200, completed `default` |
| Native Codex endpoint/auth, literal `fast` | HTTP 400: `Unsupported service_tier: fast` |
| Native Codex endpoint/auth, priority, routing hint and native client identification | HTTP 200, completed `default` |
| Native Codex endpoint/auth, priority, routing hint, genuine WebSocket | Completed `default`; one connection, zero WebSocket failures, zero SSE fallbacks |
| Same native provider implementation, forced SSE | Completed `default` |

The WebSocket/SSE comparison used Pi's low-level Codex transport implementation with existing native credentials in memory, not a different persisted Pi provider configuration. Native probes requested a brief `Reply OK.` response and had a 20-second deadline. The native endpoint does not use Pi direct's output-limit option; no output-bound claim is made for these native probes.

An initial native request with reasoning `minimal` produced a structured `unsupported_value` error: Astra supports `low`, `medium`, `high`, `xhigh`, and `max` there. Subsequent native comparisons used `low`. Pi's real session reproduction also used `low`. This separate reasoning error was not mistaken for a tier rejection.

These observations disconfirm the simple hypotheses “Codex sends literal fast,” “Pi drops the payload replacement before HTTP,” “the missing routing hint alone explains it,” and “SSE rather than WebSocket alone explains it.” The native token declared `no_constraint` for compute residency, not EU; the documented EU restriction is not established as the cause here. No account-ineligibility, quota, or regional diagnosis is justified from these results.

[OpenAI's Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode) documents `fast` and `priority` as aliases for supported API requests and describes response `service_tier` as the tier used. The literal `fast` failures above are real contradictory evidence on these subscription routes; changing the package blindly to `fast` would turn successful requests into errors.

## Causal separation and in-scope change

- **Trigger:** enabling the preference adds a priority request on the next supported model call.
- **Masking condition:** a native “Fast on” label describes the selected preference, creating the appearance of a proven faster native path even without final tier evidence. Early stream `auto` is also not final confirmation.
- **Visible symptom:** the final provider metadata says `default` despite a priority request, consistently across the tested client routes/transports.
- **Established boundary:** Pi delivers the same native fast tier value, and this package does not lose it. Tested providers do not report a priority/fast grant for these requests. Client-side evidence does not explain the server's internal scheduling decision or establish a speed increase/decrease.

The package now labels the preference **“Fast request on”** and warns once per completed opted-in request when the final tier is absent or differs from `priority`/`fast`. The live `priority → default` case is a regression test; final `fast` and `priority` both count as provider confirmation. No speculative auth routing, credential copying, forced fallback, or unrelated model support was added.

**Unresolved outcome:** a server-confirmed Astra fast response has still not been observed. There is no justified request-value fix from the evidence above. This is a concrete provider-reporting limitation on the tested routes, not proof of an account restriction or a claim that real fast service is impossible. Establishing why the provider returns `default` requires authoritative provider evidence or a genuinely confirmed fast response to compare. Do not describe this diagnosis or the warning fix as delivering a verified speed improvement.
