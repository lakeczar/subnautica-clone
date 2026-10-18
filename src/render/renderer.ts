import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import type { GameState } from "../sim/types.js";
import { eyeHeight } from "../sim/state.js";
import type { InteractionHost } from "../sim/targeting.js";
import { createTargetCue } from "./targetCue.js";
import { inCanopyAir } from "../sim/inventory.js";
import { createCelMaterial, createGlassMaterial, updateOpticalUniforms } from "./materials.js";
import { createEnvironment } from "./environment.js";
import { createLandmarks } from "./landmarks.js";
import { createEcology } from "./ecology.js";
import { createExpeditionArt, DART_SEAT } from "./expedition.js";
import { createAtmosphere } from "./atmosphere.js";

export type Quality = "rich" | "light";
export interface GameRenderer {
  present(state: GameState | null, overlay?: { target: InteractionHost | null }): void;
  setQuality(quality: Quality): void;
  resize(): void;
  dispose(): void;
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
    createEnvironment(scene, cel);
    createLandmarks(scene, cel, glass);
    const life = createEcology(scene, cel);
    const expedition = createExpeditionArt(scene, cel, glass);
    for (const mesh of scene.meshes) mesh.renderingGroupId = 1;
    const { water, sky } = createAtmosphere(scene);
    const cue = createTargetCue(scene);
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
        expedition.update(state);
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
            const dart = state.fleet.vehicles.find(v => v.id === state.player.controlledVehicleId && v.hull === "dart");
            if (dart) {
              const hull = scene.getMeshByName(dart.id)!;
              camera.position.copyFrom(Vector3.TransformCoordinates(
                new Vector3(DART_SEAT.x, DART_SEAT.y, DART_SEAT.z),
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
        cue.update(state ? overlay?.target ?? null : null, camera.position);
        const interior = !!state && (inCanopyAir(state) || state.player.mode === "interior");
        const underwater = camera.position.y < -0.08 && !interior ? 1 : 0;
        const fog = Color3.FromHexString(interior ? "#486e76" : underwater ? "#226e7e" : "#96c5b9");
        scene.clearColor = new Color4(fog.r, fog.g, fog.b, 1);
        updateOpticalUniforms([cel, glass, water, sky, cue.material], camera.position, state);
        cel.setFloat("underwater", underwater);
        cel.setFloat("time", time);
        water.setFloat("time", time);
        life.update(time);
        canvas.dataset.water = underwater ? "underwater" : "above";
        canvas.dataset.cameraPosition = camera.position.asArray().map(n => n.toFixed(3)).join(",");
        scene.render();
        canvas.dataset.ready = scene.isReady() ? "true" : "false";
        canvas.dataset.frames = String(++presented);
      },
      setQuality,
      resize,
      dispose() {
        if (disposed) return;
        disposed = true;
        cancelReady();
        engine.onContextLostObservable.remove(lost);
        engine.onContextRestoredObservable.remove(restored);
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
