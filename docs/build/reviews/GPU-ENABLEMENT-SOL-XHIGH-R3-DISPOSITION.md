# GPU enablement R3: coordinator disposition

**Accepted for execution on `8d6dba9`.** Host-script SHA-256 is `e3365eb3…92d7`.

- **R2-01, R2-02 and R2-03 are closed.** The fresh reviewer checked the regression tests: they fail on `c4d5191` and pass on `8d6dba9`, and all 242 offline checks pass.
- **R3-01 (P3) is deferred.** It is a misleading warning line in the read-only `undo-plan` output. The printed removal command is already correct. It gets fixed after activation in a small follow-up, and no attach step depends on it.
- **Still unproven:** working hardware. Everything in "Still unexecuted" in the R3 report remains a required postcheck.
