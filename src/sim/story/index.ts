/** S5 public surface for the coordinator: state, rules and views. Content lives
 * in src/content/story/*; these modules never touch GameState directly. */
export { createStory, validStory } from "./state.js";
export type { Discovery, ResolutionState, StoryState, WorksState } from "./state.js";
export { blueprints, found, learned, mergeDiscoveries, openLeads, recordDiscovery } from "./knowledge.js";
export type { DiscoveryOutcome } from "./knowledge.js";
export { notebook } from "./notebook.js";
export type { EntryView, NotebookView, QuestionView } from "./notebook.js";
export { requestHint, nextWorksStep } from "./hints.js";
export type { Hint, HintContext } from "./hints.js";
export { advanceWorks, gateOpen, gatePanel, worksAction } from "./works.js";
export type { Assembly, WorksContext, WorksOutcome } from "./works.js";
export { beginResolution, canBegin, completeResolution, requirements, resolutionVisible } from "./resolution.js";
export { planCampaign, proposalModel, reachable } from "./reachability.js";
export type { Capabilities, CampaignModel, CampaignPlan, PlanOptions, Shelves } from "./reachability.js";
