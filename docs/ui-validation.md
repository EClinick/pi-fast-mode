# Quiet UI validation

The selected design keeps Pi's native footer and removes the persistent fast badge. It does **not** claim inline-model placement. A toggle acknowledges the preference for two seconds, then disappears; detailed tier evidence remains in `/fast status`.

## Offline interactive check

Checked with installed Pi 1.0.0 in a genuine fullscreen terminal at 120 and 60 columns, using the extension through Pi's normal loader. The run used isolated configuration, no saved session, offline startup, a dummy API key, and no prompts or provider requests. A test-only companion extension supplied an unrelated status and switched between the supported model and an unsupported fixture model.

These are excerpts of terminal captures, not mocked `setStatus` assertions. Cwd and blank padding are omitted below.

120 columns, immediately after `/fast`:

```text
0.0%/272k (auto)                     gpt-6-astra • high
Other ready Fast on
```

After two seconds:

```text
0.0%/272k (auto)                     gpt-6-astra • high
Other ready
```

60 columns, toggled off:

```text
0.0%/272k (auto)                          gpt-6-astra • high
Other ready Fast off
```

60 columns, unsupported model selected and toggled on:

```text
0.0%/272k (auto)                        offline-other • high
Other ready Fast on (unsupported)
```

After expiry, switching back, and clearing only the companion extension's status, the native model/effort row was the final row: there was no fast-status row. The original enable-time pricing/availability disclosure remained in Pi's transcript; it is intentionally not the transient acknowledgment.

## Automated checks

- Dependency-free tests verify request scoping, persistence, evidence semantics, quiet responses, two-second expiry, rapid toggles, failed saves, status queries, lifecycle cleanup, and RPC/headless behavior.
- The opt-in installed-Pi test uses its real loader and native `FooterComponent` across dark/light/system themes and 12, 20, 40, 80, and 120 columns. It checks another extension's status survives and the native footer returns to its exact pre-toggle rendering after expiry, with no fast-status row at rest through model switches.
- Tests forbid footer replacement. The implementation uses only its own shared status key; another custom footer remains responsible for rendering shared statuses.

See the README's testing instructions to run the optional installed-Pi check. These checks establish UI placement and cleanup, not live priority availability or latency improvements.
