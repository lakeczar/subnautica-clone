import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { REGIONS } from "../src/content/registry.js";
import {
  DISCOVERY_IDS, EVIDENCE_META, isOptional, JOURNALS, RECORDS, siteOf, STORY_EVIDENCE,
} from "../src/content/story/evidence.js";
import type { DiscoveryId, Medium, StoryEvidenceId } from "../src/content/story/evidence.js";
import { FACT_IDS, FACTS } from "../src/content/story/facts.js";
import type { FactId } from "../src/content/story/facts.js";
import { LEAD_IDS, LEADS } from "../src/content/story/leads.js";
import { QUESTIONS, REREADS } from "../src/content/story/questions.js";
import type { QuestionDefinition } from "../src/content/story/questions.js";
import { PLACEMENTS, STORY_SITES } from "../src/content/story/sites.js";
import type { StorySite } from "../src/content/story/sites.js";
import { CAMPAIGN_STEPS } from "../src/content/story/strategies.js";
import { RESOLUTION_REQUIREMENTS, RESOLUTION_ROSTER, WORKS_HINTS } from "../src/content/story/works.js";

const mediaOf = (id: DiscoveryId): readonly Medium[] =>
  Object.hasOwn(EVIDENCE_META, id) ? EVIDENCE_META[id as StoryEvidenceId].media
    : Object.hasOwn(RECORDS, id) ? RECORDS[id as keyof typeof RECORDS].media : [];
const tierOf = (id: DiscoveryId): number =>
  Object.hasOwn(EVIDENCE_META, id) ? EVIDENCE_META[id as StoryEvidenceId].tier
    : Object.hasOwn(RECORDS, id) ? RECORDS[id as keyof typeof RECORDS].tier : 9;
const site = (id: DiscoveryId): StorySite => STORY_SITES[siteOf(id)];

test("every critical fact has two or more non-optional sources", () => {
  for (const f of FACT_IDS) {
    const def = FACTS[f];
    assert.ok(def.sources.length > 0, f);
    if (def.critical) assert.ok(def.sources.filter((s) => !isOptional(s)).length >= 2, `${f} needs an alternate source`);
  }
});

test("the central reveal is foreshadowed by three independent earlier clues in more than one medium", () => {
  const supported = QUESTIONS.Q2.hypotheses.inward.supported.map((c) => c[0] as FactId);
  const sources = supported.map((f) => FACTS[f].sources.find((s) => tierOf(s) <= 2)!);
  assert.equal(new Set(sources).size, 3, sources.join(","));
  assert.ok(new Set(sources.flatMap(mediaOf)).size >= 2);
  assert.ok(sources.every((s) => !isOptional(s)));
});

test("the protagonist's act is established by witness, physical and command evidence before the full context", () => {
  const witness = FACTS.F06.sources[0]!, physical = FACTS.F11.sources[0]!, command = FACTS.F12.sources[0]!;
  assert.ok(mediaOf(witness).includes("witness"));
  assert.ok(mediaOf(physical).includes("physical"));
  assert.ok(mediaOf(command).includes("voice"));
  assert.equal(new Set([witness, physical, command]).size, 3);
  for (const s of [witness, physical, command]) assert.ok(tierOf(s) <= 2);
  assert.ok(FACTS.F16.sources.every((s) => tierOf(s) === 3), "the full context is resolution-tier");
});

test("the pod's direction of arrival is foreshadowed physically before it is explained", () => {
  assert.ok(mediaOf(FACTS.F01.sources[0]!).includes("physical"));
  assert.ok(FACTS.F08.sources.some((s) => tierOf(s) === 2 && mediaOf(s).includes("physical")));
});

test("leads are well formed, never depend on optional items, and cover the chain", () => {
  const targeted = new Set<DiscoveryId>(), offering = new Map<DiscoveryId, Set<DiscoveryId>>();
  for (const id of LEAD_IDS) {
    const l = LEADS[id];
    for (const x of [...l.offeredBy, ...l.targets]) assert.ok(DISCOVERY_IDS.includes(x), `${id} → ${x}`);
    assert.ok(l.offeredBy.every((o) => !isOptional(o)), `${id} offered by an optional item`);
    assert.ok(l.targets.every((t) => !isOptional(t)), `${id} leads to an optional item`);
    for (const t of l.targets) {
      assert.equal(siteOf(t), l.site, `${id} target ${t} sits at the lead's site`);
      targeted.add(t);
      for (const o of l.offeredBy) (offering.get(t) ?? offering.set(t, new Set()).get(t)!).add(o);
    }
    assert.equal(STORY_SITES[l.site].region, l.region, id);
  }
  // C01 is the opening; the inner hall roster lies behind the opened gate.
  for (const id of DISCOVERY_IDS)
    if (!isOptional(id) && id !== "C01" && id !== "inner_roster") assert.ok(targeted.has(id), `no lead points to ${id}`);
  // Alternate routes into the chain: each target is offered by two or more finds.
  const singleSourced = new Set<DiscoveryId>(["C02", "C14"]);
  for (const [target, from] of offering)
    if (!singleSourced.has(target)) assert.ok(from.size >= 2, `${target} is offered only by ${[...from].join(",")}`);
});

test("answered questions are visible and rereads reference real facts", () => {
  for (const [qid, q] of Object.entries(QUESTIONS) as [string, QuestionDefinition][])
    if (q.answer) assert.ok(q.appears.some((c) => c.every((f) => q.answer!.when.includes(f))), `${qid} visible when answered`);
  for (const [id, rereads] of Object.entries(REREADS)) {
    assert.ok(DISCOVERY_IDS.includes(id as DiscoveryId), id);
    for (const r of rereads) for (const f of r.when) assert.ok(FACT_IDS.includes(f), `${id} ${f}`);
  }
});

test("every story site is placed in its region's depth envelope and every item has a site", () => {
  for (const [id, s] of Object.entries(STORY_SITES) as [string, StorySite][]) {
    const [top, bottom] = REGIONS[s.region].depth;
    if (s.exit === null && s.depth === 0) continue; // land
    assert.ok(s.depth >= Math.max(0, top) && s.depth <= bottom, `${id} at ${s.depth} m outside ${s.region}`);
    if (s.exit !== null) assert.ok(s.exit >= 0 && s.exit <= bottom, id);
  }
  for (const id of DISCOVERY_IDS) {
    const meta = Object.hasOwn(EVIDENCE_META, id) ? EVIDENCE_META[id as StoryEvidenceId]
      : Object.hasOwn(RECORDS, id) ? RECORDS[id as keyof typeof RECORDS] : JOURNALS[id as keyof typeof JOURNALS];
    assert.equal(site(id).region, meta.region, id);
  }
  const placed = Object.values(PLACEMENTS).flatMap((ps) => ps!.flatMap((p) => p.holds));
  assert.deepEqual([...placed].sort(), [...DISCOVERY_IDS].sort());
});

// Words that would disclose the resolution if shown before it, or in an ID or file name.
const NEUTRAL = /sleep|surviv|alive|suspen|reviv|wak(e|ing)|living|\bbeds?\b|cryo|stasis/i;
const REVEAL_PHRASE = /\b191\b|asleep|\balive\b|living occupants|still occupied|empty (slot|one)/i;

test("IDs and file names stay neutral", () => {
  const ids = [
    ...DISCOVERY_IDS, ...Object.keys(STORY_SITES), ...LEAD_IDS, ...FACT_IDS, ...Object.keys(QUESTIONS),
    ...Object.values(QUESTIONS).flatMap((q) => Object.keys(q.hypotheses)), ...Object.keys(CAMPAIGN_STEPS),
    ...Object.keys(RESOLUTION_REQUIREMENTS), ...Object.keys(RESOLUTION_ROSTER), ...Object.keys(WORKS_HINTS),
    ...readdirSync("src/content/story"), ...readdirSync("src/sim/story"),
    ...readdirSync("tests").filter((f) => f.startsWith("story-")),
  ];
  for (const id of ids) assert.doesNotMatch(id, NEUTRAL, id);
});

test("labels shown before inspection are neutral, except behind the opened gate", () => {
  for (const id of DISCOVERY_IDS) {
    if (site(id).afterGate) continue;
    const label = Object.hasOwn(STORY_EVIDENCE, id) ? STORY_EVIDENCE[id as keyof typeof STORY_EVIDENCE].label
      : Object.hasOwn(RECORDS, id) ? RECORDS[id as keyof typeof RECORDS].label
        : Object.hasOwn(JOURNALS, id) ? JOURNALS[id as keyof typeof JOURNALS].label : "";
    assert.doesNotMatch(label, NEUTRAL, id);
  }
  for (const q of ["Q1", "Q2", "Q3", "Q4"] as const) assert.doesNotMatch(QUESTIONS[q].title, NEUTRAL);
});

test("lead text, hints and pre-reveal works hints never state the resolution", () => {
  for (const id of LEAD_IDS)
    for (const t of [LEADS[id].text, ...LEADS[id].hints]) assert.doesNotMatch(t, REVEAL_PHRASE, id);
  for (const step of ["w_power", "w_air", "w_isolate", "w_equalize", "w_wait", "w_open"] as const) {
    const h = WORKS_HINTS[step];
    for (const t of [...h.tiers, ...("plans" in h ? [h.plans] : [])]) {
      assert.doesNotMatch(t, REVEAL_PHRASE, step);
      assert.doesNotMatch(t, NEUTRAL, step);
    }
  }
});
