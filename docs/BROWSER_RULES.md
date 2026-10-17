# Agent browser usage

Copied from `/work/repos/fleet/BROWSER_RULES.md` on 2026-10-17 for portable implementation tasks. Read the current fleet file when available.

- Use HTTP requests, APIs, or existing artifacts when they answer the task without a browser.
- Run unattended browser automation, screenshots, HTML previews, and browser tests on `factory-worker` or another isolated Linux environment. Verify which machine owns the browser process; a remote thread can still use a Windows-rendered tab.
- Prefer T3's collaborative preview tools when available on the worker. Reuse a suitable session and keep concurrent tabs bounded. Keep separate tasks' storage isolated.
- Keep the owner's Windows desktop free of background browser automation. If remote execution is unavailable, report that limitation and continue work that does not need a browser. Use a local Windows browser only when the user explicitly requests local execution; do not silently fall back to it.
- Browser actions must stay within the target page. Unattended Windows sessions must refuse real pointer lock and must not move, confine, or capture the physical desktop cursor or repeatedly steal focus. Headless mode alone does not provide this isolation. Run tests requiring real pointer lock in an isolated environment.
- Close only the pages, contexts, and browser processes created for your task, when finished, unless the user asks to keep them running. Preserve shared hosts and other tasks' sessions. For app-managed browsers, use the app's lifecycle tools rather than killing processes by name.
- If a browser starts trapping the cursor or consuming excessive resources, stop issuing further browser actions, identify its owner, and report the evidence. Respect instructions to leave existing processes running. Avoid automatic relaunch loops and unverified browser-flag changes.
- Include these rules in delegated browser work.
