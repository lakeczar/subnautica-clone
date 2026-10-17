# Choose delivery and required feasibility gates

Parent: ../map.md
Type: grilling
Label: wayfinder:grilling
Status: resolved
Assignee: lakeczar (with Astra coordinator)
Blocked by: 02, 04

## Question

Which delivery target should the build use, what evidence already exists, and which decisive technical spikes must pass before full world/asset production? This planning decision selects a platform and acceptance gates; it does not claim to prove a game that the owner has reserved for a later run.

## Answer

The owner selected **"A gaming PC or laptop with a dedicated GPU; allow richer scenes."** Under their request to choose the language/environment, the coordinator selects strict TypeScript, Vite and Babylon.js with WebGL 2 for a self-contained desktop-browser build. The [platform research](../../../docs/research/01-platform.md) and rendered art study support this starting choice, not a full-world performance claim.

The [delivery and acceptance contract](../../../docs/DELIVERY_AND_ACCEPTANCE.md) defines the first linked expedition, carrier transition tests, world/performance route and release criteria. Station-kept walkable interiors are the baseline; walking underway is a separate spike. A platform change must respond to a specific demonstrated limitation and a small verified alternative, not speculative preference.

The original ticket phrased technical proof as a planning-stage requirement. Full-world movement, interior and save-system proof belongs to construction, which is explicitly deferred. The ticket now resolves the delivery decision and moves those concrete checks into the future build's mandatory early gates; no test is represented as passed by this change. The existing rendering evidence uses software SwiftShader. Dedicated-GPU performance, gameplay, recovery and duration remain unverified.
