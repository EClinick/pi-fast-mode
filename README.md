# pi-fast-mode

An opt-in [Pi](https://pi.dev) extension that requests fast/priority service for **GPT-6 Astra** and shows what service tier the provider actually reports.

- `/fast` toggles on/off; `/fast on`, `/fast off`, and `/fast status` remain available
- Off by default, with a preference saved in the current session branch
- Separate **requested** and **provider-confirmed** tiers
- Standalone Git package: no Firstmate dependency, background service, or build step

> **Priority is a request, not a guarantee.** It may incur higher API charges or consume subscription usage faster. Check current provider pricing and eligibility. The extension does not guarantee a speedup, and Pi's cost estimate is not a billing guarantee.

## Requirements

- **Pi 1.0.0 or later**, distributed as `@earendil-works/pi-coding-agent`, with the `before_provider_request` replacement hook and `provider_stream_event` hook. Tested on Pi 1.0.0; older Pi distributions with different package names/APIs are not supported.
- **Node.js 22 or later**.
- An authenticated Pi account with one of the [supported Astra routes](#supported-routes) available. This extension does not register models or supply credentials.

## Install and enable

Run on each computer:

```sh
pi install git:github.com/EClinick/pi-fast-mode
```

Start/restart Pi, or run `/reload` in an already-running session. Select a supported Astra model, then toggle requests on:

```text
/fast
```

Your next supported model request will include `service_tier: "priority"`. Installing the package does **not** enable it automatically.

### Commands

| Command | Behavior |
| --- | --- |
| `/fast on` | Request priority for subsequent supported requests; save the preference in this session branch. |
| `/fast off` | Stop adding a tier to subsequent requests; save the preference. |
| `/fast status` | Show the preference and last-request evidence without changing either. |
| `/fast` | Toggle the saved preference on/off. New sessions start off, so the first toggle enables requests. |

Changing the preference does not alter an in-flight request. Off leaves the request untouched: it does not remove a tier chosen by another extension or provider configuration.

### Compact UI and detailed status

Pi's shared extension-status row, immediately below the model/effort row, shows a compact badge:

```text
Fast req off
Fast req on
Fast req on · ?
Fast req on · default
```

`req on` means **requests enabled**, never server-confirmed acceleration. The suffix is the last provider-reported tier, `?` for unknown evidence, `error` for a failed/aborted request, or `unsupported` when the current model is outside the supported routes. Off hides routine tier evidence, but errors and unsupported selections remain visible. Use `/fast status` for full evidence, including the last request made before a toggle.

The badge uses Pi theme emphasis (bold when enabled) with native terminal colors, so it follows appearance changes without stale cached colors. Pi owns placement and narrow-width truncation alongside other extensions. There is no supported inline model-label slot: this extension does **not** replace the footer or editor, patch Pi, or displace built-in model, effort, usage, or other extension information.

Detailed diagnostics are shown only when you run `/fast status`:

```text
Fast request on; last requested: priority; confirmed: unknown
Fast request on; last requested: priority; confirmed: default
Fast request on; last requested: priority; confirmed: priority
```

- **Fast request on/off** is your preference, not a statement that fast service was granted.
- **Requested** is the tier at this extension's request hook. A later extension could still change it.
- **Confirmed** comes only from the final `response.completed.response.service_tier`. A final `priority` or `fast` confirms that reported tier, not a measured latency improvement. `default` is a reported tier different from the requested priority.
- **Unknown** means no final tier evidence: the request may be in flight, the field may be missing/malformed, or the request may have failed/been aborted. Early response events that report `auto` do not count as final confirmation.

Routine `default`/unknown results update the badge without per-response warnings. Enabling requests displays one concise cost/availability disclosure; repeated `/fast on` while already enabled does not repeat it. Unsupported models are marked in the badge (and in the enable notice). Errors remain visible through Pi's normal error UI, the badge, and `/fast status`. The extension does not silently retry a failed request without priority; Pi retains its normal error/retry behavior.

### Persistence

The on/off preference is stored as a small custom entry in the **current Pi session branch**, outside model context:

- Resume or reload that session to retain its preference.
- New sessions start **off**.
- Forks inherit the preference at their branch point; tree navigation restores the active branch's preference.
- `--no-session` cannot persist a preference across processes.
- Last-request tier evidence is not persisted and resets on reload or model change.

The extension never writes global settings, credentials, or a separate configuration file. Pi's package-install command manages its own package declaration. Pi's built-in `openai-codex` provider does **not** inherit the native Codex CLI's `config.toml` fast setting; use `/fast on` in Pi.

## Update, reload, or remove

Update installed Pi packages on each computer:

```sh
pi update --extensions
```

Then restart Pi or run `/reload` in each running session. To update only this package:

```sh
pi update git:github.com/EClinick/pi-fast-mode
```

The unpinned Git source follows this repository's default branch. A source pinned with `@<tag-or-commit>` stays pinned during updates; use the same ref on each computer when reproducibility matters.

Useful management commands:

```sh
pi list
pi config
pi remove git:github.com/EClinick/pi-fast-mode
```

`pi list` checks configured packages; `pi config` enables/disables package resources. Restart or `/reload` after removing the package.

### Three-computer setup, with or without Firstmate

1. Install a compatible Pi version and authenticate normally on **each** computer. Do not synchronize credentials through this repository.
2. Run the install command on all three computers. Personal installs make the package available across projects.
3. Restart/reload Pi and run `/fast on` in each session where you want priority requests. Sessions and preferences are local, not automatically synchronized.
4. Run `pi update --extensions` and restart/reload on all three computers when updating.

No Firstmate changes are required. Pi launched through Firstmate can use the same personal package unless its launch disables extensions or uses a different Pi agent directory. In that case, install/enable the package in the Pi environment that launch actually uses.

For a project-only installation instead of a personal one:

```sh
pi install --local git:github.com/EClinick/pi-fast-mode
```

Project resources load only after Pi project trust is granted.

## Supported routes

Only these exact model/provider/API/base-URL combinations are modified. Base URLs may have a trailing slash.

| Pi model selection | API | Configured base URL |
| --- | --- | --- |
| `openai/gpt-6-astra` | `openai-responses` | `https://api.openai.com/v1` |
| `openai-codex/gpt-6-astra` | `openai-codex-responses` | `https://chatgpt.com/backend-api` |

The current Pi model and outgoing payload model must both match. Other models, Azure, proxies/custom endpoints, and mismatched provider/API combinations are left untouched. An unsupported selection is labeled in status even if the preference is on. Response events must match the originating request's provider/API/model.

### Verification and limitations

Real Pi session/command-path tests verified that **on sends `priority` and off omits the tier** for the supported routes, including actual serialized WebSocket frames on `openai-codex`. The tested completed responses reported **`default`**, not priority. **A server-confirmed Astra fast response has not been observed in these tests.** Do not interpret the preference or successful request as a fast-service grant.

Installed Codex 0.160.1 also serializes its fast preference as `priority`; its “Fast on” UI reflects a preference, not checked provider confirmation. Literal `service_tier: "fast"` was rejected on the tested subscription routes, so the extension uses the verified native request value rather than substituting an unverified alias.

See [the investigation report](docs/diagnosis.md) for exact-route reproduction, counterfactuals, provider semantics, and remaining uncertainty. See also [OpenAI's Fast mode guide](https://developers.openai.com/api/docs/guides/fast-mode) and [Responses API reference](https://platform.openai.com/docs/api-reference/responses/create).

The request hook exposes no request ID or model argument. This extension uses the current model plus the wire model and is intended for ordinary sequential Pi agent requests, not concurrent nested-call accounting. Avoid competing tier/routing extensions that could invalidate attribution.

The footer is TUI-only; supported RPC clients receive command/warning notifications through Pi's UI channel. JSON/print modes receive no unsolicited stdout logging. The extension does not log prompts, request bodies, headers, credentials, or response content.

## Development and contributions

Clone the repository and run the ordinary, credential-free tests:

```sh
git clone https://github.com/EClinick/pi-fast-mode.git
cd pi-fast-mode
npm test
git diff --check
```

No dependency installation or build step is needed for the tests. They use Node's built-in runner and a fake Pi host; CI runs them on Node.js 22 and 24. Coverage includes provider/endpoint scoping, bare toggles and explicit on/off/status, save failures, branch persistence, compact badges, quiet repeated responses, missing/different/priority/fast tiers, cross-provider isolation, error/abort handling, RPC, and headless behavior.

An optional **offline** integration test loads the extension with installed Pi's real loader and exercises its native footer across dark/light/system themes and 12–120-column widths, including another extension's status. It sends no model requests:

```sh
PI_TEST_PACKAGE_DIR="$(npm root -g)/@earendil-works/pi-coding-agent" node --test test/pi-rendering.test.js
```

Without that environment variable, ordinary tests skip the installed-Pi check.

To load a local checkout without adding a package declaration:

```sh
pi -e ./src/extension.js
```

Optional live diagnostics are documented in [the investigation report](docs/diagnosis.md). They may incur usage charges and are **never** run by ordinary tests or CI.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request. All paths are owned by **@EClinick**, the sole current maintainer; contributors leave merging to the maintainer.

## License

[MIT](LICENSE).
