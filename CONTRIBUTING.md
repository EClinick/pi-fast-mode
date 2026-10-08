# Contributing

## Local setup

Use Node.js 22 or later. Clone this repository and create a feature branch:

```sh
git clone https://github.com/EClinick/pi-fast-mode.git
cd pi-fast-mode
git switch -c your-change
npm test
```

Tests use Node's built-in test runner. No dependency installation, credentials, network access, or build step is needed to run them. CI runs the tests on Node.js 22 and 24.

To try the extension interactively, install Pi 1.0.0 or later (`@earendil-works/pi-coding-agent`) with the request-replacement and parsed-stream-event hooks, then run from this checkout:

```sh
pi -e ./src/extension.js
```

Use `/fast status`, `/fast on`, and `/fast off`. Start a new Pi invocation after editing the extension, or use `/reload`. The preference is stored in the current session branch; new sessions default off. Consult [README.md](README.md) for exact supported model/provider/endpoint combinations, package installation, and updates.

## Changes and validation

- Keep this a standalone Pi package without Firstmate runtime dependencies.
- Leave unrelated models, providers, and endpoints untouched. Add focused tests for any scope changes.
- Preserve the distinction between a requested service tier and final provider confirmation. Missing evidence must remain unknown, not priority.
- Keep priority opt-in and retain the pricing warning. Never log credentials, prompts, request bodies, or sensitive response details.
- Add or update tests in `test/extension.test.js` for behavior changes, and update user documentation when behavior changes.
- Before opening or updating a pull request, run:

  ```sh
  npm test
  git diff --check
  ```

Ordinary tests must remain credential-free and make no live requests. Any optional live probe requires account access and may incur charges; use minimal non-project input, a timeout and output bound, and no unnecessary retries. Report only non-sensitive compatibility evidence, not secrets or payloads.

**Current live evidence:** the real Pi `/fast on` path delivers `service_tier: "priority"` over HTTP, but the final provider tier is **`default`**. Native Codex endpoint probes, including genuine WebSocket, also returned `default`; installed Codex serializes its `fast` preference as `priority`. Actual fast/priority service has not been confirmed. See [the diagnosis](docs/diagnosis.md) for the tested counterfactuals and optional live probe. Synthetic priority-response tests and a preference labeled on do not establish live priority availability; keep this limitation explicit in documentation and contribution claims.

## Pull requests and merging

Submit changes through a pull request against `main`, with a summary, test results, and any remaining compatibility limitations. Do not push changes directly to `main` or merge without maintainer authorization.

The sole current maintainer is **@EClinick**, who owns all paths through [CODEOWNERS](.github/CODEOWNERS) and has sole merge authority. Repository protections restrict updates to `main` to repository administrators through pull requests and block deletion and non-fast-forward updates. CODEOWNERS identifies ownership; it does not itself enforce these remote protections.

There is intentionally no mandatory independent approval requirement that would prevent the sole maintainer from merging their own pull request. Contributors should leave merging to @EClinick after review and validation; do not enable auto-merge on the maintainer's behalf. Changes to repository protections are a maintainer responsibility, not part of an ordinary contribution.
