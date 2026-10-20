import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation.js";
import type { GameState } from "../sim/types.js";
import { eyeHeight } from "../sim/state.js";
import type { InteractionHost } from "../sim/targeting.js";
import { createTargetCue } from "./targetCue.js";
import { inCanopyAir } from "../sim/inventory.js";
import { createCelMaterial, createGlassMaterial, updateOpticalUniforms } from "./materials.js";
import { createEnvironment } from "./environment.js";
import { createLandmarks, createNavigationSilhouettes, LabelMaterials } from "./landmarks.js";
import { createEcology } from "./ecology.js";
import { createExpeditionActors, createExpeditionRegion, DART_SEAT } from "./expedition.js";
import { CREEL_SEAT } from "../sim/fleet.js";
import { createAtmosphere } from "./atmosphere.js";
import { createRegionResidency, type RegionArt, type RenderRegion } from "./regions.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Geometry } from "@babylonjs/core/Meshes/geometry.js";
import { GeometryCache } from "./geometryCache.js";

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

/** Internal scene lifetime, also exercised with the real NullEngine factories.
 * Shared cel/glass stay scene-owned; every regional/actor handle owns its meshes. */
export function createRegionalArt(scene: Scene, cel: ShaderMaterial, glass: ShaderMaterial): RegionArt & {
  readonly active: readonly RenderRegion[];
  readonly retained: readonly RenderRegion[];
  prepare(): RenderRegion | null;
  readonly cacheStats: GeometryCache["stats"];
  readonly labelStats: LabelMaterials["stats"];
} {
  const cache = new GeometryCache(), labels = new LabelMaterials(scene);
  const disposal = scene.onDisposeObservable.add(() => { cache.dispose(); labels.dispose(); });
  const initial = new Set(scene.meshes);
  createEnvironment(scene, cel, "terrain");
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
    // Retention detaches meshes and geometries from the scene like an asset
    // container: nothing is evaluated or drawn, CPU/GPU buffers stay intact.
    let detached: Geometry[] | null = null;
    return {
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
  });
  // Detached buffers are not rebuilt by the engine after context loss.
  const lost = scene.getEngine().onContextLostObservable.add(() => regions.discardRetained());
  const expedition = createExpeditionActors(scene, cel, glass, p => regions.contains(p), labels, cache);
  const fixed = scene.meshes.filter(m => !initial.has(m));
  let disposed = false;
  return {
    get active() { return regions.active; },
    get retained() { return regions.retained; },
    prepare() { return disposed ? null : regions.prepare(); },
    get cacheStats() { return cache.stats; },
    get labelStats() { return labels.stats; },
    update(state) {
      if (disposed) return;
      regions.update(state); navigation.update(regions.active); expedition.update(state);
    },
    setQuality(quality) { regions.setQuality?.(quality); },
    dispose() {
      if (disposed) return;
      disposed = true;
      regions.dispose(); expedition.dispose(); navigation.dispose();
      for (const mesh of fixed) if (!mesh.isDisposed()) mesh.dispose();
      cache.dispose(); labels.dispose();
      scene.onDisposeObservable.remove(disposal);
      scene.getEngine().onContextLostObservable.remove(lost);
    },
  };
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
    const glass = createGlassMaterial(scene);
    const art = createRegionalArt(scene, cel, glass);
    for (const mesh of scene.meshes) mesh.renderingGroupId = 1;
    const { water, sky } = createAtmosphere(scene);
    const cue = createTargetCue(scene);
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
        const priorRegions = art.active.join(",");
        art.update(state);
        canvas.dataset.regions = art.active.join(",");
        if (priorRegions !== canvas.dataset.regions) {
          canvas.dataset.activationMs = (performance.now() - activationStart).toFixed(3);
          canvas.dataset.retained = art.retained.join(",");
        }
        if (state) {
          const pose = state.player.pose;
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
            const seated = state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId && (v.hull === "dart" || v.hull === "creel"));
            const hull = seated ? scene.getMeshByName(seated.id) : null;
            if (seated && hull) {
              // Each hull's own view datum inside its real canopy or pilot compartment.
              const seat = seated.hull === "creel" ? CREEL_SEAT : DART_SEAT;
              camera.position.copyFrom(Vector3.TransformCoordinates(
                new Vector3(seat.x, seat.y, seat.z),
                hull.computeWorldMatrix(true),
              ));
            } else {
              camera.position.set(pose.position.x, pose.position.y + eyeHeight(state), pose.position.z);
            }
            const direction = new Vector3(
              Math.sin(pose.yaw) * Math.cos(pose.pitch),
              Math.sin(pose.pitch),
              -Math.cos(pose.yaw) * Math.cos(pose.pitch),
            );
            camera.setTarget(camera.position.add(direction));
            camera.rotation.z = 0;
          }
        } else {
          camera.position.set(25, 13, 44);
          camera.setTarget(new Vector3(-1, -0.8, -20));
        }
        cue.update(state ? overlay?.target ?? overlay?.preview ?? null : null, camera.position, !!overlay?.target);
        const interior = !!state && (inCanopyAir(state) || state.player.mode === "interior");
        const underwater = camera.position.y < -0.08 && !interior ? 1 : 0;
        const fog = Color3.FromHexString(interior ? "#486e76" : underwater ? "#226e7e" : "#96c5b9");
        scene.clearColor = new Color4(fog.r, fog.g, fog.b, 1);
        updateOpticalUniforms([cel, glass, water, sky, cue.material], camera.position, state);
        cel.setFloat("underwater", underwater);
        cel.setFloat("time", time);
        water.setFloat("time", time);
        canvas.dataset.water = underwater ? "underwater" : "above";
        canvas.dataset.cameraPosition = camera.position.asArray().map(n => n.toFixed(3)).join(",");
        scene.render();
        canvas.dataset.meshes = String(scene.meshes.length);
        canvas.dataset.vertices = String(scene.meshes.reduce((n, m) => n + m.getTotalVertices(), 0));
        canvas.dataset.triangles = String(scene.meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0));
        canvas.dataset.draws = String(instrumentation.drawCallsCounter.current);
        canvas.dataset.materials = String(scene.materials.length);
        canvas.dataset.geometries = String(scene.geometries.length);
        canvas.dataset.textures = String(scene.textures.length);
        canvas.dataset.ready = scene.isReady() ? "true" : "false";
        canvas.dataset.frames = String(++presented);
      },
      prepare() {
        if (disposed || !available) return false;
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
