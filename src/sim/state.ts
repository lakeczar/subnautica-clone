import { PLACES } from '../content/registry.js';
import type { GameState } from './types.js';

export function createGame(): GameState {
  return {
    tick: 0,
    player: {
      pose: { frame: 'world', position: { ...PLACES.home_pod.position }, yaw: 0, pitch: -0.05 },
      velocity: { x: 0, y: 0, z: 0 }, mode: 'walking',
      vitals: { health: 100, oxygen: 100, food: 100 }, refugeId: 'home_pod',
      controlledVehicleId: null, interiorId: null,
    },
    inventory: { items: [], containers: [] },
    knowledge: { blueprints: [], scans: [], evidence: [], journals: [], markers: [] },
    world: { resources: [], facilities: [] }, fleet: { vehicles: [], docking: null }, recovery: { caches: [] },
  };
}

export const eyeHeight = (state: GameState): number => state.player.mode === 'walking' ? 1.62 : 0.65;
