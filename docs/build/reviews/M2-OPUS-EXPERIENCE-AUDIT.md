# M2 stage-exit experience audit (Opus 5.5 high, fresh non-author)

**Candidate:** `feat/siltwake-first-expedition` at `ffc9847` (C3 integrated at `a21e764`). Spoiler-safe. Audited 2026-10-21.

## Verdict
**The bones are good, and the opening is genuinely pleasant. But the deep half of the game currently reads as a long commute through well-lit plains, and the carrier, the fleet's centrepiece, still drives like a developer test.**

- **The first 15 minutes** (pod, reef, workshop, Dart) are clear, quick and charming.
- **From the Basin onward:**
  - Light and depth, the owner's top atmosphere priority, is missing: 300–590 m looks almost as bright as the shallows.
  - Most play time is travelling the same 500–850 m legs over and over, because every refit happens back at the island.
  - Only two of the six craft matter after the first hour.

Both routes do reach the ending, and nothing I hit broke progress.

## How this was played
All play used a task-owned headless Chrome on the RTX 3090 (ANGLE GL-EGL), driven only by ordinary keys. Each session ran through `heavy-check.sh` and was closed afterwards. After the coordinator's note, I split the play into sessions of 25 minutes or less.

- **Fresh play:** New Game → pod opening → reef gathering → pod repair → tools → 150 m suit → Bobbin collar → Splitspine workshop → Dart built. That took about 13 minutes of my active play.
- **Imported milestone saves** (from `npm run playthrough`):
  - the first Dart flight to the Canopy, a disabled Dart and its recovery;
  - Creel: Reef → Canopy → Basin, an arm lift on the tagged frames, the mid-game notebook and craft panels;
  - Hearthline: helm, station keeping, the interior walk, and a refused Mantle launch.
- **Derived saves:** the game's own step, run headless from bot milestones to skip commutes the bot had already timed. From these:
  - Creel, Basin → Rift;
  - Creel, Divide → Meridian, and the late creature at the gallery;
  - lamp on and off at 395 m.
- **Inspected only:**
  - the late restoration chain and the ending (bot timeline only);
  - Hush, Spindle and Mantle piloting;
  - a long carrier voyage;
  - route mixing.

My driver steers by coordinates. It isn't blind navigation, so all first-timer figures below are estimates. Sound wasn't audible; I judged only captions and cues.

**Performance:** a steady 60 fps (p95 16.7 ms) on every route segment in every region. The one dip, to 47 fps, came while scraping terrain.

## Top 10 issues, ranked by player impact

### 1. The deep game isn't dark, so depth has no feel
- **Where:** Rift (300 m), Divide (390 m), Meridian (520–590 m) and the Creel cockpit everywhere.
- **What I did:** flew the Creel down each region, looked around, and toggled the lamp at 395 m.
- **What happened:**
  - Floors at 300–590 m are lit pale grey or sand, much like the reef ([Rift](m2-audit/06-rift-300m.webp), [Divide](m2-audit/07-divide-390m.webp), [Meridian](m2-audit/08-meridian-590m-roof-band.webp)).
  - With the lamp off at 395 m, the scene's mean brightness dropped only from 123 to 99 out of 255, and everything stayed readable ([lamp off](m2-audit/09-divide-395m-lamp-off.webp)). The lamp toggle text says "you see less", but darkness never matters.
  - The Creel's roof and dash render fully sunlit at any depth. That puts a white band across the top third of every deep screenshot.
  - Pitching down to work the tool arm (the Creel's core job) turns the whole view white, so you can't see the frame you're lifting ([arm work](m2-audit/05-creel-arm-work-whiteout.webp)).
- **Suggestion:**
  - Drive ambient light, fog and colour down hard with depth: near-black beyond about 250 m outside the lamp cone and the region's own light sources (vents, crystals, district lamps).
  - Light cockpit art from the same depth-attenuated light plus a small interior light.
  - Make the lamp cone the main way you see below 200 m.

  This one change would do more for atmosphere than anything else on this list.

### 2. The carrier, the "mobile home", is run through a developer panel
- **Where:** Hearthline at the stack yard (carrier route save).
- **What I did:** took the helm, sailed, turned, pressed V, engaged station keeping, left the helm, walked the interior, then tried to launch the Mantle.
- **What happened:**
  - **The V panel** is titled "Developer test · carrier fixture" and headed "SEEDED FEASIBILITY · no earned campaign progression". It shows raw identities (`dart_24`, "damage 0.0") and debug buttons ("Toggle fixture obstruction", "Fixture incapacity / refuge fallback") ([panel](m2-audit/10-carrier-dev-fixture-panel.webp)).
  - **V is missing from the controls list** unless `?dev` is set.
  - **The helm view** looks into an enclosed bay at a flat panel, so you steer the carrier blind ([helm](m2-audit/11-carrier-helm-view.webp)). Meanwhile, a proper windowed bridge exists inside ([bridge](m2-audit/12-carrier-bridge-walkable.webp)).
  - **Turning to look** at the helm swings the whole carrier. After I turned toward the shore, "Launch through lock" refused with "Transfer corridor obstructed". It doesn't say where the corridor is or which way to move. In open water at 29 m it was still refused, because the stern pointed at the slope.
  - **"Leave helm"** repeated the previous message ("Station keeping engaged").
- **Suggestion:**
  - Diegetic stations: a helm seat on the bridge with the window view; berth and lock consoles at the berths.
  - Player-facing copy and the V key in the controls list, or remove V altogether.
  - Draw the launch corridor as a ghost line astern with a "clear water needed: turn N°" hint.
  - Decouple helm look from carrier yaw, or turn the carrier more slowly than the camera.

  The interior is already a good space; it just needs to be the way you use the carrier.

### 3. Logistics turn the late game into a commute
- **Where:** Basin ↔ Divide (734 m), Divide → service ledge (572 m), Divide → Meridian (583 m), and every refit.
- **What I did:** flew Basin → Rift (553 m in 117 s) and Divide → Meridian (583 m in 128 s) in the Creel, then read the bot's timeline.
- **What happened:**
  - **Refits all happen at one bench.** Every suit and hull refit is at the island workshop. On the Creel route, the bot crosses Basin ↔ Divide 9 times (27 min); on the carrier route it's 9 times (44 min), plus 15 crossings of workshop ↔ stack (21 min).
  - **Long empty legs.** The deep legs take 128–290 s each and pass few points of interest. The Dart, the fastest craft, is capped at 350 m, so the best craft on these legs moves at 5 m/s (Creel), 4 m/s (Mantle) or 3 m/s (carrier). That breaks the 90-second empty-travel rule on every deep leg.
  - **Gathering trips run long.** On the carrier route, one gathering trip for shallow glass, membrane and resin took the bot 17.8 minutes of play. The rule is about 5.
  - **Power runs low.** My Creel reached the Meridian gallery at 17% power, and arrived at Meridian itself at 31% from 48% at the Divide.
- **Suggestion:**
  - Let restored stops (Rift station, Divide dock) do the refits for their own tier.
  - Wire field outposts first: this is where their absence hurts most.
  - Give the frontier a reliable supply of the common materials, as GAME-DIRECTION says.
  - Put one point of interest (a cave mouth, a wreck, a cue creature) roughly every 400 m on the Basin–Divide and Divide–Meridian legs.
  - Let the Dart refit to about 450 m so a fast scout exists for the Rift and Divide.

### 4. The first hunter is invisible and too fast
- **Where:** the Upper Canopy, about 10 minutes after the Dart is built.
- **What I did:** flew the authored Reef → Canopy route (148 m in 30 s), first in the Dart, then in the Creel.
- **What happened:**
  - **It's unseen and fast.** A sound hunter took the Dart from 66% to 0% hull in about 15 s, and the Creel from 100% to 0% in about 20 s. I never saw the creature: I looked all around, down and up during the attack ([attack](m2-audit/04-canopy-bitten-by-unseen-hunter.webp)).
  - **The pulse wasn't available.** G (pulse) asked for a reserve cell. The natural flow, which the bot also follows, leaves the cells in the pod locker.
  - **The cues are text only:** "paired calls", "investigating", then "pursuit" over about 7 s, and the call-bearing arrow.
  - **The good part:** holding Z (quiet) along the same route avoided it completely.
- **Suggestion:**
  - Show the creature: a silhouette pass across the lamp or murk on the first "investigating".
  - Ramp the bite damage, or make the first bite knock you back.
  - Make the first encounter a warning, not a kill.
  - Suggest carrying one reserve cell before the Canopy.

  The counterplay is right; the readability isn't.

### 5. There's no persistent "what now"
- **Where:** after the opening, and again after each milestone.
- **What I did:** played fresh and pressed H when stuck, including with a disabled Dart.
- **What happened:**
  - **The opening goal vanishes.** The one clear goal ("Repair the regulator with alloy, glass and shed membrane. Choose the reef ribs or Splitspine shore.") shows briefly, then disappears.
  - **Hints are riddles.** H gave lore-flavoured lines ("Something on this reef once drew water for people"), and with the Dart disabled it gave a story line instead of how to recover.
  - **The workshop is hard to spot.** Nothing points to it after the reef.
  - **What helps:** the craft panel's "Known habitats" list is excellent once you've seen a source.
- **Suggestion:**
  - A one-line current objective at the top of the notebook, optionally on the HUD.
  - H gives the practical step first and the flavour second, and always the recovery steps while a craft is disabled.

  This keeps the game unguided without leaving players lost.

### 6. Collisions grind the hull, and the camera clips
- **Where:** under the Splitspine shelf, the Canopy crowns, the Dart cradle.
- **What I did:** flew the Dart at ordinary speed and boarded the Dart from its cradle.
- **What happened:**
  - **Scraping is brutal.** Holding forward against rock took 35% of the hull in 5 s and 100% in about 10 s, with a stream of "Hull −1.5% … −35%" notices.
  - **The Creel snags.** It caught on Canopy geometry twice where the authored route runs.
  - **The camera clips.** Approaching the Dart put the camera inside the yellow cradle: a full-screen yellow view ([clip](m2-audit/03-camera-inside-dart-cradle.webp)).
- **Suggestion:**
  - Scale damage by impact speed, add a short grace period and push the hull out.
  - Treat a sustained scrape as one event.
  - Add camera collision against nearby structures.

### 7. Only two of the six craft earn their place
- **Where:** the fleet as a whole.
- **What I found:**
  - **The Dart** is the star of the first hour, then retired at 350 m.
  - **The Creel** carries the whole mid and late game.
  - **The Mantle** is needed on the carrier route.
  - **The Hush** has a real niche (a quiet hull against sound and light hunters), but nothing points the player at it.
  - **The Spindle** has none: surface speed 7 m/s is slower than the Dart's 8, and no content needs a surface tender.
  - **Neither route builds the Hush or the Spindle.**
- **Suggestion:** this is exactly what the signature upgrades are for, and it's the second place their absence hurts most:
  - Hush listening array and specimen bay;
  - Spindle solar, shore ramp and radio mast, with island-chain shore sites that need it;
  - Dart wide-sweep sonar for cave mouths.

  Give each craft one task only it can do.

### 8. Long gaps with nothing new near the end
- **Where:** the late restoration chain on both routes.
- **What I found:**
  - **Creel route gaps:** 26, 19 and 17 min, then **55 min** before the final discovery.
  - **Carrier route gaps:** 26 and **62 min**, then **100 min** before the final discovery.

  These are bot minutes; a first-timer takes longer. The gaps are mostly hauling and repeated legs (see #3).
- **Suggestion:**
  - Interleave decodes and lost sites (the decoder, not yet wired) into the chain.
  - Show visible stage progress at the work site.
  - Let the carrier route stage materials aboard instead of ferrying them by Creel.

### 9. Menus and text are dense and partly stale
- **Where:** the notebook, the craft panel, the cargo panel and the HUD header.
- **What happened:**
  - **The mid-game notebook** is a single scroll of about 6,000 characters. Its question → evidence structure (ruled out / supported / established) is strong, but it's hard to browse.
  - **Stale preparation advice.** At the Meridian stage, its "Preparation" section still gives the Basin advice.
  - **The craft panel** repeats paragraphs inline ("Not usable at this bench…", "Local sources…") under each recipe.
  - **The recovery options** are one long paragraph in the cargo panel. They read much better in the dedicated recovery panel.
  - **The HUD** still says "SILTWAKE / FIRST EXPEDITION" at 590 m.
  - **The title screen** styles the disabled Continue as the primary button.
- **Suggestion:**
  - The planned journal tabs.
  - Collapse per-recipe detail behind one "why not" line.
  - Retire the "first expedition" header.
  - Update the preparation text from the current frontier.

### 10. Regions are distinct in colour but thin in landmarks
- **Where:** all seven regions.
- **What I found:**
  - **The palettes do separate the regions:** reef turquoise, Canopy deep teal, Basin silt-green fog, Rift bone and grey, Divide slate with blue crystals, Meridian district lamps.
  - **But most deep areas are open plains** with scattered props.
  - **"Ember" Rift reads cold.** I saw no warm glow at the head, though the cliff wall is a fine landmark.
  - **The Basin is a uniform fog.**
  - **There are no caves yet** (expected), and that's what the deep regions miss most: nowhere to duck into, no hidden space.
- **Suggestion:**
  - One silhouette landmark per region readable from more than 100 m.
  - Warm vent light at the Rift.
  - Prioritise caves in the Basin and Divide.
  - Give each mid-route point of interest from #3 a small authored dressing set.

### Other rough edges I hit
- **Re-importing the same save file twice does nothing.** The file input fires no change event. There's no message, so a player retrying an import is stuck.
- **Terrain tiles return 404** each session (expected per C3, but noisy in the console).

## Pacing notes (the owner's rules)
| Rule | What I found |
| --- | --- |
| Something new every 15–20 min | **Holds early:** about 3–5 bot minutes per new thing through the Basin. **Fails late:** gaps of 26–100 bot minutes. |
| Empty travel ≤ 90 s at the best craft | **Holds** for Reef → Canopy (30 s), Canopy → Basin (170 m: about 25 s by Dart at cruise, computed; about 110 s measured by Creel running quiet) and Isles legs by Dart. **Fails** on every deep leg: 117–290 s by Creel or carrier. |
| No gathering trip > 5 min | **Holds** on the reef and isles (1–2.5 min). **Fails** late: 3–18 min hauling shallow materials to deep work. |
| No idle-only waiting | **Holds.** The arm lift is a 6 s hold with a countdown, and there are no charging bars. |

**Where it slogs:** Basin ↔ Divide ↔ Meridian back and forth for refits, staging and charging, and the late restoration chain.

**Where it's thin:** deep regions between sites, the Hush and Spindle, the lamp, and anything to do between leaving the Rift and reaching Meridian.

**Estimated skilled blind first-timer:**
- **Creel route:** about **4–6 hours**. The bot takes 171 min. My scripted opening ran 3.6× the bot's time, so a blind player's search time sits on top of that, plus later navigation, recovery and reading.
- **Carrier route:** about **6–8 hours**. The bot takes 283 min.
- **About 40–50% of either is repeated travel.** Unpadded, the content today is closer to 3–4 hours.

The 10-hour floor needs the systems that are built but not yet wired, and the caves, more than it needs more distance.

**Where the unwired systems would help most, in order:**
1. **Field outposts and refits at restored stops** — fixes #3 and #8.
2. **Signature upgrades** — fixes #7.
3. **Caves and mid-route points of interest** — fixes #10, and #3's empty legs.
4. **Decoder and lost sites** — fixes #8's gaps.
5. **The journal** — fixes #9.
6. **Currents and cycles** — route texture, after travel is shortened.

## Freedom
- **Soft gates:** depth ratings, hunters and power behave as soft gates. I didn't test exceeding a rating.
- **Risk versus reward:** quiet running against the Canopy hunter, and the lamp against light hunters, are real choices. The lamp choice costs almost nothing visually, though (#1).
- **Recovery:** loss is recoverable. A disabled Dart offered a field patch (to 65%), a tow home or salvage, and the workshop serviced it to full. The whole recovery took about 5 minutes.
- **Routes:** both reach the ending in the bot. The carrier route branches after the Creel refits. I couldn't judge mixing in play.

## What's already great, and should be kept
- **The pod opening:** four short, captioned checks, then a ramp straight into a bright reef with fish and the island ahead ([opening](m2-audit/01-opening-ramp.webp)).
- **A first goal in 2 minutes:** pod repair with gathering no more than 50 m away.
- **The Isles vista:** the pod sits on the horizon from the workshop ([vista](m2-audit/02-isles-vista-pod-on-horizon.webp)). More of this.
- **The craft panel's "Known habitats" list** and "Need N X" lines.
- **Physical records you inspect in place.**
- **The notebook's evidence-status structure.**
- **Recovery design:**
  - three clear options with costs;
  - nothing lost but time;
  - emergency air, and "Patch hull first" in the hull card.
- **Quiet movement as real counterplay;** the late gallery creatures that visibly close up as you approach, with a matching caption.
- **The Hearthline interior:** corridor, lockers, the Mantle visible in its berth, and a windowed bridge.
- **The Creel arm lift:** short, legible and cheap at 1.5% power.
- **Rock-steady 60 fps** across all seven regions on the 3090.
