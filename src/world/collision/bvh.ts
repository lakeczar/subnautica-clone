/** A bounding-volume hierarchy over primitive boxes (Babylon-free).
 *
 * Nodes are laid out depth first: an inner node's left child is the next
 * node, and `links` holds its right child. A leaf's link packs `LEAF_BIT`,
 * its primitive count (7 bits) and its first primitive in leaf order
 * (24 bits). Splits are at the median along the longest centroid extent, so
 * the build is deterministic and the depth is about log2(n / leaf).
 *
 * A BVH adapts to where the primitives are. Large or anisotropic shapes
 * never fan out into a uniform fine grid (TST-05's 56M-entry cliff): cost
 * and size follow the primitive count only. */

export const LEAF_BIT = 0x80000000;
export const MAX_PRIMITIVES = 1 << 24;
export const isLeaf = (link: number): boolean => (link & LEAF_BIT) !== 0;
export const leafCount = (link: number): number => (link >>> 24) & 0x7f;
export const leafFirst = (link: number): number => link & 0xffffff;

export interface BuiltBvh {
  /** Primitive indices in leaf order. */
  readonly order: Int32Array;
  /** 6 doubles per node: min xyz, max xyz. */
  readonly bounds: Float64Array;
  readonly links: Uint32Array;
}

/** `boxes` holds 6 doubles per primitive (min xyz, max xyz). */
export function buildBvh(boxes: Float64Array, leafSize: number): BuiltBvh {
  const n = boxes.length / 6;
  if (n > MAX_PRIMITIVES) throw new Error(`bvh: ${n} primitives exceed ${MAX_PRIMITIVES}`);
  if (leafSize < 1 || leafSize > 127) throw new Error(`bvh: leaf size ${leafSize} out of range`);
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const cent = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) cent[i * 3 + k] = (boxes[i * 6 + k]! + boxes[i * 6 + 3 + k]!) / 2;
  const bounds: number[] = [], links: number[] = [];
  const build = (start: number, end: number): void => {
    const id = links.length;
    links.push(0);
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    let cnx = Infinity, cny = Infinity, cnz = Infinity, cxx = -Infinity, cxy = -Infinity, cxz = -Infinity;
    for (let i = start; i < end; i++) {
      const p = order[i]!, b = p * 6, c = p * 3;
      mnx = Math.min(mnx, boxes[b]!); mny = Math.min(mny, boxes[b + 1]!); mnz = Math.min(mnz, boxes[b + 2]!);
      mxx = Math.max(mxx, boxes[b + 3]!); mxy = Math.max(mxy, boxes[b + 4]!); mxz = Math.max(mxz, boxes[b + 5]!);
      cnx = Math.min(cnx, cent[c]!); cny = Math.min(cny, cent[c + 1]!); cnz = Math.min(cnz, cent[c + 2]!);
      cxx = Math.max(cxx, cent[c]!); cxy = Math.max(cxy, cent[c + 1]!); cxz = Math.max(cxz, cent[c + 2]!);
    }
    bounds.push(mnx, mny, mnz, mxx, mxy, mxz);
    if (end - start <= leafSize) { links[id] = (LEAF_BIT | ((end - start) << 24) | start) >>> 0; return; }
    const ex = cxx - cnx, ey = cxy - cny, ez = cxz - cnz, ax = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const part = Array.from(order.subarray(start, end)).sort((a, b) => cent[a * 3 + ax]! - cent[b * 3 + ax]! || a - b);
    order.set(part, start);
    const mid = (start + end) >> 1;
    build(start, mid);
    links[id] = links.length;
    build(mid, end);
  };
  if (n) build(0, n);
  return { order, bounds: new Float64Array(bounds), links: new Uint32Array(links) };
}

/** Deepest stack any traversal needs, checked when a hierarchy is built. */
export const STACK_DEPTH = 64;
export function bvhDepth(links: Uint32Array): number {
  let deepest = 0;
  const walk = (id: number, depth: number): void => {
    deepest = Math.max(deepest, depth);
    const l = links[id]!;
    if (isLeaf(l)) return;
    walk(id + 1, depth + 1); walk(l, depth + 1);
  };
  if (links.length) walk(0, 1);
  return deepest;
}
