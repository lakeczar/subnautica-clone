# GPU enablement R5: coordinator disposition

**Accepted for execution on `785503c`.** Host-script SHA-256 is `23471a53…0271`.

- **The first real attach** (`20261020T032723Z-ae45`) rolled back safely. libvirt reserves `opt/ovmf/` sysinfo names, a check in `qemu_validate.c:1059–1081`.
- **The fix:** the same `-fw_cfg` now goes through `<qemu:commandline>`.
- **The new gate:** a pre-shutdown `virsh domxml-to-native` validates the exact target with real libvirt, so a rejected definition fails before any shutdown.
- **R3-01 and R4-01 are closed.** The fresh Sol reviewer found nothing new, and all 297 offline checks pass.
- **Still to prove:** working hardware, verified by `check post` after the attach.
