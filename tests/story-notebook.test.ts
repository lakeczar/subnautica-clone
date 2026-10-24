import test from "node:test";
import assert from "node:assert/strict";
import { DISCOVERY_IDS, JOURNALS, siteOf } from "../src/content/story/evidence.js";
import type { DiscoveryId } from "../src/content/story/evidence.js";
import { FACT_IDS } from "../src/content/story/facts.js";
import { QUESTIONS } from "../src/content/story/questions.js";
import type { HypothesisDefinition, QuestionDefinition, QuestionId } from "../src/content/story/questions.js";
import { STORY_SITES } from "../src/content/story/sites.js";
import { learned, mergeDiscoveries, openLeads, recordDiscovery } from "../src/sim/story/knowledge.js";
import { hypothesisStatus, notebook, questionView } from "../src/sim/story/notebook.js";
import type { NotebookView } from "../src/sim/story/notebook.js";
import { planCampaign } from "../src/sim/story/reachability.js";
import { createStory } from "../src/sim/story/state.js";
import type { StoryState } from "../src/sim/story/state.js";

function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs], r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
function storyOf(order: readonly DiscoveryId[]): StoryState {
  const s = createStory();
  order.forEach((id, i) => recordDiscovery(s, id, i + 1));
  return s;
}
/** The order-independent part of the view. */
const canonical = (v: NotebookView) => ({
  ...v,
  entries: v.entries.map(({ firstRead: _, ...e }) => e).sort((a, b) => a.id.localeCompare(b.id)),
  journals: [...v.journals].sort((a, b) => a.id.localeCompare(b.id)),
});
const ORDERS = Array.from({ length: 60 }, (_, i) => shuffled(DISCOVERY_IDS, 1000 + i));
const QIDS = Object.keys(QUESTIONS) as QuestionId[];
const hyps = (q: QuestionDefinition) => Object.entries(q.hypotheses) as [string, HypothesisDefinition][];

test("any order of the same discoveries yields the same notebook", () => {
  for (let k = 0; k < 40; k++) {
    const set = ORDERS[k]!.slice(0, 1 + (k % DISCOVERY_IDS.length));
    const a = notebook(storyOf(set)), b = notebook(storyOf(shuffled(set, 77 + k)));
    assert.deepEqual(canonical(a), canonical(b), `set ${set.join(",")}`);
  }
});

test("every prefix of every order stays coherent", () => {
  for (const order of ORDERS) {
    const s = createStory();
    const wasCurrent = new Map<DiscoveryId, string>(), replaced = new Set<DiscoveryId>();
    order.forEach((id, i) => {
      recordDiscovery(s, id, i + 1);
      const known = learned(s.discoveries), view = notebook(s);
      for (const q of view.questions) {
        const def: QuestionDefinition = QUESTIONS[q.id];
        for (const h of q.hypotheses) {
          const hd = def.hypotheses[h.id]!;
          if ((hd.ruledOut ?? []).some((c) => c.every((f) => known.has(f))))
            assert.ok(h.status === "ruled_out" || h.status === "established", `${q.id}.${h.id} shown ${h.status} though ruled out`);
        }
        if (q.answer)
          for (const h of q.hypotheses)
            assert.ok(h.status === "established" || h.status === "ruled_out" || def.hypotheses[h.id]!.survivesAnswer,
              `${q.id} answered while ${h.id} is still ${h.status} (after ${order.slice(0, i + 1).join(",")})`);
      }
      const after = order.slice(0, i + 1).join(",");
      for (const e of view.entries) {
        assert.ok(e.reading !== null || e.notes.length > 0, `${e.id} has a current reading`);
        if (e.firstRead) assert.equal(e.reading, null, `${e.id} first read is never also current`);
        // History: a replaced reading never returns, and a first read is exactly
        // the reading that was current at an earlier prefix, or nothing.
        if (e.reading !== null) {
          assert.ok(!replaced.has(e.id), `${e.id} reading restored after replacement (after ${after})`);
          wasCurrent.set(e.id, e.reading);
        } else {
          replaced.add(e.id);
          assert.equal(e.firstRead, wasCurrent.get(e.id) ?? null, `${e.id} first read must be what was shown (after ${after})`);
        }
      }
    });
  }
});

test("no hypothesis can be both established and ruled out, and answers settle their questions", () => {
  const all = new Map(FACT_IDS.map((f) => [f, 0]));
  for (const id of QIDS) {
    const q: QuestionDefinition = QUESTIONS[id];
    for (const [hid, h] of hyps(q)) {
      const both = (h.established ?? []).length && (h.ruledOut ?? []).length;
      assert.ok(!both, `${id}.${hid} has both established and ruledOut conditions`);
    }
    if (!q.answer) continue;
    for (const facts of [new Map(q.answer.when.map((f) => [f, 0])), all]) {
      const view = questionView(id, facts)!;
      assert.ok(view.answer, id);
      for (const h of view.hypotheses) {
        const hd = q.hypotheses[h.id]!;
        assert.ok(["established", "ruled_out"].includes(hypothesisStatus(hd, facts)) || hd.survivesAnswer, `${id}.${h.id}`);
      }
    }
  }
});

test("adverse: reverse discovery still reads coherently and never shows a stale first reading", () => {
  const forward = planCampaign("carrier").order;
  const reverse = storyOf([...forward].reverse());
  const view = notebook(reverse);
  const c05 = view.entries.find((e) => e.id === "C05")!;
  assert.equal(c05.reading, null, "the inward-tag guess is not presented as current");
  assert.equal(c05.firstRead, null, "nothing was seen before the facts that replaced it");
  assert.ok(c05.notes.some((n) => n.includes("still occupied")));
  const c01 = view.entries.find((e) => e.id === "C01")!;
  assert.equal(c01.firstRead, null);
  assert.ok(c01.notes[0]!.startsWith("Seven years deep"));
  for (const q of view.questions) if (q.id !== "Q5") assert.ok(q.answer, `${q.id} answered`);

  const ordered = notebook(storyOf(forward));
  assert.ok(ordered.entries.find((e) => e.id === "C05")!.firstRead, "in forward order the first guess is kept as history");
});

test("regression: a reading replaced before it was found never gains an invented first read", () => {
  const s = storyOf(["C08", "C05"]);
  const at = () => notebook(s).entries.find((e) => e.id === "C05")!;
  assert.equal(at().reading, null);
  assert.equal(at().firstRead, null);
  recordDiscovery(s, "C13", 3);
  assert.equal(at().reading, null);
  assert.equal(at().firstRead, null, "C05's first reading was never current");
});

test("regression: a later non-replacing note on the same axis does not restore a replaced reading", () => {
  const s = storyOf(["C04"]);
  const at = () => notebook(s).entries.find((e) => e.id === "C04")!;
  const first = at().reading;
  assert.ok(first);
  recordDiscovery(s, "C06", 2);
  assert.equal(at().reading, null);
  assert.equal(at().firstRead, first);
  recordDiscovery(s, "C11", 3);
  assert.equal(at().reading, null, "still replaced");
  assert.equal(at().firstRead, first, "history kept");
});

test("early late evidence: the service window first changes the question, not the earlier entries' facts", () => {
  const s = storyOf(["C01", "C13"]);
  const view = notebook(s);
  assert.equal(view.questions.find((q) => q.id === "Q2")!.answer?.startsWith("They went down"), true);
  assert.ok(view.resolution, "the final checklist opens immediately");
  recordDiscovery(s, "C05", 3);
  const c05 = notebook(s).entries.find((e) => e.id === "C05")!;
  assert.equal(c05.reading, null);
  assert.equal(c05.firstRead, null);
  assert.equal(notebook(s).questions.find((q) => q.id === "Q2")!.hypotheses.find((h) => h.id === "evacuated"), undefined,
    "a hypothesis that needs evidence the player lacks does not appear");
});

const REVEAL = [/\b191\b/, /asleep/i, /\bsleep/i, /\balive\b/i, /living occupants/i, /still occupied/i, /empty (slot|one)/i];
const revealing = (text: string) => REVEAL.filter((r) => r.test(text));

test("before the reveal the notebook never states it, in any physically possible order", () => {
  // Items that can only be found at or behind the reveal itself.
  const atReveal = new Set<DiscoveryId>(["C13", "district_controller"]);
  const possible = DISCOVERY_IDS.filter((id) => !atReveal.has(id) && !(STORY_SITES[siteOf(id)] as { afterGate?: true }).afterGate);
  const orders = [
    ...Array.from({ length: 40 }, (_, i) => shuffled(possible, 500 + i)),
    ...(["independent", "carrier"] as const).flatMap((s) => [planCampaign(s, { optional: true }).order]),
  ];
  for (const order of orders) {
    const s = createStory();
    for (const [i, id] of order.entries()) {
      recordDiscovery(s, id, i + 1);
      if (learned(s.discoveries).has("F17")) break;
      const view = notebook(s);
      assert.equal(view.resolution, null);
      assert.equal(view.questions.some((q) => q.id === "Q5"), false);
      const leak = revealing(JSON.stringify(view));
      assert.deepEqual(leak, [], `after ${order.slice(0, i + 1).join(",")}`);
    }
  }
});

test("optional journals add context only: questions, leads and entries are unchanged", () => {
  const core = planCampaign("independent").order;
  const journals = Object.keys(JOURNALS) as DiscoveryId[];
  for (let k = 1; k <= core.length; k++) {
    const without = storyOf(core.slice(0, k)), withJ = storyOf([...journals, ...core.slice(0, k)]);
    const a = notebook(without), b = notebook(withJ);
    assert.deepEqual(b.questions, a.questions);
    assert.deepEqual(b.leads, a.leads);
    assert.deepEqual(openLeads(withJ), openLeads(without));
    assert.deepEqual(canonical(b).entries, canonical(a).entries);
    assert.equal(b.journals.length, journals.length);
  }
});

test("journal context lists only facts the player already holds", () => {
  const s = storyOf(["C01", "ren_access_log"]);
  assert.deepEqual(notebook(s).journals[0]!.context, []);
  recordDiscovery(s, "C05", 3);
  assert.equal(notebook(s).journals[0]!.context.length, 1);
});

test("recording is idempotent and merged saves keep the earliest tick", () => {
  const s = storyOf(["C01", "C02"]);
  const again = recordDiscovery(s, "C02", 99);
  assert.equal(again.added, false);
  assert.equal(s.discoveries.length, 2);
  assert.deepEqual(mergeDiscoveries([{ id: "C02", tick: 9 }], [{ id: "C02", tick: 4 }, { id: "C01", tick: 1 }]),
    [{ id: "C01", tick: 1 }, { id: "C02", tick: 4 }]);
});
