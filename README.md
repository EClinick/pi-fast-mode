# pi-fast-mode

A standalone [Pi](https://pi.dev) Git package that **requests** priority service for `openai/gpt-6-astra` and reports the tier the provider actually confirms. No Firstmate dependency, account copying, background service, or npm publication required.

**Off by default. Priority can cost more. Requesting priority does not guarantee priority service, lower latency, or availability.** Check your provider's current pricing and account eligibility before enabling it. Pi's displayed cost estimate is not a billing guarantee.

## Install on each computer

Requires **Pi 1.0.0 or later** (`@earendil-works/pi-coding-agent`) with the `before_provider_request` replacement hook and `provider_stream_event` hook, and Node.js 22+. Tested against Pi 1.0.0. Older Pi distributions with a different package name/API are not supported.

```sh
pi install git:github.com/EClinick/pi-fast-mode
```

Restart Pi, or run `/reload` in an existing session, then:

```text
/fast status
/fast on
```

Use `/fast off` to stop adding priority to subsequent requests. `/fast` is shorthand for `/fast status`. A running request is not changed by a toggle. The command and footer distinguish your preference, the last request's tier, and provider confirmation:

```text
Fast request on; last requested: priority; confirmed: unknown
Fast request on; last requested: priority; confirmed: default
Fast request on; last requested: priority; confirmed: priority
```

- **Requested** is what this extension put in the request hook (or the pre-existing tier when off), not proof of what the server granted. Later extensions can still alter it.
- **Confirmed** comes only from `response.completed.response.service_tier`. Early events can echo `auto`; they are not final confirmation. A completed opted-in request with a missing/different tier triggers a warning: **Fast service not confirmed**. Final `priority` or `fast` is tier confirmation, not a measured speed guarantee.
- **Unknown** means no final tier evidence, including missing/malformed metadata, an in-flight request, or failure/abort. Errors do not silently retry without priority; Pi retains its normal error/retry behavior.
- Off means this extension does not modify the request. It does not undo a tier set by another extension or provider configuration.

### Preference scope

On/off is saved as a tiny custom entry in the **current Pi session branch**, outside model context. Resume or reload that session to keep it; a fresh session defaults off. Forks inherit the preference at their branch point; tree navigation restores the active branch's preference. `--no-session` cannot persist across processes. The extension never writes global settings, credentials, or its own configuration files. Last-request evidence is deliberately not persisted and resets on reload/model change.

### Three-computer setup (with or without Firstmate)

1. Install a compatible Pi version and authenticate normally on **each** computer. Do not copy credentials through this repository.
2. Run the install command above on each computer. This is a personal Pi package install, available across projects. No Firstmate changes are needed; Pi sessions launched through Firstmate can use the same installed extension unless their launch explicitly disables extensions or uses a different Pi agent directory.
3. Run `/fast on` in each new session where priority is wanted. Preferences and sessions are local, not automatically synchronized.
4. To update installed packages on each computer:

   ```sh
   pi update --extensions
   ```

   Then restart Pi or `/reload` each running session. The unpinned Git source tracks the repository's default branch. A source pinned with `@<tag-or-commit>` stays pinned when updating; use matching refs on all computers if reproducibility is needed.

Check installation with `pi list`; enable/disable package resources with `pi config`. To uninstall:

```sh
pi remove git:github.com/EClinick/pi-fast-mode
```

Restart or reload afterward. For a project-only install, use `pi install --local git:github.com/EClinick/pi-fast-mode` and grant project trust. For development without changing package settings: `pi -e ./src/extension.js`.

## Compatibility and actual evidence

The allowlist is intentionally narrow:

| Provider | Model ID | API | Configured base URL |
| --- | --- | --- | --- |
| `openai` | `gpt-6-astra` | `openai-responses` | `https://api.openai.com/v1` (optional trailing slash) |

The context model **and** payload model must match. Azure, Codex provider IDs, proxies/custom endpoints, other Astra names, and unrelated providers/models are left untouched. This does not add or register models; Astra must already be available in your Pi catalog/account. Unsupported selections are labeled in status even if the preference is on.

Implementation uses Pi's supported payload replacement hook because ordinary `streamSimple` does not forward a `serviceTier` option. It sets the OpenAI Responses API's `service_tier: "priority"`, and reads parsed response events without logging prompts, bodies, headers, credentials, or errors. See [OpenAI's Responses API reference](https://platform.openai.com/docs/api-reference/responses/create) and [Priority processing](https://platform.openai.com/docs/guides/priority-processing): response tier evidence can differ from the requested tier.

**Live investigation:** the real Pi `/fast on` command path sent `service_tier: "priority"` all the way through HTTP serialization, but the completed response reported **`default`**. Installed Codex 0.160.1 also serializes its `fast` setting as **`priority`**; its “Fast on” UI reflects a preference, not a checked provider grant. Live probes of the native Codex endpoint with existing native authentication, its routing hint, and genuine WebSocket (no fallback) also returned `default`. Literal `fast` was rejected on both subscription routes. Changing the request blindly to `fast` is not a fix.

See [the full diagnosis](docs/diagnosis.md) for reproduction, route/auth/transport comparison, counterfactuals, and limitations, including an opt-in live probe script. **No server-confirmed Astra fast response or speed improvement has been demonstrated.** The evidence does not establish account ineligibility or a client-side request defect; the package now warns when a completed request does not confirm fast service rather than silently presenting an on preference as success.

The request hook exposes no request ID or model argument; scoping uses the current Pi model plus the wire model. This status is for the ordinary sequential Pi agent request stream, not a concurrent nested-call meter. Stream events are additionally filtered by provider/API/model. Extensions that reroute requests or rewrite tiers can invalidate attribution; avoid competing tier/routing extensions. Footer rendering is TUI-only; RPC notifications use Pi's supported UI channel, and JSON/print modes never receive unsolicited stdout logging.

## Development

No runtime dependencies or build step. Pi supplies its extension API.

```sh
npm test
```

Tests use Node's built-in runner and a fake Pi host. They cover strict scoping, immutable payload replacement, on/off/status, session persistence and save failure, missing/different/priority/fast response tiers, early versus completed events, the live priority-requested/default-returned warning regression, HTTP/stream/abort errors, retries, and headless behavior. CI runs the same tests; they make no network requests and require no credentials.

MIT licensed.
