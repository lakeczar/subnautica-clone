# Browser hardware video encoding for REC-1

Sol 6.1, xhigh · researched 2026-10-24 · research only.

Context: `origin/t3/rec-1-flight-recorder` at `bcd3d006c6ce44a5b02d9df8ee2d24a6a67b55a6`, [REC-1 handoff][R1]. Project direction, game direction and model policy were read. No browser, GPU job, benchmark, implementation change, PR operation or delegation was performed. Online research used HTTP retrieval of specifications, upstream source, release notes and vendor documentation. No `docs/spoilers/*` was read.

## Decisions for the builder

1. **Windows: probe hardware AV1, H.264 and HEVC, then choose using actual capture/encode cost and playback requirements.** The RTX 4070 Laptop has AV1, H.264 and HEVC encoding hardware. VP9 and VP8 do not use its NVENC hardware. Start with AV1 for compression efficiency; retain hardware H.264 as the compatibility and low-cost reference. A newer codec is not evidence of lower overhead. Chrome/Edge can reach NVIDIA's encoding engine through Windows video APIs; JavaScript does not call the NVENC SDK. Do not silently move the owner's Windows recorder to CPU encoding. [N1][C2][C3][C4]
2. **Factory-worker: stock Linux Chrome has no direct NVENC backend.** Its VA-API feature flag cannot turn `nvidia-vaapi-driver` into an encoder: that driver explicitly implements **decoding only**. The 3090's encoding silicon is usable by native NVENC applications, but not by this documented Chrome/driver combination. Try a separately validated native capture route if useful; after hardware/native alternatives fail, the owner permits worker software encoding at **960×540** on Linux. [C2][C5][N2][N3]
3. **WSL2: investigate Mesa's D3D12 VA-API encoder before declaring software unavoidable.** This is a real documented encode path, including H.264 and HEVC, not merely accelerated rendering or decoding. It still needs the installed Mesa VA driver, Windows driver capabilities, Chromium's Linux gates and working interop. AV1 has newer Mesa source support; its availability on this sandbox is **unverified**. WSL Chrome uses its Linux backend, not Chromium's Windows D3D12 encoder. [M1][M2][M3][C2][C5]
4. **Keep WebCodecs in the worker and explicit page-time timestamps.** First test `new VideoFrame(gameCanvas, { timestamp, alpha: 'discard' })`, transferred to the worker. Chrome can wrap a GPU shared image without first copying its pixels to the CPU. Whether it stays GPU-resident through the encoder depends on the platform, image usage, pixel format and scaling path. If direct encoder scaling is costly, retain GPU bitmap scaling and construct the worker's `VideoFrame` directly from the transferred `ImageBitmap`. Neither `OffscreenCanvas` nor `ImageBitmap` guarantees zero readback. [C1][C6][C7][C8]
5. **Use MP4 for H.264/HEVC; prefer fragmented MP4 for bounded worker streaming.** WebM remains appropriate for VP8/VP9/AV1. H.264 in a file labelled WebM is nonstandard. Both named MIT muxers are now deprecated and unmaintained; their maintained successor, Mediabunny, is **MPL-2.0, not MIT**. A pinned/audited `mp4-muxer` is a practical small MIT option if MIT is required. [W3][W4][L1][L2][L3]

**Do not promise the 0.167 ms budget from this research.** No primary source supplies a transferable millisecond bound for this game's canvas and GPU. Also, REC-1's 0.3–0.4 ms per render frame is **inclusive recorder overhead**, not an isolated measurement of encoding plus readback. R3 reports +246 ms/s renderer-process CPU, consistent with substantial worker/software-encoder work, but its shared no-video diagnostic did not remove the main-thread overhead; renderer timing/GPU queries remained a lead. Hardware encoding can remove CPU encode work while leaving that separate cost. The builder needs the decomposition and inclusive A/B, not another self-time-only verdict. [R1]

## 1. What support means

The W3C specification makes `hardwareAcceleration` a **hint**: a user agent may ignore it for any reason. `isConfigSupported()` returns a boolean and a copy of recognized configuration members. It does not report which encoder actually ran. No codec implementation is universally required; the application must query the precise configuration instead of maintaining a presumed codec whitelist. A supported configuration can still fail when resources are acquired or a real frame is submitted. [W1][W2]

**Chromium is more discriminating than that general guarantee.** At the examined revision:

- `isConfigSupportedWithHardwareOnly()` checks accelerated profiles; `GetRequiredEncoderType()` requires hardware for `prefer-hardware`, and `IsAcceleratedConfigurationSupported()` filters out profiles marked `is_software_codec`.
- With `prefer-hardware`, `CreateMediaVideoEncoder()` returns the accelerated encoder result directly. It installs `VideoEncoderFallback` for other eligible preferences, not for this branch.
- The hardware support query checks advertised profile, dimensions, rate control, frame rate, scalability and some pixel-format properties. It is **not** an end-to-end encode of the game's GPU image. Driver advertisements, initialization, GPU resets, encoder-session limits and texture interoperability can still defeat a positive answer. [C1]

Therefore, for this Chromium source, a positive hardware query followed by successful real-frame output is strong evidence of hardware selection. A false result is useful: do not change to `no-preference` and call the ensuing success hardware. Across browsers, the echoed preference is never an actual-hardware receipt.

Chromium source references below are pinned to upstream commit `f45262ae78835ec26ff8be22aa15fa0e38f726d4` (2026-10-24). Firefox/WebKit source describes examined upstream capability, **not a guarantee about every released binary**. REC-1 reports Chrome 156; the probes must record its exact version/revision and flags. Vendor capability tables describe engines/drivers, not WebCodecs exposure.

## 2. Support matrix

**Legend:** **H** = a browser hardware backend and compatible hardware exist, subject to the exact configuration/driver/blocklist; **S** = software is the available route, with `no-preference`/`prefer-software`; **—** = no verified exposed encoder in that configuration; **H?** = a conditional hardware route whose success on the named setup is unverified; **S?** = software depends on build/feature/codec availability. H does not mean measured here. On examined Chrome, an H cell should return `supported: true` for a compatible advertised profile/configuration; an S cell should normally return `supported: false` with `prefer-hardware` and may return true with a software-permitting preference. H? requires the actual-machine query. S is **not** a hardware fallback promise. Safari/Firefox can instead acknowledge the hint and still select software, as detailed below.

### Chromium browsers

| OS / browser | GPU / driver class | H.264 / AVC | HEVC | VP8 | VP9 | AV1 | Basis / qualification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Windows, Chrome / Edge | RTX 40-series laptop, including 4070 | H | H | S | S | H | Windows D3D12 / hardware Media Foundation; exact OS/driver/backend can restrict profiles. [C2][C3][C4][N1] |
| Windows, Chrome / Edge | RTX 3090 / Ampere | H | H | S | S | S | Ampere lacks AV1 encode, although it can decode AV1. [N1] |
| Windows, Chrome / Edge | Intel 11th–13th-gen Xe / supported iGPU | H | H | S | H? | S | VP9 needs an exposed Intel hardware MFT. AV1 decode on these iGPUs does not imply AV1 encode. Chromium's current Windows VEA does not expose VP8. [C3][C4][I1] |
| Windows, Chrome / Edge | Intel Arc Alchemist, or AV1-encode-capable Core Ultra | H | H | S | H? / S | H? | AV1-capable generations exist; VP9 encode varies even between newer generations. Verify the actual part and Windows driver, not just the Intel name. [I1][C3][C4] |
| Windows, Chrome / Edge | AMD RX 5000 / 6000, with encode engine | H | H | S | S | S | Exceptions include Navi24 RX 6300/6400/6500 models lacking encode. [A1][C3][C4] |
| Windows, Chrome / Edge | AMD VCN 4/5, e.g. RX 7000 / compatible APU | H | H | S | S | H? | AV1 encode engine exists; browser/driver exposure must pass the query. [A1][C3][C4] |
| Desktop Linux, Chrome, stock upstream feature defaults | Intel / AMD | S? | — | S | S | S | Linux accelerated encode feature is disabled by default in examined upstream source. Distros/Finch/builds can differ. [C5] |
| Desktop Linux, Chrome, VA-API encode enabled | Intel iHD, compatible generation | H? | — | H? / S | H? / S | H? / S | Hardware possibilities follow generation and driver; see details below. Chromium VA-API VEA supports H.264/VP8/VP9/AV1, **not HEVC encode**. [C9][I1] |
| Desktop Linux, Chrome, VA-API encode enabled | AMD Mesa, engine/codec-enabled build | H? | — | S | S | H? / S | H.264 on encode-capable parts; AV1 on VCN4+ if Mesa/build/browser support aligns. Native HEVC capability does not make Chromium's VA-API VEA implement it. [C9][A1] |
| Debian, Chrome, NVIDIA proprietary 550; factory-worker | RTX 3090, ANGLE GL-EGL | S? | — | S | S | S | No direct NVENC backend; `nvidia-vaapi-driver` has no encode entrypoints. GL-EGL proves rendering, not encoding. [C2][N2] |
| WSL2 Ubuntu, Linux Chrome, VA-API enabled | RTX 4070 Laptop via Mesa D3D12 | H? | — | S | S | H? / S | Mesa D3D12 can provide encode; Chromium still needs Linux VA-API integration. AV1 depends on newer Mesa plus driver support. Native VA-API HEVC may work while WebCodecs HEVC does not. [M1][M2][C9] |
| macOS, Chrome | Supported Apple / Intel hardware | H? | H? | S | S | S | VideoToolbox backend; do not infer AV1 encode from AV1 decoding support. Included for contrast with Safari. [C2] |

H.264 software cells are conditional on Chromium's `ENABLE_OPENH264` build flag and runtime feature; examined source enables that feature by default where built. HEVC has no bundled software encoder in Blink's software encoder factory. VP8/VP9 use libvpx and AV1 uses libaom where compiled. Branding and proprietary-codec build choices still matter. [C1][C5][C10]

**Intel distinctions:** the media-driver's primary table distinguishes decoding (`D`), encoding (`E`) and shader encoding (`Es`). For example, its Tiger/Alder/Raptor grouping has VP9 encode and AV1 decode; Arc Alchemist has AV1 encode; Meteor/Lunar Lake have AV1 encode but their table lists VP9 **decode**, not encode. Some older Intel generations support VP8 encode, while many newer ones do not. Even an `Es` encoder is not equivalent to a dedicated fixed-function engine with no rendering contention. The Linux table is useful evidence of silicon/VA-API capability, not proof that an equivalent Windows MFT exists. [I1]

**Windows details:** no special encoder-enabling flags are normally needed; examined source enables the Windows hardware backends by default. Chromium tries its D3D12 VEA and then Media Foundation. The former handles H.264, HEVC and AV1; hardware Media Foundation enumerates H.264, VP9, AV1 and optionally HEVC. Neither exposes VP8 in this source. Support can depend on active adapter: the D3D12 factory explicitly has a TODO about selecting a secondary adapter when the default cannot encode a codec. An Intel+NVIDIA laptop may therefore encode on a different GPU from the one the owner expects, or pay for a cross-adapter copy. JavaScript cannot select an NVENC device or preset. Edge shares the Chromium architecture but its exact revision, policies and feature rollout still require a query. [C2][C3][C4]

HEVC platform encoding reached WebCodecs in Chromium **M130**; Chrome **136** release notes document its subsequent MediaRecorder exposure and MP4/Matroska container support. This does not mean HEVC encoding works on every OS; the Linux VA-API implementation above remains a separate limit. [C11]

### Firefox and Safari

| OS / browser | GPU class | H.264 | HEVC | VP8 | VP9 | AV1 | Qualification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Windows, Firefox | NVIDIA RTX40 / RTX30 | H? | — / experimental | S | S | S / H? experimental | WMF route exists; AV1 FFmpeg hardware path is build/pref-dependent. Do not promise release support from trunk. [F1][F2][F3] |
| Windows, Firefox | Intel | H? | — / experimental | H? / S | H? / S | S / H? experimental | Hardware MFT availability and generation matter; current MFT discovery lists H.264/VP8/VP9. [F1][F2][F7] |
| Windows, Firefox | AMD | H? | — / experimental | S | S | S / H? experimental | AV1 hardware requires both an encode-capable part and an enabled browser backend. [F1][F3][A1] |
| Linux, Firefox | Intel / AMD | H? / S? | — / experimental | H? / S | H? / S | H? / S | Current FFmpeg module can discover hardware encoders; EGL, DMA-BUF, gfx capability gates, system FFmpeg and codec support are prerequisites. This is **not** proof that arbitrary VA-API encoders initialize successfully. [F1][F3][F4] |
| Linux, Firefox | NVIDIA proprietary | H? / S? | — / experimental | S | S | H? / S | FFmpeg hardware enumeration is a different mechanism from Chromium's VEA. A system NVENC encoder is a possibility, **not verified**; do not claim Firefox+`nvidia-vaapi-driver` provides encoding. [F3][N2] |
| macOS, Firefox | Apple / supported Intel hardware | H? | — | S | S | S? | Examined Apple encoder module advertises H.264 only; software open-codec availability depends on the build. [F5] |
| macOS / iOS, Safari | Apple media hardware; supported Mac hardware | H? | H? | S | S? | S? | H.264/HEVC platform path; open codecs use WebKit's software VPX/AV1 path when enabled. Current WebKit does not forward the requested hardware preference in its encoder config. No hardware AV1 encode established. [S1][S2][S3] |
| Windows / Linux, Safari | Any | — | — | — | — | — | No current Safari product on these OSes. |

MDN compatibility data places the `VideoEncoder` API at Chrome 94, Firefox 130 and Safari 16.4; **API presence is not codec/hardware support**. [B1]

Firefox's current `FFmpegVideoEncoder::InitEncoder()` explicitly contains a TODO that allows software fallback after hardware failure even for its internal `RequireHardware` preference. Its module can advertise hardware support by finding an encoder before actual initialization. [F6] Thus `prefer-hardware` plus `supported: true` is weaker evidence there than on the examined Chromium path. HEVC WebCodecs is Nightly-gated in examined Firefox preferences. The Firefox rows deliberately leave unverified successful initialization conditional rather than turn source-level enumeration into a hardware guarantee. [F2][F3]

Safari's examined `createVideoEncoderConfig()` forwards dimensions, bitrate, frame rate, realtime mode and scalability, but not `hardwareAcceleration`. Its platform code enables hardware acceleration for VideoToolbox without requiring it. Its support query attempts encoder creation and echoes the requested config, which still does not identify the engine. The remote codec selector handles H.264/HEVC; the local open-codec factory routes VP8/VP9/AV1 to software. [S4] Probe Safari's exact OS/version before treating an affirmative answer as hardware. [S1][S2][S3]

## 3. Linux flags and the NVENC boundary

For a **compatible VA-API installation**, the current Chromium feature is:

```text
--enable-features=AcceleratedVideoEncoder
```

The C++ symbol is `kAcceleratedVideoEncodeLinux`, whose feature string is literally `AcceleratedVideoEncoder`. The GPU encoder factory checks it on Linux. `VaapiVideoEncoder` is an older flag name seen in recipes; it is not a current feature in the examined source. Appending historical names is not evidence that anything was enabled. [C2][C5][C12]

Keep factory-worker's already validated rendering selection, `--use-gl=angle --use-angle=gl-egl`, while testing encode separately. `--use-gl=egl` is not an encoding switch, and blindly replacing the working ANGLE configuration can confound the probe. `--ignore-gpu-blocklist` bypasses a blocklist, not a missing codec backend. Chromium documents additional developer switches including `VaapiIgnoreDriverChecks` and `VaapiOnNvidiaGPUs`; the latter is disabled because NVIDIA VA-API implementations are known not to support Chromium correctly. None implements encoding. `AcceleratedVideoDecodeLinuxZeroCopyGL` concerns **decoding**, not an NVENC or encode enable switch. The Linux VA-API document explicitly says there is no support guarantee. Flags also cannot add a VA-API backend omitted at build time, grant access to a missing video device, or load an absent codec driver. [C5][C12]

**Probe CBR explicitly on Linux.** The examined VA-API implementation advertises CBR as its baseline; VBR is only implemented for H.264 and is itself feature/driver-gated. A VBR-only test can incorrectly discard a working AV1/VP9 hardware path. Try CBR before concluding that codec is unavailable. [C9][C18]

**Does Linux Chrome ever call NVENC?** There is no direct NVENC implementation in the examined upstream encoder factory: Linux chooses VA-API or, on applicable builds, V4L2; Windows chooses D3D12/Media Foundation. `nvidia-vaapi-driver` uses **NVDEC**, explicitly says encoding is unsupported, and targets Firefox decoding. Consequently that combination cannot provide NVENC to WebCodecs or MediaRecorder. A hypothetical third-party VA-API implementation with actual encode support could reach NVIDIA's encoding engine indirectly; that is not an available, verified solution established here. [C2][N2]

Factory-worker's Debian passthrough is not itself a barrier to **native** NVENC. NVIDIA's SDK supports Linux. The barrier is the browser's missing backend. A native recorder or helper is a separate integration: it must acquire browser/desktop GPU surfaces, preserve timestamps and avoid expensive screenshot/readback paths. Merely sending CDP screencast JPEGs to FFmpeg NVENC does not remove the browser's capture/JPEG cost. No such integration was measured or authorized for implementation in this task. [N3][R1]

## 4. Capture: what can remain on the GPU

### Direct `VideoFrame` is a real candidate, not a zero-copy contract

Chromium's `VideoFrame` constructor accepts canvas/ImageBitmap sources. When the source image is texture-backed, GPU compositing works, and alpha handling is compatible, it uses `VideoFrame::WrapSharedImage()`. The alternative uses a software SkImage/raster path. Transfer of the resulting frame to a worker transfers the handle; it need not copy a full pixel array. Preserve the existing rule of taking the picture **inside the render callback that drew it**, before a WebGL drawing buffer can be discarded. [C6][W1][R1]

That only establishes the first leg:

```text
WebGL canvas → GPU shared-image VideoFrame → worker → platform encoder
```

The encoder may directly accept a suitable shared image. Otherwise Blink's `StartReadback()` can use an accelerated frame pool to convert RGB into an encoder-compatible buffer, or fall back to background readback into CPU memory. Its adapter passes compatible GPU frames through, but can instead prepare/copy/convert a CPU frame. Shared-image usage flags, NV12/RGB formats, native-buffer support and resizing all matter. Worker ownership and flow control are also covered by Chrome's WebCodecs guide. [C17] A method called “readback” may produce a GPU memory buffer without a CPU pixel transfer; conversely a frame with GPU backing can ultimately be mapped/copied by a later stage. **GPU-resident** here means avoiding a raw-frame CPU round trip, not literally zero GPU copies or zero synchronization. [C1][C7][C8]

Windows is the strongest candidate: Chromium advertises D3D shared-image processing and D3D12 shared-image encoding. RGBA-to-NV12 conversion and scale can use GPU processing. On Linux, EGL/GL textures and VA-API surfaces require compatible native-buffer import/export; the mere presence of EGL is insufficient. A WSL D3D12-backed Linux texture does not become a Windows Chromium D3D12 encoder input automatically. [C3][C4][C8][M1]

### Practical capture order

| Path | GPU residency opportunity | Main-thread work / limits |
| --- | --- | --- |
| `new VideoFrame(gameCanvas, {timestamp, alpha:'discard'})` → transfer → worker WebCodecs | Constructor wraps shared image; platform encoder accepts it or uses GPU conversion. Best first probe on Windows. | Synchronous canvas snapshot/flush, object creation, transfer and later resource-release work. Encoder processing may still trigger cross-process/GPU synchronization. No universal time bound. |
| GPU `createImageBitmap(gameCanvas, resize options)` → transfer → worker `new VideoFrame(bitmap, …)` | Can GPU-scale via accelerated blit, retain shared image, then feed hardware. Fits the current recorder's boundary. | Bitmap capture/resize initiation, promise continuation and transfer still originate on main. Construct directly from bitmap; an extra bitmaprenderer canvas need not be in the video path. Close bitmap/frame handles promptly. |
| Transferred bitmap → worker `OffscreenCanvas` bitmaprenderer → `VideoFrame` | Possible GPU image handoff; useful if the staging canvas is otherwise necessary. | Extra surface/object transition, not a guaranteed improvement over direct bitmap input. `OffscreenCanvas` alone changes ownership, not codec support. |
| Game rendered into worker-owned WebGL `OffscreenCanvas` → worker `VideoFrame` | Can move snapshot initiation off main too. | Larger renderer ownership change; not a required REC-1 change. Does not guarantee GPU encoder interop. |
| GPU canvas → software WebCodecs in worker | Requires CPU-accessible pixels somewhere; readback/conversion can be asynchronous. | Worker CPU encode leaves main; readback submission/completion, GPU stalls and shared resource contention can still affect game frames. |
| WebGL canvas → 2D `drawImage` staging | Can choose readback/raster rather than a GPU blit. | **Reject as the default:** REC-1 observed 40–75 ms per picture on the 4070 D3D12 route. This was that measured path, not a claim that every 2D canvas always reads back. [R1] |

Chromium's bitmap transform source explicitly uses an accelerated blit when possible and falls back to software if unavailable. Requested unpremultiplied-alpha transforms use its pixmap/readPixels path. Avoid unnecessary alpha preservation and `premultiplyAlpha: 'none'` in an opaque recording pipeline. Do not use `getImageData()`, WebGL `readPixels()` or `VideoFrame.copyTo()` merely to hand pixels to hardware; those defeat the intended raw-frame CPU avoidance. [C13][C6][W1]

**Scale encoded pixels, not just display metadata.** `VideoFrame` display dimensions are not a GPU resize request. `VideoEncoderConfig.width/height` specify actual output resolution and require the encoder to scale mismatched frames, but the spec does not require GPU scaling. Probe direct full-size-frame → 720p hardware output against an explicitly GPU-scaled bitmap; keep whichever avoids CPU conversion and meets the whole cost budget. [W1][C7]

### `captureStream()` plus `MediaRecorder`

Chrome has a canvas capture fast path (`kOneCopyCanvasCapture`) that copies rendering results into an accelerated video-frame pool, with a snapshot/conversion fallback. MediaRecorder can use the same accelerated encoder infrastructure and can fall back to software. It is a legitimate **alternative probe**, not a magic hardware bypass for Linux NVIDIA. `MediaRecorder.isTypeSupported()` establishes a MIME/container/codec possibility, not hardware use. Probe MP4/H.264, MP4/AV1 and MP4/HEVC as available, inspect the resulting `mimeType`, actual file and encoder log; do not rely on a default VP8 choice. [C14][C15][C11]

For 12 fps, `canvas.captureStream(0)` plus `track.requestFrame()` offers explicit capture requests after selected renders; it does not guarantee exact supplied timestamps. MediaRecorder dates its own stream and owns segmentation. REC-1 already replaced it because segment starts, stalls and export cutoffs were difficult to align correctly. Reintroducing it requires passing the same barcode/time, pause/stall, segment rotation and export-tail checks. Its smaller page API surface does not prove lower inclusive main-thread cost. It does not automatically include the DOM HUD or sound. [W5][R1]

## 5. Containers and library maintenance

| Container | Suitable codecs here | Practical consequence |
| --- | --- | --- |
| WebM | VP8, VP9, AV1 | Keep the current small WebM writer for the software Linux/open-codec path. H.264/HEVC are outside WebM's codec subset. [W3][W6] |
| Matroska `.mkv` | H.264, HEVC, VP8/VP9/AV1 | Closest EBML relative to existing WebM. Use Matroska document type, proper codec IDs and codec-private data: e.g. `V_MPEG4/ISO/AVC` and its AVC configuration record. Merely renaming a WebM file is insufficient. External tooling such as FFmpeg/VLC is a reasonable target; ordinary browser `<video>` playback is less portable and must be checked. [W4][L2] |
| Fragmented MP4 `.mp4` | H.264, HEVC, AV1 (and VP9 where playback supports it) | Recommended hardware output: initial metadata plus `moof`/`mdat` fragments, bounded streaming and broad H.264 playback. HEVC/AV1 playback still needs a supported decoder. Each retained recording segment needs its own initialization and keyframe. [L1][C11] |

**Recommended split:** hardware H.264/HEVC/AV1 → worker fMP4; software VP8/VP9 → existing WebM. AV1 WebM is also standard and may be preferable if it avoids adding a second AV1 container path. Encode and playback support are separate probes; validate the export viewer and the offline pack/strip decoder too.

| Library | License verified | Status and fit |
| --- | --- | --- |
| `mp4-muxer` (manifest 5.2.2) | MIT | Author explicitly says deprecated and no longer maintained, with no new features or fixes. Frozen docs support AVC, HEVC, VP9, AV1, `fastStart: 'fragmented'`, streaming targets and timestamp offset behavior. Practical small MIT choice **only with a pinned version and project-owned maintenance/audit**. [L1] |
| `webm-muxer` (manifest 5.1.4) | MIT | Also explicitly deprecated/unmaintained. Frozen docs support WebM and `type: 'matroska'`; custom Matroska codec strings are possible. A container writer still needs correct codec-private records and decoding validation; an option alone does not guarantee H.264 compatibility. Existing Siltwake WebM writer makes a replacement unnecessary for VP9. [L2] |
| Mediabunny (manifest 1.62.1) | MPL-2.0 | Author's current maintained successor, TypeScript, zero dependencies, tree-shakable; README advertises configurations as small as 5 kB gzipped, **not a measured Siltwake bundle size**. Supports fragmented MP4 and WebM/Matroska. This is a viable active alternative if MPL is acceptable; do not describe it as MIT or silently treat licenses as interchangeable. [L3] |

For AVC/MP4 use `avc: { format: 'avc' }` and preserve `output(chunk, metadata)`'s `decoderConfig.description` for the muxer's `avcC`. Do the equivalent for HEVC and AV1 using a codec-aware muxer. Do not write Annex-B bytes as length-prefixed MP4 samples without conversion. Use actual chunk timestamps/durations, subtract **one** segment origin, and store that origin with the timeline. A ten-minute segment is independently decodable; a two-second fragment inside one segment is not a replacement for that segment's initialization. Handle midstream decoder-config changes explicitly. [W7][W8][L1][R1]

Do not concatenate complete MP4 segments byte-for-byte and expect one valid MP4. Teach the viewer/pack reader the container and segment metadata or remux on export. For bounded memory, write fragments incrementally in the worker; avoid a whole-playtest in-memory `fastStart` relocation. A crash can still leave the final fragment incomplete; only report durably committed, decodable coverage. [L1][R1]

## 6. Low-cost encoder settings and native precedents

Suggested **starting configuration**, not a measured optimum: 1280×720 at 12 fps, SDR 8-bit 4:2:0, `alpha: 'discard'`, `hardwareAcceleration: 'prefer-hardware'`, `latencyMode: 'realtime'`, one temporal layer, and VBR. Start H.264 around 3 Mbit/s and AV1/HEVC around 2 Mbit/s as **quality-probe values**; judge dark moving water, foliage, text edges and evidence readability. These bitrate numbers are recommendations, not vendor performance results.

| Control | Recommendation / reason |
| --- | --- |
| `latencyMode` | Use `realtime`. Spec permits quality sacrifices and frame dropping to meet latency; measure and record missing output timestamps. It is not a fixed NVENC preset or “no drops” promise. [W1] |
| `bitrateMode` | Probe `variable` first for local recording; also probe `constant` when VBR is unsupported by the hardware profile. Neither guarantees lower CPU use. Chromium's hardware query actually filters advertised rate-control modes. Avoid `quantizer` as the default: codec-specific quantizers and support require another compatibility path. [W1][C1] |
| Keyframes | Request the first picture of each independent segment and roughly every **2 seconds** (24 pictures at 12 fps, preferably scheduled by timestamp). This is a seeking/recovery trade-off. Avoid all-intra recording; keyframes are larger and costlier. WebCodecs has per-frame `encode(frame, {keyFrame:true})`, not a portable GOP-length config member. [W1][O1][L1] |
| `scalabilityMode` | Omit it or use recognized `L1T1`; no temporal/spatial hierarchy is needed for one local video. Extra modes can exclude otherwise usable hardware and add encoder state. [W1][C1] |
| Resolution | Keep 720p hardware on Windows while choosing the best path. Linux last resort: actual **960×540** encoded pixels. This is 56.25% of 720p's pixel count, not a guaranteed 43.75% CPU-time reduction. Scaling/readback/backend costs need measurement. |
| Frame rate | Keep the 12 fps evidence cadence. Lowering it saves pictures per second but changes evidence coverage; it requires a recorded compromise. Setting `framerate:12` alone does not schedule capture or limit submissions. [W1][R1] |
| Backpressure | Keep only a small bounded number of outstanding frames, close frames promptly, and record skipped pictures as timestamped loss. `encodeQueueSize` measures queued requests, not all frames still inside the platform encoder. Do not flush after every picture; flush at export/segment barriers. [W1][R1] |

**What native tools teach:** ShadowPlay and Highlights use dedicated NVIDIA capture/encode infrastructure, and Highlights lets games trigger retention of event clips. OBS uses NVENC, AMD and Quick Sync paths. NVIDIA's SDK exposes P1 (fastest) through P7 (slowest/highest quality), tuning, lookahead, multi-pass and GPU-resident inputs. Its guide says the encoding engine is independent of graphics/CUDA, but some features, such as lookahead and temporal AQ, use CUDA. NVIDIA also warns that cross-GPU copies can erase the benefit of using another encoder GPU. Those are reasons to keep capture, conversion and encode on one adapter and avoid expensive quality analysis in a cost-constrained native helper. ShadowPlay's product page makes the native hardware-capture claim; its marketing is not a Siltwake performance measurement. [N3][N4][N5][N7]

OBS's published local-recording baseline is P5, high quality, quarter-resolution two-pass, lookahead off, AQ on, two B-frames and a two-second keyframe interval. It is a **quality baseline**, not proof of this recorder's sub-1% target. A native helper seeking minimum cost should measure a faster/single-pass preset with lookahead off, rather than blindly copy either P5/P6 or maximum-quality guidance. [O1][N3][N4]

Xbox Game Bar is an OS recording facility, not a browser API. The Xbox support page retrieved here served a JavaScript shell, so **its exact current codec/preset/backend behavior was not verified**. Microsoft's documented native screen-capture sample does preserve Direct3D surfaces and explicitly enable hardware transcoding. That is a useful architectural precedent, not evidence of Game Bar's internal settings or a browser performance number. [M4][M5]

**Transferable to WebCodecs:** GPU surfaces, one adapter, realtime mode, bounded queues, modest pixels/fps and controlled keyframes. **Not exposed portably:** NVENC P1–P7, explicit B-frame count, lookahead/AQ toggles, CUDA/NVENC session selection, multipass control or an NVENC device selector. Do not invent config fields for these; unknown fields may be discarded by support queries. [W1][W2]

## 7. Runtime selection and fallback detection

### Selection protocol

Run this on the machine actually recording, inside the worker where possible. These are builder instructions; no probes were run for this report.

1. Require a secure context, `VideoEncoder` and the needed worker/OPFS capabilities. Probe **complete actual configurations**, not codec name alone. Initial codec strings to test include AVC baseline `avc1.42001f` (then main/high if useful), HEVC main `hvc1.1.6.L93.B0`, VP9 profile 0 `vp09.00.31.08`, AV1 main 8-bit `av01.0.05M.08`, and `vp8`. These strings are candidate compatible profiles/levels, not guarantees. Use 1280×720/12 fps first, both supported rate-control modes as needed, and `prefer-hardware`. Compare returned recognized fields with the requested config. [W2][W7][W8][W9]
2. For each positive result, use a **fresh encoder**, configure it, submit representative actual game frames through the proposed capture path, collect output and errors, then flush once after a bounded trial. A state of `configured`, an empty queue, or a resolved support promise is not sufficient. Match outputs to input timestamps and request a keyframe. Set a generous startup timeout separately from steady-state latency.
3. Warm up and judge a few seconds of steady-state output. Keep actual frame dates, output byte count, errors, maximum queue/oldest outstanding age and capture/worker turnaround. An actual canvas-frame trial matters: synthetic CPU-buffer input cannot establish GPU interop or readback cost.
4. Rank successful **hardware** candidates by whole-recorder cost within the budget, then evidence quality/storage and export playback. Never relabel a `no-preference` success as hardware. Cache only for the session or a browser/driver-specific key and re-probe after a runtime encoder failure.
5. On a failure, close the failed encoder and its frames, finalize valid prior coverage, record the reason/gap, and start a fresh independent segment with the next candidate. Preserve page time, timeline origin, retention ledger and export-tail correctness. Use hysteresis/bounded retries to avoid repeatedly stalling gameplay on a permanently unavailable encoder. [R1][W1]

### What can actually identify software

| Observation | What it proves |
| --- | --- |
| `support.config.hardwareAcceleration === 'prefer-hardware'` | The member was recognized/copied; **not** that hardware ran. |
| Chromium hardware-only query succeeds and real output follows | Strong source-backed evidence for hardware selection in the examined implementation. Still says nothing about avoiding CPU readback. |
| `output()` metadata / `decoderConfig` | Bitstream description and decode requirements. **No selected-encoder or actual-hardware field.** |
| `encode()` returns quickly | Only queue submission was fast; worker/software encoding can also make this cheap. |
| Low queue / short output delay | The pipeline keeps up. A fast CPU encoder can look like hardware; a GPU encoder can be slow because of synchronization or startup. |
| High worker CPU or slowdown after an encoder change | Evidence of increased cost, not conclusive hardware identity. Readback/conversion and game workload can confound it. |
| Chrome diagnostic media log: `kVideoEncoderName`, `kIsPlatformVideoEncoder` | Chromium logs implementation name and actual `encoder_info.is_hardware_accelerated`. Useful **external diagnostic evidence**; not an ordinary webpage API. [C1] |
| Hardware engine activity / vendor encoder-session counters | Corroboration when isolated to this process/session. At 12 fps utilization may be too brief for coarse sampling; zero observed utilization is not proof of software. |

For controlled builder runs, inspect Chrome's WebCodecs/media diagnostics (including `chrome://media-internals` if that version presents the entries) or media tracing for the logged name/hardware flag, and correlate OS GPU **Video Encode** activity. The exact diagnostics UI is version-dependent; the logging properties are verified in source. A Windows D3D12/MF name denotes the browser platform path; verify the flag too. Chromium's `chrome://gpu` encode-profile list is a capability check, not proof that this recording used it. [C1][C12]

**Production fallback detection must be described honestly:** JavaScript has no portable exact hardware/software identity getter. Prefer the Chromium hardware-only path, watch errors/throughput, and treat a sustained cost regression as an unhealthy pipeline. Correlate input timestamp → output callback over a rolling window; include all pending frames, not just `encodeQueueSize`. As an initial proposed health threshold, investigate output older than several 83.3 ms capture intervals or a growing bounded queue after warmup. Tune it against pauses, background scheduling and GOP behavior; it is **not** an algorithm for proving CPU fallback. Never use a single latency cutoff to label an encoder hardware. [W1][C1][F3]

`MediaCapabilities.encodingInfo().powerEfficient`, where available for the requested type, is also not an identity query for a particular WebCodecs encoder instance. Neither `VideoFrame.format` nor transferability reveals that instance's downstream storage path. [W1][C16]

### Machine-specific ladders

| Machine | Recommended ladder | Capture / failure policy |
| --- | --- | --- |
| Owner's Windows laptop | Hardware **AV1 → H.264 → HEVC** as initial probe order on RTX40; compare successful candidates before locking selection. On another adapter include exposed Intel hardware VP9 after H.264 as appropriate. H.264 may win on cost/compatibility even when AV1 is available. Try CBR/profile variants and the alternative capture path before declaring hardware unavailable. | Direct canvas `VideoFrame` → transfer → worker first; compare GPU-scaled bitmap → worker frame. 720p/12. Prefer one GPU for render+encode. No automatic CPU/540p route on Windows. If all hardware paths fail, preserve telemetry and record video unavailability; report that result rather than silently violate owner policy. External OS capture is an explicit alternate workflow. |
| factory-worker, Debian + RTX3090 + proprietary 550 | One bounded capability query confirms the expected absent Chrome hardware profile. Do not spend repeated jobs toggling NVIDIA decode flags. A native NVENC capture helper/OS recorder is the potential hardware alternative, but surface acquisition and total cost must be proven. If unavailable or over budget, Linux-only software **960×540**: compare realtime **VP8**, H.264 if built, and VP9; choose measured cost/quality. Avoid software AV1 as a low-cost default. | Retain accelerated bitmap capture/resize → worker frame; readback/encode stay in the worker path where possible. Existing WebM for VP8/VP9; MP4 for AVC. Do not claim success if software remains over budget. Retain loss/unavailability facts if video must stop. |
| WSL2 sandbox, RTX4070 Laptop + Mesa D3D12 | Verify `d3d12_drv_video.so` and **encode** entrypoints, then enable Chromium VA-API encode. Probe hardware **H.264 first**, then AV1 if the installed stack exposes it. Do not chase WebCodecs HEVC on the examined Linux VEA even if native HEVC encode works. If Chrome interop fails, a native VA-API/D3D12 recorder or native **Windows** browser is the alternate route; only then CPU 960×540 as above. | Compare direct frame and scaled-bitmap capture; the previous 2D path's 40–75 ms failure remains disqualifying. A Windows browser against a server in WSL uses Windows video backends and is distinct from running Linux Chrome under WSLg. Preserve exact time and coverage checks. |

The generic shipped app should select by demonstrated capability, not GPU-name or user-agent guesses. The Linux-only CPU exception should be an explicit deployment/recorder policy with provenance: an ordinary website cannot reliably distinguish native Windows from every WSL/automation arrangement just from a GPU renderer string. [W1][R1]

## 8. What is realistically achievable on the two Linux machines

**Factory-worker:** native 3090 NVENC H.264/HEVC is real; AV1 encode is not. With the present proprietary driver and stock Chromium backend, there is no verified in-page hardware encode route. An Intel/AMD encode-capable render device passed through as well could add a VA-API option, but that is a machine change and might introduce cross-device copies, not a flag fix. Default research recommendation: do not block on inventing NVIDIA VA-API encoding; evaluate the native acquisition path once, then use the explicitly allowed 540p worker CPU route if needed. [N1][N2][C2]

**WSL2:** Microsoft documents `LIBVA_DRIVER_NAME=d3d12`, the `d3d12_drv_video.so` Mesa backend, H.264 encode from Mesa 22.2 and HEVC encode from 22.3. Its table includes NVIDIA GeForce GTX10/RTX20 and newer with a minimum Windows driver of 526.47, but explicitly warns that actual profiles/entrypoints are dynamically queried and vary by hardware/driver. Current Mesa source also implements AV1 encode. **This makes hardware H.264 a credible probe on the 4070; it does not prove this sandbox's package, driver, codec build or Chromium imports are compatible.** [M1][M2]

Can the sandbox reach the 4070's NVENC? **Potentially the NVIDIA hardware encode engine through D3D12 → Mesa VA-API**, without Chromium calling the NVENC SDK. A positive native VA-API encode test plus a successful real-frame WebCodecs hardware trial would establish that path. CUDA availability, `nvidia-smi`, ANGLE's D3D12 renderer label and NVDEC support do not establish it. No source examined establishes a direct stock Linux-Chrome NVENC SDK path. Do not install a normal NVIDIA Linux display driver into WSL to try to create one: NVIDIA documents that the Windows host driver supplies WSL's GPU interface and warns against overwriting it. [M1][C2][N6]

A native Windows Chrome/Edge opened on the WSL-served game is the most direct way to use the Windows 4070 encoder stack if WSLg interop fails. It is a different execution environment, and it needs the owner's ordinary Windows-browser check; a sandbox result cannot substitute for that check.

## 9. Expected main-thread cost and limits of the evidence

At 60 Hz, the 1% budget is **0.167 ms per rendered frame ≈ 10 ms of main-thread time per second**. At 12 captures/s, allocating the entire budget to pictures alone would allow about **0.835 ms per captured picture**, before telemetry, storage messages and other recorder work. This conversion is arithmetic, not a measured capture-time bound.

| Path | Expected main-thread behavior | Numeric evidence / what remains unknown |
| --- | --- | --- |
| Direct GPU frame → worker hardware encode | Small snapshot/flush/transfer submissions; conversion/encode can occur off main and stay GPU-resident. Main may still pay synchronization and callbacks. | **No verified ms estimate.** Source demonstrates possible storage/control paths, not their timing. Measure synchronous submission and inclusive A/B. [C6][C1][C7] |
| GPU scaled bitmap → worker hardware encode | Same, plus bitmap creation/resize/continuation; could beat direct input if direct encoder scale falls back to CPU. | **No verified ms estimate.** REC-1 self-time is not a hardware-path result. [C13][R1] |
| `captureStream` → MediaRecorder hardware | Browser-side capture/conversion/encode; fewer explicit JS picture operations, but internal capture can run from canvas notifications on main. | **No verified ms estimate.** Hardware and one-copy paths exist; total cost and timestamp correctness need a new comparison. [C14][C15] |
| Present 720p software VP9 recorder | Encode on worker, with required pixel availability/conversion somewhere in the pipeline; main includes the rest of the recorder. | REC-1: roughly **+0.3–0.4 ms/render frame inclusive**; formal six-pair main estimate +0.42 ms, 95% interval −0.14 to +0.97; renderer CPU +246 ms/s. Not isolated to video. [R1] |
| Linux last-resort 540p software | Less pixel/readback/encode work expected than 720p; CPU encoding and contention remain. | **No verified ms estimate or budget pass.** Pixel count falls to 56.25%; time need not scale proportionally. |
| The measured 2D `drawImage(WebGLCanvas)` staging path on WSL D3D12 | Can block the calling main thread for readback. | REC-1 observed **40–75 ms per picture** on that path. Keep it excluded unless a different path is separately proven. [R1] |
| Native recorder / OS capture | Can remove in-page capture/encode work; desktop acquisition, driver calls, memory traffic and render contention still exist outside page self-time. | **No verified Siltwake ms estimate.** Native vendor marketing and OBS throughput do not prove a sub-1% game impact. [N3][N4][M4] |

No row labelled unmeasured should be replaced by an invented “0.01 ms”, “zero overhead” or “hardware is always faster” estimate. The spec explicitly cautions that hardware startup/transfer overhead can lose at low resolutions. A GPU-resident hardware path is the strongest architectural candidate; inclusive measurements decide acceptance. [W1]

## 10. Concrete probes for the REC-1 builder

These are proposed jobs, **not executed evidence**. Follow the repository's browser rules/resource lane; factory-worker performance measurements require its exclusive lease. WSL/4070 figures remain indicative on the shared owner machine. Keep the fixed pose/build/settings and one frame count used by REC-1's corrected probe. No broad test rerun is implied.

1. **Inventory and support, separately on Windows, factory-worker and WSL.** Record exact Chrome/Edge version and revision, active render/encode adapters, OS, driver, flags and `chrome://gpu` encode profiles. In the recorder worker query the complete five-codec configurations listed above with all three hardware preferences, VBR/CBR, 720p/12 and Linux 540p/12. Save request and normalized response. For broader browser support, run the same API probe in released Firefox/Safari and record the exact version, with their weaker hardware-identity guarantees. Positive hardware candidates get 60 real game frames, output timestamp accounting, a first keyframe and one final flush. Expected factory result: no hardware profiles; a different result must be explained by the actual backend/log.
2. **Resolve WSL's actual video exposure before a browser performance job.** Inventory installed Mesa/VA packages and `d3d12_drv_video.so`; use `LIBVA_DRIVER_NAME=d3d12 vainfo` in its documented device/display context. Require H.264 `VAEntrypointEncSlice`/applicable encode entrypoint, not `VAEntrypointVLD` alone. As a separate admitted short native job, use Microsoft's documented `h264_vaapi` synthetic encode example and save success/error plus driver capability information. Check AV1 encode entrypoints if the Mesa version includes them. If native encode fails, stop changing Chrome flags; if native succeeds but Chrome fails, investigate Chromium/DRM/import/build gates. These commands can initialize GPU/video resources and belong in the builder's lane, not research.
3. **Identify the actual encoder.** During each admitted browser trial collect media logs/traces with `kVideoEncoderName` and `kIsPlatformVideoEncoder`; corroborate Windows Video Encode engine or native session evidence as available. Run an explicit software control. Record `hardware-confirmed`, `hardware-request-succeeded but diagnostics unavailable`, or `unknown`; never upgrade the last two solely from a fast callback. In WSL distinguish `VaapiVideoEncodeAccelerator` over Mesa D3D12 from the Windows-only `D3D12VideoEncodeAccelerator`.
4. **Find CPU readback and scale costs.** On Windows and WSL compare direct canvas frame→worker, resized ImageBitmap→worker frame, and the existing bitmaprenderer stage. Keep game resolution and 720p output constant. Trace shared-image pass-through/GPU conversion, `CopyRGBATextureToVideoFrame`, background readback and `PrepareCpuFrame`/`PrepareGpuFrame`; naming alone is insufficient, inspect whether pixels are CPU-mapped/copied. Record main submission p50/p95/p99, output delay after warmup, renderer/main/worker/GPU-process CPU, and missing pictures. Compare full-size source→encoder scale with pre-scaled GPU bitmap. Exclude the already failed 2D route from normal play.
5. **Inclusive budget decomposition and selection.** Interleave recorder off, telemetry-only, telemetry with sampled/disabled renderer timing, video capture without encode, explicit software encode and successful hardware candidates. A synthetic discarded-frame capture control must release frames normally. Use the corrected total main-task time per rendered frame, game-frame outliers, renderer/GPU-process CPU and matched-window uncertainty. Apply the existing rule: the upper paired 95% interval must be below 0.167 ms/frame to claim that budget. Do not silently subtract telemetry/timer cost. Then evaluate the permitted 540p software fallback if hardware/native paths fail. A CPU decrease without a main-thread pass is still useful but not acceptance. [R1]
6. **Revalidate recording truth with each chosen container/path.** Barcode picture and page-time timestamp; include startup, 1.5 s stall before/after first frame, paused/no-draw stretches, real hidden tab on Windows, segment rotation, Off and export during pending encode. Decode independently, check picture date ±2 ms as in R2, ensure coverage reaches export cutoff and gaps remain explicit. Check the exported timeline `<video>`, pack/strip tools, fMP4 initialization, keyframe boundaries, durable partial-tail handling and mid-configuration changes. MediaRecorder may only replace WebCodecs if it passes this test too. [R1]
7. **Adverse hardware lifetime.** In a short admitted trial cause a bounded encoder error/unavailability or exhaust its test session deliberately, then verify prompt release, a loss record, a fresh segment and the next permitted candidate. Check bounded frame/bitmap/texture/OPFS memory over a longer accepted run. On Windows, a terminal hardware failure must not enter the Linux software exception. Re-run support on the next session/browser/driver rather than persisting a permanent false capability cache.

The unresolved questions are therefore specific: **which Windows adapter/backend wins; whether the installed WSL Mesa/driver exposes H.264 or AV1 encode; whether Chrome imports its surfaces; which capture/scale path avoids a CPU pixel round trip; and whether removing software encode actually brings the whole recorder under budget.** None was measured by this research.

## Primary sources

**Project evidence**

- [R1] REC-1 source handoff at frozen branch revision; especially R3-4 diagnosis, R2-7 clock contract and the 4070 2D readback finding.

**Specifications and browser API documentation**

- [W1] W3C WebCodecs: hardware-acceleration hints, encoder config, scaling, realtime/drop behavior, queues, frame ownership and transfer.
- [W2] MDN `VideoEncoder.isConfigSupported()`: recognized config members, support result and errors.
- [W3] WebM Project container guidelines: WebM is the restricted Matroska subset, not a generic H.264 container.
- [W4] Matroska codec mappings: AVC/HEVC codec IDs and codec-private format.
- [W5] MDN canvas capture and explicit `requestFrame()`.
- [W6] W3C WebM byte-stream format: recognized WebM codec strings, including AV1.
- [W7] W3C AVC WebCodecs registration: codec strings, AVC vs Annex-B and decoder description.
- [W8] W3C HEVC WebCodecs registration.
- [W9] W3C AV1 WebCodecs registration.
- [B1] MDN Browser Compatibility Data, `VideoEncoder` interface.

**Chromium source and release notes** — source pinned to `f45262ae78835ec26ff8be22aa15fa0e38f726d4`.

- [C1] Blink `video_encoder.cc`: `IsAcceleratedConfigurationSupported`, `GetRequiredEncoderType`, software factories, `CreateMediaVideoEncoder`, `StartReadback`, `ProcessEncode`, `OnMediaEncoderInfoChanged` and hardware-only support query.
- [C2] GPU VEA factory: platform backends, Linux feature gate, Windows backend priority and secondary-adapter TODO.
- [C3] Windows D3D12 VEA: supported codecs and shared-image input.
- [C4] Media Foundation shared state: `GetSupportedProfilesInternal`, `EnumerateHardwareEncoders`, supported formats.
- [C5] Media feature switches: Linux feature string/default; Windows D3D12/shared-image defaults; HEVC and OpenH264 gates.
- [C6] Blink `video_frame.cc`: canvas/ImageBitmap texture-backed shared-image constructor and raster fallback.
- [C7] VEA adapter: GPU/CPU buffer selection, resizing and `PrepareGpuFrame` passthrough/conversion.
- [C8] Blink graphics frame pool: RGB texture→native/mappable video frame and fallback mechanisms.
- [C9] VA-API VEA: explicitly accepted codecs in `Initialize`, encoder delegate selection.
- [C10] `media_util.cc`: OpenH264 build/runtime availability.
- [C11] Chrome 136 release notes: HEVC encoding chronology and MediaRecorder MP4/Matroska support.
- [C12] Chromium VA-API documentation: Linux support caveat, flags, driver capability debugging.
- [C13] `static_bitmap_image_transform.cc`: accelerated blit, software fallback and unpremultiplied readPixels path.
- [C14] `HTMLCanvasElement::NotifyListenersCanvasChanged`: one-copy frame capture and conversion fallback.
- [C15] MediaRecorder video track recorder: container/codec combinations and hardware/software factories.
- [C16] MediaCapabilities implementation: separate recording/WebRTC capability queries, not selected WebCodecs instance identity.
- [C17] Chrome's WebCodecs best-practices guide: worker use, flow control, frame ownership, encoding and muxing.
- [C18] VA-API wrapper: encode profile whitelist, baseline CBR and H.264-only VBR advertisement.

**Other engines** — examined upstream; release/configuration qualifications above apply.

- [F1] Firefox Windows encoder: WMF platform route and hardware preference handling.
- [F2] Firefox preferences: WebCodecs H.265 Nightly gate; FFVPX hardware gate on Windows; software/system FFmpeg defaults.
- [F3] Firefox FFmpeg video encoder: explicit software-fallback TODO.
- [F4] Firefox Linux platform: hardware encode requires EGL and DMA-BUF.
- [F5] Firefox Apple encoder module: H.264-only platform support.
- [F6] Firefox FFmpeg encoder module: system/bundled encoder capability discovery and hardware gates.
- [F7] Firefox MFT encoder: codec enumeration.
- [S1] WebKit WebCodecs encoder: config conversion omits hardware preference, support query creates encoder.
- [S2] WebKit local encoder factory: VP8/VP9/AV1 software paths.
- [S3] WebKit VideoToolbox encoder: enable hardware property and realtime/frame-reordering settings.
- [S4] WebKit remote codec selector: H.264/HEVC encoder routing.

**Vendors, native capture and libraries**

- [N1] NVIDIA video encode/decode support matrix: 4070 Laptop Ada versus RTX3090 Ampere encoding capability.
- [N2] `nvidia-vaapi-driver` author's README: NVDEC backend; hardware decoding only, no encode.
- [N3] NVIDIA NVENC SDK programming guide: Linux/Windows inputs, presets, latency, lookahead/CUDA and hardware architecture.
- [N4] NVIDIA OBS guide: encoder generations, cross-GPU copy trade-off and GPU-assisted quality features.
- [N5] NVIDIA Highlights developer documentation.
- [N7] NVIDIA ShadowPlay product page: native hardware-accelerated recording.
- [N6] NVIDIA CUDA on WSL guide: Windows host driver model and installation limits; CUDA availability is not video-encode evidence.
- [I1] Intel media-driver capability table: per-generation decode/encode/shader encode and firmware requirements.
- [A1] AMD AMF hardware features table: VCN generations, AV1 encode and decode-only exceptions.
- [M1] Microsoft, “D3D12 GPU video acceleration in the Windows Subsystem for Linux now available!”: VA-API/Mesa setup, encode examples and conditional platform support.
- [M2] Mesa D3D12 video capability implementation, including AV1 encode support.
- [M3] Microsoft D3D12 Video Encode announcement: GPU textures, driver capability queries and NVIDIA/Intel/AMD platform support.
- [M4] Microsoft native screen capture to video: Direct3D surfaces, timestamps and hardware transcoder.
- [M5] Xbox official recording support link; article body unavailable through the retrieved JavaScript shell, so not used to establish internal implementation/performance.
- [O1] OBS advanced recording settings guide: published native encoder baselines.
- [L1] `mp4-muxer` deprecation notice; [MIT license](https://github.com/Vanilagy/mp4-muxer/blob/main/LICENSE), [manifest](https://github.com/Vanilagy/mp4-muxer/blob/main/package.json) and [frozen API docs](https://github.com/Vanilagy/mp4-muxer/blob/2c611c5932d3b8054c8968320cf9b6b7db094d30/README.md).
- [L2] `webm-muxer` deprecation notice; [MIT license](https://github.com/Vanilagy/webm-muxer/blob/main/LICENSE), [manifest](https://github.com/Vanilagy/webm-muxer/blob/main/package.json) and [frozen Matroska docs](https://github.com/Vanilagy/webm-muxer/blob/a77076a0f5c8245bbc5d387eb5aaaf065cd84f90/README.md).
- [L3] Mediabunny README, [MPL-2.0 license](https://github.com/Vanilagy/mediabunny/blob/main/LICENSE), [manifest](https://github.com/Vanilagy/mediabunny/blob/main/package.json) and [current writing-media guide](https://mediabunny.dev/guide/writing-media-files); maintained successor.

[R1]: https://github.com/lakeczar/subnautica-clone/blob/bcd3d006c6ce44a5b02d9df8ee2d24a6a67b55a6/docs/build/streams/REC-1.md
[W1]: https://www.w3.org/TR/webcodecs/
[W2]: https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/isConfigSupported_static
[W3]: https://www.webmproject.org/docs/container/
[W4]: https://www.matroska.org/technical/codec_specs.html
[W5]: https://developer.mozilla.org/en-US/docs/Web/API/CanvasCaptureMediaStreamTrack/requestFrame
[W6]: https://www.w3.org/TR/mse-byte-stream-format-webm/
[W7]: https://www.w3.org/TR/webcodecs-avc-codec-registration/
[W8]: https://www.w3.org/TR/webcodecs-hevc-codec-registration/
[W9]: https://www.w3.org/TR/webcodecs-av1-codec-registration/
[B1]: https://github.com/mdn/browser-compat-data/blob/main/api/VideoEncoder.json
[C1]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/third_party/blink/renderer/modules/webcodecs/video_encoder.cc
[C2]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/media/gpu/gpu_video_encode_accelerator_factory.cc
[C3]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/media/gpu/windows/d3d12_video_encode_accelerator.cc
[C4]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/media/gpu/windows/mf_video_encoder_shared_state.cc
[C5]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/media/base/media_switches.cc
[C6]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/third_party/blink/renderer/modules/webcodecs/video_frame.cc
[C7]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/media/video/video_encode_accelerator_adapter.cc
[C8]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/third_party/blink/renderer/platform/graphics/web_graphics_context_3d_video_frame_pool.cc
[C9]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/media/gpu/vaapi/vaapi_video_encode_accelerator.cc
[C10]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/media/base/media_util.cc
[C11]: https://developer.chrome.com/release-notes/136
[C12]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/docs/gpu/vaapi.md
[C13]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/third_party/blink/renderer/platform/graphics/static_bitmap_image_transform.cc
[C14]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/third_party/blink/renderer/core/html/canvas/html_canvas_element.cc
[C15]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/third_party/blink/renderer/modules/mediarecorder/video_track_recorder.cc
[C16]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/third_party/blink/renderer/modules/media_capabilities/media_capabilities.cc
[C17]: https://developer.chrome.com/docs/web-platform/best-practices/webcodecs
[F1]: https://github.com/mozilla-firefox/firefox/blob/main/dom/media/platforms/wmf/WMFMediaDataEncoder.cpp
[F2]: https://github.com/mozilla-firefox/firefox/blob/main/modules/libpref/init/StaticPrefList.yaml
[F3]: https://github.com/mozilla-firefox/firefox/blob/main/dom/media/platforms/ffmpeg/FFmpegVideoEncoder.cpp
[F4]: https://github.com/mozilla-firefox/firefox/blob/main/gfx/thebes/gfxPlatformGtk.cpp
[F5]: https://github.com/mozilla-firefox/firefox/blob/main/dom/media/platforms/apple/AppleEncoderModule.cpp
[S1]: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/webcodecs/WebCodecsVideoEncoder.cpp
[S2]: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/VideoEncoder.cpp
[S3]: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/video-codecs/cocoa/GPUVideoEncoderVTB.mm
[N1]: https://developer.nvidia.com/video-encode-decode-support-matrix
[N2]: https://github.com/elFarto/nvidia-vaapi-driver/blob/master/README.md
[N3]: https://docs.nvidia.com/video-technologies/video-codec-sdk/13.0/nvenc-video-encoder-api-prog-guide/index.html
[N4]: https://www.nvidia.com/en-us/geforce/guides/broadcasting-guide/
[N5]: https://developer.nvidia.com/highlights
[N6]: https://docs.nvidia.com/cuda/wsl-user-guide/index.html
[I1]: https://github.com/intel/media-driver/blob/master/README.md
[A1]: https://github.com/GPUOpen-LibrariesAndSDKs/AMF/wiki/GPU-and-APU-HW-Features-and-Support
[M1]: https://devblogs.microsoft.com/commandline/d3d12-gpu-video-acceleration-in-the-windows-subsystem-for-linux-now-available/
[M2]: https://gitlab.freedesktop.org/mesa/mesa/-/blob/main/src/gallium/drivers/d3d12/d3d12_video_screen.cpp
[M3]: https://devblogs.microsoft.com/directx/announcing-new-directx-12-feature-video-encoding/
[M4]: https://learn.microsoft.com/en-us/windows/uwp/audio-video-camera/screen-capture-video
[M5]: https://support.xbox.com/en-US/help/friends-social-activity/share-socialize/record-game-clips-game-bar-windows-10
[O1]: https://obsproject.com/kb/advanced-recording-settings-guide
[L1]: https://github.com/Vanilagy/mp4-muxer
[L2]: https://github.com/Vanilagy/webm-muxer
[L3]: https://github.com/Vanilagy/mediabunny

[C18]: https://github.com/chromium/chromium/blob/f45262ae78835ec26ff8be22aa15fa0e38f726d4/media/gpu/vaapi/vaapi_wrapper.cc
[F6]: https://github.com/mozilla-firefox/firefox/blob/main/dom/media/platforms/ffmpeg/FFmpegEncoderModule.cpp
[F7]: https://github.com/mozilla-firefox/firefox/blob/main/dom/media/platforms/wmf/MFTEncoder.cpp
[S4]: https://github.com/WebKit/WebKit/blob/main/Source/WebKit/WebProcess/GPU/webrtc/LibWebRTCCodecs.cpp
[N7]: https://www.nvidia.com/en-us/geforce/geforce-experience/shadowplay/
