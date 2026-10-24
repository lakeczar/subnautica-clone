# GPU enablement R4: coordinator disposition

**Accepted for execution on `6cc4bec`.** Host-script SHA-256 is `ca097451…5c6b`.

- **The first real rehearsal stopped correctly** at the ReBAR window check. `6cc4bec` adds a 64 GiB OVMF window (`opt/ovmf/X-PciMmio64Mb`) through libvirt's native `<sysinfo type='fwcfg'>`. A fresh Sol reviewer confirmed it at source level in libvirt 12.2 and edk2. The full security-info define is atomic and keeps the password. All 269 offline checks pass.
- **R4-01 (P3) is deferred.** A TERM during define can leave a root-only 0600 temp copy in the host's `/tmp`. It holds nothing beyond what root already holds, `/tmp` is cleared at reboot, and the restricted route can't read it. It gets fixed after activation, together with R3-01.
- **Still to prove on hardware:** that OVMF honours the window and BAR1 gets assigned. `check post` verifies it after the attach.
