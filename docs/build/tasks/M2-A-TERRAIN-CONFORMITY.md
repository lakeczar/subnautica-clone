# M2-A physical and rendered floor conformity

Sol6.1/max implementation leaf under root Astra xhigh. Start at the clean committed assembly in dispatch. Read STATUS, PLAN, CONTRACTS, revised input, M2-A-CONTRACT, M2-A2 report and M2-A2-INTEGRATION. Fix ROOT-A2-FLOOR; no children, peer waits/messages, parent mutation, push, PR or merge.

## Exclusive ownership

Only `src/render/terrainSurface.ts`, `tests/resource-surface.test.ts`, optional new `tests/terrain-boundaries.test.ts`, and new `docs/build/evidence/M2-A-TERRAIN-CONFORMITY.md`. Artifacts `/tmp/siltwake-m2-a-terrain-conformity/`. All other production paths are read-only, including environment/art/materials (parallel performance owner) and all content/physics/camera/save authority. Preserve TerrainSurface and createTerrainSurface's public shape. No reading uncommitted peer changes. Propose any additional scope concretely while continuing independent work.

## Root reproduction and correction

Run `/tmp/siltwake-m2-a2-root/terrain-route-probe.mjs` only after copying it to your artifact directory and changing its output path; never overwrite sealed root evidence. It uses assembled compiled production and float32 triangle interpolation. Reported discrepancies include both directions:

- Rescue bench: (53.325,-60), rendered -33.780265 versus physical -13. Just outside, (54.15,-59.5), rendered -28.115817 versus physical -39.583558; a floor-contact swimming eye would lie10.717741 m below the visible terrain.
- Basin approach offset (173.125,-211.75), rendered7.177676 m above physical. The fixed pad edge is at Z-212.
- Canopy (96.8965517,-98.2241379), rendered2.294883 m above physical. This is smooth ledge interpolation, not a hard pad.

The physical rescue bench and Basin pads have real height discontinuities. Denser triangles alone cannot faithfully bridge these jumps. Represent their actual tops, outer surfaces and vertical joins using correct one-sided heights; don't create artificial ramps. Refine smooth steep ledges using a geometric error criterion over bounded affected areas, not a list of the tested camera coordinates. Keep the old coordinate system, unaffected literal controls, accepted island/workshop extraction and all35 normal views. No heightfield, collider, source, targeting, pose or saved-state changes, no eye lift, no hidden floor gaps and no source filtering.

Retain the170k terrain ceiling if possible. Root authorizes up to220k triangles only with measured necessity and final scene counts below the existing400k vertices/650k triangles/160 draws trials. Current A2 already uses169,784. Preserve every existing correctness assertion; a topology assertion may distinguish an intentional watertight vertical wall from a smooth heightfield, but not blanket-ignore interior edges or discard relevant samples. At a discontinuity, correct one-sided limits and a closed vertical join replace an impossible continuous interpolation criterion; document exact boundary semantics. Preserve unaffected coarse control triangles. No whole-world uniform oversampling.

## Verification

Prove actual submitted float32 triangles against unchanged terrainHeight throughout the changed areas, both sides/corners of each discontinuity, normal source/work approaches, full lane widths, source stock replacement and old island/rib regressions. Use <=.1 m smooth-surface error as the correction target, with near-plane/floor-contact and physical clearance checks at reachable positions. Never present an unreachable seeded pose as ordinary play. Record the remaining maximum error with location/sign and classify unchanged regions honestly. Add meaningful regression tests for the known failures and adjacent boundary cases. Run clean npm run check/build and all three economies, with read-only earned input `/tmp/siltwake-m2-a2/inputs/main-final-ui-export.json`.

Capture matched actual production views at the worst supported floor contacts and both Basin facility approaches, plus brief normal-input approach/contact/retreat smoke. Correct geometry is necessary; inspect actual visual occlusion and facade seams too. Record source/build hashes, retained/staged provenance, pose/tick/quality/viewport/hardware/console. Existing level53 counterplay, warm activation and A3 priority findings remain inherited; do not claim to close them. No fresh earned Basin route, human feel or consumer-GPU claim.

Before browser use read `/work/repos/fleet/BROWSER_RULES.md` and `docs/BROWSER_RULES.md`. Verify isolated factory-worker/Linux process ownership. Prefer T3 preview_status then preview_open, one owned incognito/isolated-storage tab on free port5190. Preserve human/peer tabs/shared hosts, never unattended Windows/desktop pointer lock. Stop only own recordings/server and close owned tab via normal lifecycle. No polling/watchers or peer waits.

Return separate code/report commits, exact checks/geometry/visual evidence, archive manifest/hash, unresolved limits, clean worktree and released resources. Root composes with performance and priority corrections, then earned route/recovery/reload and fresh complete-batch reviews. This leaf is not acceptance.
