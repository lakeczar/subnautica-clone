import test from 'node:test';
import assert from 'node:assert/strict';
import { DART_BUILD_POSE, HULL_COLLIDERS } from '../src/content/registry.js';
import { createWorldQueries, hullClearance, moveHull } from '../src/sim/world.js';

test('Dart construction, cradle rail obstruction and sea approach use its full shared footprint', () => {
  const world = createWorldQueries(), shape = HULL_COLLIDERS.dart;
  assert.equal(hullClearance(world, DART_BUILD_POSE, shape), true);
  assert.equal(hullClearance(world, { ...DART_BUILD_POSE, x: 22 }, shape), false);
  const exit = moveHull(world, DART_BUILD_POSE, { x: 0, y: 0, z: 10 }, shape);
  assert.equal(exit.hitSolid, false);
  assert.ok(exit.position.z > -12.01);
  const side = moveHull(world, DART_BUILD_POSE, { x: 12, y: 0, z: 0 }, shape);
  assert.equal(side.hitSolid, true);
  assert.ok(side.position.x < 20.71);
});

test('a clear centre cannot authorize hull launch or travel through a raised footprint edge', () => {
  const base = createWorldQueries([]), world = { ...base, groundHeight: (x: number) => x > 2 ? -1 : -20 };
  const shape = HULL_COLLIDERS.dart, start = { x: -4, y: -8, z: 0 };
  assert.equal(hullClearance(world, start, shape), true);
  assert.equal(hullClearance(world, { x: 0, y: -8, z: 0 }, shape), false);
  const result = moveHull(world, start, { x: 10, y: 0, z: 0 }, shape);
  assert.equal(result.hitSolid, true);
  assert.ok(result.position.x < -1.59);
});
