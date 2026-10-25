# REC-1 owner-PC check (one session, about 15 minutes)

What it settles, on the owner's Windows laptop (RTX 4070 Laptop):
- **Which video encoder the recorder picks:** hardware AV1, H.264 or HEVC; never the CPU on Windows.
- **Whether Chrome confirms that encoder is hardware.**
- **What recording costs the game's frame on the hardware path.**

Our Linux machines can't answer any of this, because their Chrome exposes no hardware encoder (R3b).

Use your ordinary Chrome (or Edge), with no extra flags. Nothing is installed or changed.

**Before you start** (the coordinator does this): the build is served from the Linux sandbox on your own laptop, for 60 minutes, with
`heavy-check submit --machine 4070 --deadline 4200 --stall 600 -- bash scripts/rec/owner-check-serve.sh 60`.
That job also keeps other test jobs off your laptop while you measure. You'll get a message when it says "serving". Then close other heavy programs and keep the laptop on mains power.

1. **Open the game** in Windows Chrome at this address:

   ```
   http://localhost:4173/?rec=playtest&recmeasure=1&reccheck=300
   ```

   This address is new to your browser, so your usual saves aren't there. Begin a new expedition, or use "Import save" with a save you exported. Then swim somewhere quiet in open water and stop.
   If the page doesn't open, tell the coordinator: the sandbox's localhost may not be forwarded to Windows.
2. **Hold still.** About 20 s after you're in the world, a message says "Recorder check running for 5 min". Don't touch the controls for those 5 minutes. The recorder pauses and resumes itself every 10 s; the game looks the same either way.
3. **Before the 5 minutes end,** open a second tab at `chrome://media-internals`. Find the entry whose properties include `kVideoEncoderName`. Copy its `kVideoEncoderName` and `kIsPlatformVideoEncoder` lines (a screenshot is fine).
4. **When it finishes,** the message says the file was downloaded: `siltwake-recorder-check.json`.
5. **Optional, one minute:** play normally, then open Settings, choose "Export flight recording", and keep the ZIP. Its `summary.json` names the encoder used.
6. **Also copy** the "Video Acceleration Information" section of `chrome://gpu`, the encode lines.

**Send:** the JSON file, the media-internals lines, the `chrome://gpu` encode lines, and the ZIP if you made one.

## What we read from it

- **`grid`:** the encoders your browser offers, each with `prefer-hardware`, `no-preference` and `prefer-software`, at VBR and CBR.
- **`encoder`:** what the recording used (codec, hardware or software, size).
- **The media-internals lines** confirm it: `kIsPlatformVideoEncoder: true` means the GPU's encoder ran.
- **`check`:** per-frame game work with the recorder on and off, in 10 s windows, paired. The budget is 0.167 ms per frame (1% of a 60 Hz frame): met if the paired interval's upper end (`ci95[1]`) is below it.
  - This is in-page frame work: the frame callback, which includes the recorder's frame work and any slowdown it causes the game. The recorder's later tasks (about 0.03 ms per frame) and collections between frames are outside it.
  - The factory-worker A/B measures every main-thread task. If the in-page figure is close to the budget, we'll ask for a short follow-up with DevTools' Performance panel.
