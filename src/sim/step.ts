import { FIXED_SECONDS } from './clock.js';
import type { GameCommand, GameEvent, GameState, WorldQueries } from './types.js';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
const TAU = Math.PI * 2;

/** A pure committed update. Commands cannot write arbitrary state. Vitals are reserved
 * in FND-01 and do not drain until food, air, warnings and recovery arrive together. */
export function stepGame(state: GameState, commands: readonly GameCommand[], world: WorldQueries): { state: GameState; events: GameEvent[] } {
  let yaw = state.player.pose.yaw, pitch = state.player.pose.pitch;
  let forward = 0, right = 0, vertical = 0, sprint = false;
  for (const command of commands) {
    if (command.type === 'look') {
      yaw += clamp(command.yawDelta, -0.8, 0.8);
      pitch = clamp(pitch + clamp(command.pitchDelta, -0.8, 0.8), -1.35, 1.35);
    } else {
      forward = clamp(command.forward, -1, 1); right = clamp(command.right, -1, 1);
      vertical = clamp(command.vertical, -1, 1); sprint = command.sprint;
    }
  }
  yaw = ((yaw % TAU) + TAU) % TAU;
  const old = state.player.pose.position;
  const support = world.supportHeight(old.x, old.z, old.y);
  let mode = support >= world.waterHeight - 0.55 && old.y >= support - 0.25 ? 'walking' as const : 'swimming' as const;
  const speed = mode === 'walking' ? (sprint ? 5.5 : 3.6) : (sprint ? 5.2 : 3.4);
  const inputLength = Math.max(1, Math.hypot(forward, right));
  forward /= inputLength; right /= inputLength;
  const pitchFactor = mode === 'swimming' ? Math.cos(pitch) : 1;
  let vx = (Math.sin(yaw) * forward * pitchFactor + Math.cos(yaw) * right) * speed;
  let vz = (-Math.cos(yaw) * forward * pitchFactor + Math.sin(yaw) * right) * speed;
  let vy: number;
  if (mode === 'walking') {
    const grounded = old.y <= support + 0.025;
    vy = grounded ? (vertical > 0.5 ? 5.4 : -0.2) : state.player.velocity.y - 13 * FIXED_SECONDS;
  } else if (old.y > world.waterHeight - 0.5) {
    vy = state.player.velocity.y - 12 * FIXED_SECONDS;
  } else {
    vy = vertical * 2.8 + Math.sin(pitch) * forward * speed;
    // Neutral buoyancy lets the player stop and inspect a colony at a stable depth.
    if (Math.abs(vertical) < 0.01 && Math.abs(Math.sin(pitch) * forward) < 0.04) vy = 0;
    const magnitude = Math.hypot(vx, vy, vz);
    if (magnitude > speed) { const scale = speed / magnitude; vx *= scale; vy *= scale; vz *= scale; }
  }
  // Terrain is sampled in small travel slices; solids use continuous sweeps.
  const slices = Math.max(1, Math.ceil(Math.hypot(vx, vy, vz) * FIXED_SECONDS / 0.12));
  let position = { ...old }, hitBoundary = false;
  const capsule = { radius: 0.34, height: mode === 'walking' ? 1.75 : 0.95 };
  for (let i = 0; i < slices; i++) {
    const delta = { x: vx * FIXED_SECONDS / slices, y: vy * FIXED_SECONDS / slices, z: vz * FIXED_SECONDS / slices };
    const nextFloor = world.groundHeight(position.x + delta.x, position.z + delta.z);
    const currentFloor = world.groundHeight(position.x, position.z);
    const rise = nextFloor - currentFloor;
    if (nextFloor > position.y + 0.22 && rise > Math.hypot(delta.x, delta.z) * 1.15 + 0.015) { delta.x = 0; delta.z = 0; vx = 0; vz = 0; }
    const nextSupport = world.supportHeight(position.x + delta.x, position.z + delta.z, position.y);
    // Project small floor rises before the solid sweep. Otherwise gravity makes a
    // capsule snag a deck lip even when the ramp already reaches the same height.
    if (nextSupport <= position.y + 0.22 && position.y + delta.y < nextSupport) delta.y = nextSupport - position.y;
    const move = world.moveCapsule(position, delta, capsule);
    position = move.position; hitBoundary ||= move.hitBoundary;
    const floor = world.supportHeight(position.x, position.z, position.y);
    if (position.y < floor) { position.y = floor; vy = 0; }
    if (mode === 'swimming' && position.y > world.waterHeight - 0.5 && old.y <= world.waterHeight - 0.5 && floor < world.waterHeight - 0.55) { position.y = world.waterHeight - 0.5; vy = 0; }
  }
  const finalSupport = world.supportHeight(position.x, position.z, position.y);
  mode = finalSupport >= world.waterHeight - 0.55 && position.y >= finalSupport - 0.25 ? 'walking' : 'swimming';
  const events: GameEvent[] = [];
  if (mode !== state.player.mode) events.push({ type: 'movement-mode-changed', mode });
  if (hitBoundary) events.push({ type: 'foundation-boundary' });
  return {
    state: {
      ...state, tick: state.tick + 1,
      player: { ...state.player, mode, velocity: { x: vx, y: vy, z: vz }, pose: { frame: 'world', position, yaw, pitch } },
    }, events,
  };
}
