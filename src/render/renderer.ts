import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation.js";
import type { GameState } from "../sim/types.js";
import type { InteractionHost } from "../sim/targeting.js";
import { createTargetCue } from "./targetCue.js";
import { inCanopyAir } from "../sim/inventory.js";
import { createCelMaterial, createGlassMaterial, updateOpticalUniforms } from "./materials.js";
import { createEnvironment } from "./environment.js";
import { createLandmarks, createNavigationSilhouettes, LabelMaterials } from "./landmarks.js";
import { createEcology } from "./ecology.js";
import { createCreatureLayer } from "./creatures/layer.js";
import { createPlacedHosts } from "./placedHosts.js";
import { ecologyView } from "../sim/ecology/ecology.js";
import { lampOn, presentationStimulus } from "../sim/ecologyLink.js";
import { createExpeditionActors, createExpeditionRegion, DART_SEAT } from "./expedition.js";
import { gameWorld } from "../sim/world.js";
import { playerView } from "./camera.js";
import { createSceneLights } from "./lighting/sceneLights.js";
import { createAtmosphere } from "./atmosphere.js";
import { createRegionResidency, REGION_OWNER_BYTES, RESIDENT_REGION_LIMIT, type RegionArt, type RenderRegion } from "./regions.js";
import { composeWorldArt, type ComposedWorld } from "./worldArt.js";
import { createKitLoader, TemplateLibrary } from "./kit/loader.js";
import { defaultContext } from "./kit/factories.js";
import { createResidency, DEFAULT_BUDGET, type Residency, type ResidencyBudget, type ResidencyStats } from "../world/residency.js";
import { CaveArbiter } from "../world/caves/large/streaming.js";
import type { Vec3 } from "../sim/types.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Geometry } from "@babylonjs/core/Meshes/geometry.js";
import { GeometryCache } from "./geometryCache.js";
import { createCaveView, liveCaveFields, type CaveFieldSource } from "./caves/caveView.js";
import { gameCaveStore } from "./caves/caveStore.js";
import { createKitStreamer, type KitStreamFrame } from "../world/caves/kitStream.js";
import { terrainStore } from "./biomes/terrain.js";
import { CAVE_SOURCES } from "../content/regions/caves.js";
import { createCurrentStreaks } from "./currentStreaks.js";
import { createHubArt } from "./hub.js";
import { createFarLayer } from "./farLayer.js";

export type Quality = "rich" | "light";
export interface GameRenderer {
  present(state: GameState | null, overlay?: { target: InteractionHost | null; preview?: InteractionHost | null }): void;
  /** Idle-time construction of one nearby region into retention. Callers use
   * it only while play is not advancing; it never draws or changes state. */
  prepare(): boolean;
  setQuality(quality: Quality): void;
  resize(): void;
  dispose(): void;
}

/** Byte budget of all world art: chunk residency plus the legacy region
 * owners, which are declared to it as external bytes each frame. */
export const WORLD_BUDGET: Partial<ResidencyBudget> = {
  cpuBytes: 256 * 1024 * 1024, gpuBytes: 256 * 1024 * 1024, buildMsPerFrame: 4,
};
/** Chunks this close to the viewer are drawn before a frame after a load or
 * a jump: the first playable frame always has ground under the player. */
export const NEAR_WORLD = 32;
const JUMP = 64;
/** Cap on synchronous catch-up per frame; extra build time per frame while
 * nothing is interactive (title, load, the opening), and in play while the
 * visible range is still incomplete. */
const CATCH_UP_MS = 2500, MENU_BUILD_MS = 12, PLAY_BUILD_MS = 4;
/** Underwater fog hides chunks beyond about this distance. */
const VISIBLE_WORLD = 200;

/** Internal scene lifetime, also exercised with the real NullEngine factories.
 * Shared cel/glass stay scene-owned; every regional/actor handle owns its meshes.
 * Legacy region owners follow `update(state)`; chunked world art (today's
 * terrain, and any composed region pack) follows `stream(viewer)`. */
export function createRegionalArt(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial, options: {
  world?: ComposedWorld; budget?: Partial<ResidencyBudget>; now?: () => number;
  /** Bytes other owners hold this frame (CW-1: cave collision, light fields
   * and their textures), reserved before the chunks' share is set. */
  held?: () => { readonly cpu: number; readonly gpu: number };
} = {}): RegionArt & {
  /** One arbiter for the whole world budget (LC-05): the legacy region
   * owners and cave data hold reservations; the chunk residency is the
   * opportunistic "world" owner and draws only its exclusive share, so a
   * cave biome's reservations (placed later) shrink it, never overlap it. */
  readonly arbiter: CaveArbiter;
  readonly active: readonly RenderRegion[];
  readonly retained: readonly RenderRegion[];
  prepare(): RenderRegion | null;
  /** Advance chunk residency for `viewer`. `nearRadius`: first build (within
   * a bounded time) until every wanted chunk that close is drawn. `extraMs`:
   * spend up to this much more on construction this frame. */
  stream(viewer: Readonly<Vec3>, options?: { nearRadius?: number; extraMs?: number }): ResidencyStats | null;
  readonly residency: Residency;
  /** Bytes held by the legacy region owners (live and retained). */
  readonly regionBytes: number;
  readonly cacheStats: GeometryCache["stats"];
  readonly labelStats: LabelMaterials["stats"];
} {
  const now = options.now ?? (() => performance.now());
  const cache = new GeometryCache(), labels = new LabelMaterials(scene);
  const disposal = scene.onDisposeObservable.add(() => { cache.dispose(); labels.dispose(); });
  const initial = new Set(scene.meshes);
  const world = options.world ?? composeWorldArt();
  const loader = createKitLoader({
    scene, material: cel, templates: new TemplateLibrary(world.templates), factories: world.factories,
    context: defaultContext(world.floor, 0.75, now, world.biomeAt),
  });
  const budget = { ...DEFAULT_BUDGET, ...WORLD_BUDGET, ...options.budget };
  const residency = createResidency({ map: world.map, loader, budget, now });
  const arbiter = new CaveArbiter({ cpu: budget.cpuBytes, gpu: budget.gpuBytes });
  arbiter.opportunistic("world");
  const navigation = createNavigationSilhouettes(scene, cel);
  const regions = createRegionResidency(region => {
    const before = new Set(scene.meshes);
    createEnvironment(scene, cel, region, cache);
    if (region === "refuge_reef") createLandmarks(scene, cel, glass, cache, labels);
    const expedition = createExpeditionRegion(scene, cel, glass, region, cache, labels);
    const life = createEcology(scene, cel, region, cache);
    const meshes = scene.meshes.filter(m => !before.has(m));
    for (const mesh of meshes) {
      mesh.renderingGroupId = 1;
      mesh.metadata = { ...mesh.metadata, detailRegion: region };
    }
    const bytes = meshes.reduce((n, m) => n + meshBytesOf(m as Mesh), 0);
    // Retention detaches meshes and geometries from the scene like an asset
    // container: nothing is evaluated or drawn, CPU/GPU buffers stay intact.
    let detached: Geometry[] | null = null;
    return {
      bytes,
      update(state) { expedition.update(state); life.update(state ? state.tick / 60 : 0, state); },
      setQuality(quality) { life.setQuality(quality); },
      suspend() {
        if (detached) return;
        detached = [];
        for (const mesh of meshes) {
          if (mesh.isDisposed()) continue;
          scene.removeMesh(mesh);
          const geometry = (mesh as Mesh).geometry;
          if (geometry && scene.removeGeometry(geometry)) detached.push(geometry);
        }
      },
      resume() {
        if (!detached) return;
        for (const geometry of detached) if (!geometry.isDisposed()) scene.addGeometry(geometry);
        detached = null;
        for (const mesh of meshes) if (!mesh.isDisposed()) scene.addMesh(mesh);
      },
      dispose() {
        expedition.dispose(); life.dispose();
        for (const mesh of meshes) if (!mesh.isDisposed()) mesh.dispose();
      },
    };
  }, RESIDENT_REGION_LIMIT, { maxBytes: REGION_OWNER_BYTES });
  // Detached and hidden buffers are not rebuilt by the engine after context loss.
  const lost = scene.getEngine().onContextLostObservable.add(() => { regions.discardRetained(); residency.discardHidden(); });
  const expedition = createExpeditionActors(scene, cel, glass, p => regions.contains(p), labels, cache);
  const fixed = scene.meshes.filter(m => !initial.has(m));
  let disposed = false;
  return {
    get active() { return regions.active; },
    get retained() { return regions.retained; },
    get residency() { return residency; },
    arbiter,
    get regionBytes() { return regions.bytes; },
    prepare() { return disposed ? null : regions.prepare(); },
    get cacheStats() { return cache.stats; },
    get labelStats() { return labels.stats; },
    update(state) {
      if (disposed) return;
      regions.update(state); navigation.update(regions.active); expedition.update(state);
    },
    stream(viewer, streaming = {}) {
      if (disposed) return null;
      const start = now();
      // Legacy owners, cave data and chunks share one budget through the
      // arbiter: owners holding live buffers re-reserve what they hold (with
      // priority: they already exist), and chunks get the world's share.
      const held = options.held?.() ?? { cpu: 0, gpu: 0 };
      for (const [owner, bytes] of [["regions", { cpu: regions.bytes, gpu: regions.bytes }], ["caves", held]] as const) {
        arbiter.release(owner); arbiter.reserve(owner, bytes, true);
      }
      residency.setExternalBytes(arbiter.externalFor("world"));
      let stats = residency.update(viewer);
      const near = streaming.nearRadius;
      while (near !== undefined && !stats.settled && !residency.isReady(near) && now() - start < CATCH_UP_MS)
        stats = residency.update(viewer);
      const extra = streaming.extraMs ?? 0;
      while (extra > 0 && !stats.settled && now() - start < extra) stats = residency.update(viewer);
      return stats;
    },
    setQuality(quality) { regions.setQuality?.(quality); },
    dispose() {
      if (disposed) return;
      disposed = true;
      regions.dispose(); residency.dispose(); expedition.dispose(); navigation.dispose();
      for (const mesh of fixed) if (!mesh.isDisposed()) mesh.dispose();
      cache.dispose(); labels.dispose();
      scene.onDisposeObservable.remove(disposal);
      scene.getEngine().onContextLostObservable.remove(lost);
    },
  };
}

/** Vertex and index bytes of a mesh's geometry, as the kit counts them. */
function meshBytesOf(mesh: Mesh): number {
  let bytes = 0;
  for (const kind of mesh.getVerticesDataKinds()) {
    const data = mesh.getVerticesData(kind, false, false);
    if (data) bytes += Array.isArray(data) ? data.length * 4 : (data as Float32Array).byteLength;
  }
  const indices = mesh.getIndices(false, true);
  if (indices) bytes += Array.isArray(indices) ? indices.length * 4 : (indices as Uint32Array).byteLength;
  return bytes;
}

/** Availability after loss follows engine reconstruction AND scene readiness,
 * not the earlier native canvas event. Becoming available requests a redraw;
 * it never grants permission to resume simulation. */
export function createRenderer(
  canvas: HTMLCanvasElement,
  availabilityChanged: (available: boolean) => void,
): GameRenderer {
  const engine = new Engine(
    canvas,
    true,
    {
      disableWebGL2Support: false,
      preserveDrawingBuffer: false,
      stencil: false,
      powerPreference: "high-performance",
    },
    true,
  );
  if (engine.webGLVersion < 2) {
    engine.dispose();
    throw new Error(
      "Siltwake needs WebGL 2. Enable hardware acceleration or use a current desktop browser with WebGL 2 support.",
    );
  }
  const scene = new Scene(engine);
  try {
    scene.useRightHandedSystem = true;
    scene.clearColor = Color4.FromHexString("#84bcb8ff");
    const camera = new FreeCamera(
      "player.camera",
      new Vector3(25, 13, 44),
      scene,
    );
    camera.inputs.clear();
    camera.minZ = 0.07;
    camera.maxZ = 450;
    camera.fov = 1.02;
    scene.activeCamera = camera;
    const cel = createCelMaterial(scene);
    // W1 cave light on the one cel material: the active cave's field and the
    // lamp. CW-1: fields come baked from the cave store, fetched ahead by the
    // streamer (generation only without a bake).
    const caves = gameCaveStore();
    const fields: CaveFieldSource = caves ? {
      field: id => caves.light(id) ?? (caves.lightSettled(id) ? liveCaveFields.field(id) : null),
      settled: id => caves.lightSettled(id),
    } : liveCaveFields;
    const caveView = createCaveView(scene, [cel], fields);
    // CW-1 streaming: cave collision built ahead by proximity and heading,
    // evicted behind and far first; light fields fetched and uploaded ahead;
    // terrain files fetched toward where the viewer is heading.
    const caveWorld = gameWorld();
    const streamer = createKitStreamer(caveWorld.kitCaves, new Map(CAVE_SOURCES.map(c => [c.id, c.footprint])));
    let lastStream: { at: Vector3; time: number } | null = null, velocity = Vector3.Zero(), streamFrames = 0;
    let streamFrame: KitStreamFrame | null = null, worstCaveBuildMs = 0;
    // Visible currents: grit streaks carried by the real flow field.
    const streaks = createCurrentStreaks(scene, cel);
    const glass = createGlassMaterial(scene);
    // Cave bytes for the arbiter: collision composites (about 160 B a box),
    // decoded light fields, and their textures on the GPU.
    const art = createRegionalArt(scene, cel, glass, { held: () => ({
      cpu: caveWorld.kitCaves.stats.residentBoxes * 160 + (caves?.stats.lightBytes ?? 0),
      gpu: caveView.stats.textureBytes,
    }) });
    // CW-1's far layer: the tallest landmarks and their lamps, always resident.
    const far = createFarLayer(scene, cel, art.residency);
    for (const mesh of scene.meshes) mesh.renderingGroupId = 1;
    const { water, sky } = createAtmosphere(scene);
    // ATM-1: emissive art, Rift vents, cockpit instruments and parked-craft
    // markers as the cel pass's local lights (and their halos on open water).
    const lights = createSceneLights(scene, cel, [cel, sky]);
    const cue = createTargetCue(scene);
    // S4's later-region species, cue animals, deterrents and field cues (C3).
    const creatures = createCreatureLayer(scene, cel);
    const placed = createPlacedHosts(scene, cel);
    // W2: the summit beacon over the hub and the crown rays' ring.
    const hub = createHubArt(scene, cel);
    for (const mesh of creatures.meshes) mesh.renderingGroupId = 1;
    const instrumentation = new SceneInstrumentation(scene);
    let presented = 0;
    canvas.dataset.renderer = "WebGL 2";
    canvas.dataset.meshes = String(scene.meshes.length);
    canvas.dataset.vertices = String(
      scene.meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0),
    );
    const resize = (): void => engine.resize();
    const setQuality = (quality: Quality): void => {
      // Explicit CSS-pixel policy: predictable on DPR=1/2; Light is always distinct.
      engine.setHardwareScalingLevel(quality === "light" ? 1.5 : 1);
      art.setQuality?.(quality);
      engine.resize();
    };
    setQuality("rich");
    let disposed = false,
      available = true,
      generation = 0;
    let lastViewer: Vector3 | null = null;
    let whenReady: (() => void) | null = null;
    const cancelReady = (): void => {
      if (whenReady) scene.onReadyObservable.removeCallback(whenReady);
      whenReady = null;
    };
    canvas.dataset.graphics = "available";
    const lost = engine.onContextLostObservable.add(() => {
      if (disposed) return;
      generation++;
      cancelReady();
      available = false;
      canvas.dataset.graphics = "lost";
      canvas.dataset.ready = "false";
      availabilityChanged(false);
    });
    const restored = engine.onContextRestoredObservable.add(() => {
      if (disposed) return;
      cancelReady();
      const restoredGeneration = generation;
      canvas.dataset.graphics = "restoring";
      whenReady = () => {
        if (disposed || generation !== restoredGeneration) return;
        whenReady = null;
        available = true;
        canvas.dataset.graphics = "available";
        availabilityChanged(true);
      };
      scene.executeWhenReady(whenReady);
    });
    return {
      present(state, overlay) {
        if (disposed || !available) return;
        const time = state ? state.tick / 60 : 0;
        const activationStart = performance.now();
        const timedParts = !!(globalThis as { __siltwakePerf?: unknown }).__siltwakePerf;
        const priorRegions = art.active.join(",");
        art.update(state);
        const regionsMs = performance.now() - activationStart;
        canvas.dataset.regions = art.active.join(",");
        if (priorRegions !== canvas.dataset.regions) {
          canvas.dataset.activationMs = (performance.now() - activationStart).toFixed(3);
          canvas.dataset.retained = art.retained.join(",");
        }
        let lamp: Vector3 | null = null;
        if (state) {
          if (state.opening.phase < 4) {
            const phase = state.opening.phase,
              t = state.opening.phaseTicks / 60;
            camera.position.set(0, 1.05 + Math.min(0.4, t * 0.03), 22.0);
            camera.setTarget(
              new Vector3(
                phase === 1 ? -1.5 : phase === 2 ? 0.8 : 0,
                phase === 0 ? 0.5 : 1.5,
                phase < 2 ? 20.3 : 10,
              ),
            );
            camera.rotation.z = Math.sin(t * 1.8) * 0.015 * (3 - phase);
          } else {
            // Each hull's own view datum inside its real canopy or pilot
            // compartment (the Creel's slides over the bow for arm work); the
            // eye is kept out of solids and terrain (camera.ts).
            const seated = state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId && (v.hull === "dart" || v.hull === "creel"));
            const hull = seated ? scene.getMeshByName(seated.id) : null;
            const matrix = hull?.computeWorldMatrix(true);
            const view = playerView(state, matrix ? p => {
              const w = Vector3.TransformCoordinates(new Vector3(p.x, p.y, p.z), matrix);
              return { x: w.x, y: w.y, z: w.z };
            } : null, gameWorld(), DART_SEAT);
            camera.position.set(view.eye.x, view.eye.y, view.eye.z);
            camera.setTarget(camera.position.add(new Vector3(view.forward.x, view.forward.y, view.forward.z)));
            camera.rotation.z = 0;
            lamp = new Vector3(view.lamp.x, view.lamp.y, view.lamp.z);
            canvas.dataset.workView = view.work.toFixed(2);
          }
        } else {
          camera.position.set(25, 13, 44);
          camera.setTarget(new Vector3(-1, -0.8, -20));
        }
        // Chunks stream around the camera. After a load or a jump the nearby
        // ground is built before this frame draws; with no expedition running
        // (title, loading) construction gets more of each frame.
        const jumped = !lastViewer || Vector3.Distance(lastViewer, camera.position) > JUMP;
        lastViewer = camera.position.clone();
        const cinematic = !state || state.opening.phase < 4;
        const extraMs = cinematic ? MENU_BUILD_MS : art.residency.isReady(VISIBLE_WORLD) ? 0 : PLAY_BUILD_MS;
        const timed = !!(globalThis as { __siltwakePerf?: unknown }).__siltwakePerf;
        const tStream = timed ? performance.now() : 0;
        const world = art.stream(camera.position, { ...(jumped ? { nearRadius: NEAR_WORLD } : {}), extraMs });
        const chunkMs = timed ? performance.now() - tStream : 0;
        cue.update(state ? overlay?.target ?? overlay?.preview ?? null : null, camera.position, !!overlay?.target);
        const interior = !!state && (inCanopyAir(state) || state.player.mode === "interior");
        const underwater = camera.position.y < -0.08 && !interior ? 1 : 0;
        const fog = Color3.FromHexString(interior ? "#486e76" : underwater ? "#226e7e" : "#96c5b9");
        scene.clearColor = new Color4(fog.r, fog.g, fog.b, 1);
        const tLights = timedParts ? performance.now() : 0;
        const optics = updateOpticalUniforms([cel, glass, water, sky, cue.material], camera.position, state);
        lights.update(state, camera.position, optics.ambient, time);
        const lightsMs = timedParts ? performance.now() - tLights : 0;
        canvas.dataset.localLights = `${lights.stats.sent}/${lights.stats.known}`;
        cel.setFloat("underwater", underwater);
        cel.setFloat("lampOn", state && state.opening.phase >= 4 && lampOn(state) ? 1 : 0);
        // Viewer velocity (smoothed) for heading-aware prefetch; a jump resets it.
        const nowMs = performance.now();
        if (lastStream && !jumped && nowMs > lastStream.time) {
          const v = camera.position.subtract(lastStream.at).scale(1000 / (nowMs - lastStream.time));
          velocity = Vector3.Lerp(velocity, v, 0.1);
        } else velocity = Vector3.Zero();
        lastStream = { at: camera.position.clone(), time: nowMs };
        // Records must have landed before the streamer builds from them;
        // without a store (or a bake) clusters generate live.
        const tCaves = timed ? performance.now() : 0;
        if (!caves || caves.settled) {
          streamFrame = streamer.update(camera.position, velocity);
          worstCaveBuildMs = Math.max(worstCaveBuildMs, streamFrame.buildMs);
          caveView.stream(streamFrame.light, streamFrame.upload);
          caves?.retainLight(streamFrame.light);
        }
        if (++streamFrames % 30 === 0) terrainStore()?.prefetch(camera.position.add(velocity.scale(streamer.options.lookAhead)), 520);
        caveView.update(lamp ?? camera.position, camera.getTarget().subtract(camera.position),
          !!state && state.opening.phase >= 4 && lampOn(state) && underwater === 1);
        const caveMs = timed ? performance.now() - tCaves : 0;
        canvas.dataset.cave = caveView.active ?? "";
        const ks = caveWorld.kitCaves.stats;
        canvas.dataset.caveStream = JSON.stringify({ sync: ks.syncBuilds, built: ks.built, evicted: ks.evicted, boxes: ks.residentBoxes,
          stepMs: +ks.maxStepMs.toFixed(2), buildMs: +worstCaveBuildMs.toFixed(2), pending: streamFrame?.pending ?? -1,
          missing: caveView.stats.missing, uploads: caveView.stats.uploads, lightBytes: caves?.stats.lightBytes ?? 0,
          textureBytes: caveView.stats.textureBytes, records: caves ? !!caves.collision : null, recordsMs: caves?.stats.collisionMs ?? 0 });
        streaks.update(camera.position, state?.tick ?? 0, !!state && state.opening.phase >= 4 && underwater === 1);
        canvas.dataset.currentStreaks = String(streaks.shown);
        const tActors = timedParts ? performance.now() : 0;
        placed.update(state, { x: camera.position.x, y: camera.position.y, z: camera.position.z });
        hub.update(time, { x: camera.position.x, y: camera.position.y, z: camera.position.z });
        far.update();
        canvas.dataset.farLandmarks = String(far.shown);
        if (state) creatures.update(ecologyView(state.world.ecology, state.tick, presentationStimulus(state)), time,
          { x: camera.position.x, y: camera.position.y, z: camera.position.z });
        const actorsMs = timedParts ? performance.now() - tActors : 0;
        cel.setFloat("time", time);
        water.setFloat("time", time);
        sky.setFloat("time", time);
        canvas.dataset.water = underwater ? "underwater" : "above";
        canvas.dataset.cameraPosition = camera.position.asArray().map(n => n.toFixed(3)).join(",");
        const tRender = timed ? performance.now() : 0;
        scene.render();
        if (timed) (globalThis as { __siltwakePresent?: unknown }).__siltwakePresent = {
          regions: +regionsMs.toFixed(2), lights: +lightsMs.toFixed(2), actors: +actorsMs.toFixed(2),
          chunks: +chunkMs.toFixed(2), caves: +caveMs.toFixed(2), render: +(performance.now() - tRender).toFixed(2),
          buildMs: +(world?.buildMs ?? 0).toFixed(2), maxStepMs: +(world?.maxStepMs ?? 0).toFixed(2), uploadMs: +(world?.uploadMs ?? 0).toFixed(2),
          uploads: world?.uploads ?? 0, caveBuildMs: +(streamFrame?.buildMs ?? 0).toFixed(2),
        };
        canvas.dataset.meshes = String(scene.meshes.length);
        canvas.dataset.vertices = String(scene.meshes.reduce((n, m) => n + m.getTotalVertices(), 0));
        canvas.dataset.triangles = String(scene.meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0));
        canvas.dataset.draws = String(instrumentation.drawCallsCounter.current);
        canvas.dataset.materials = String(scene.materials.length);
        canvas.dataset.geometries = String(scene.geometries.length);
        canvas.dataset.textures = String(scene.textures.length);
        // Ready: the scene's effects are compiled AND chunk residency has
        // settled (nothing left to build, upload or evict for this view, which
        // includes a stable degraded state under byte pressure). The app keeps
        // presenting paused screens until then, so the world streams in behind
        // the title. `worldReady` is the stricter nearby completeness.
        const sceneReady = scene.isReady();
        canvas.dataset.sceneReady = String(sceneReady);
        canvas.dataset.worldReady = String(art.residency.isReady(NEAR_WORLD));
        canvas.dataset.worldSettled = String(!!world?.settled);
        canvas.dataset.ready = sceneReady && world?.settled ? "true" : "false";
        if (world) {
          canvas.dataset.residentCpu = String(world.cpuBytes);
          canvas.dataset.residentGpu = String(world.gpuBytes);
          canvas.dataset.residentUnits = String(world.shown + world.hidden);
          canvas.dataset.pending = String(world.pending + world.building + world.prepared + world.uploading);
          canvas.dataset.refused = String(world.refused.length);
          canvas.dataset.regionBytes = String(art.regionBytes);
        }
        canvas.dataset.frames = String(++presented);
      },
      prepare() {
        if (disposed || !available) return false;
        if (caveView.prepare()) return true;
        const start = performance.now();
        const region = art.prepare();
        if (!region) return false;
        // Cold construction moved to idle time stays measured, never folded
        // into activationMs: it is first-use work, not a warm activation.
        canvas.dataset.prepared = [...(canvas.dataset.prepared ? canvas.dataset.prepared.split(",") : []),
          `${region}:${(performance.now() - start).toFixed(3)}`].join(",");
        canvas.dataset.retained = art.retained.join(",");
        return true;
      },
      setQuality,
      resize,
      dispose() {
        if (disposed) return;
        disposed = true;
        cancelReady();
        engine.onContextLostObservable.remove(lost);
        engine.onContextRestoredObservable.remove(restored);
        art.dispose();
        creatures.dispose();
        placed.dispose();
        hub.dispose();
        far.dispose();
        caveView.dispose();
        streaks.dispose();
        lights.dispose();
        instrumentation.dispose();
        cue.dispose();
        scene.dispose();
        engine.dispose();
      },
    };
  } catch (error) {
    scene.dispose();
    engine.dispose();
    throw error;
  }
}
