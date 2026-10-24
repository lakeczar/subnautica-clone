/** SYS-2 public surface for the coordinator: bases and knowledge rules, state and
 * views. Content lives in src/content/systems/*. See docs/build/streams/SYS-2.md. */
export { createSystems, validSystems } from "./state.js";
export type { BeaconState, DecodeJob, OutpostState, PackedKit, PlanterState, PowerSource, SocketEntry, SystemsState } from "./state.js";
export { accessible, carrierHost, carrierHostId, carrierOccupants, forgetRemembered, hostById, hostLocal, hostServices, installModule, listHosts,
  locationPower, removeModule, workContainers } from "./hosts.js";
export type { HostKind, HostPower, SocketHost, SocketSlot } from "./hosts.js";
export { conservedTotals, deployOutpost, deployPreview, outpostLimit, packOutpost, packPreview, renameOutpost, siteProblem, sitePower,
  upgradeOutpost, upgradePreview } from "./outposts.js";
export type { DeployPreview, Ground, OutpostRules, OutpostSiteQuery, PackPreview, SiteSample, UpgradePreview } from "./outposts.js";
export { advanceDecodes, decodedReveals, decodeStatus, decodeViews, discoverSite, doorCodes, knownSites, markedSites, recordReadable, startDecode } from "./decoder.js";
export { noteHostPosition, noteReadable, readableNotes } from "./notes.js";
export type { DecodeCompletion, DecoderContext, DecodeView } from "./decoder.js";
export { advanceGrowth, cropViews, harvest, harvestPreview, plant } from "./cultivation.js";
export { handheldPing, knownMaterials, stationSurvey, surveyQuery, surveyRange } from "./survey.js";
export type { SurveyMark } from "./survey.js";
export { beaconViews, chartView, collectBeacon, placeBeacon, renameBeacon, setBeaconOn, setCategoryOn, visitChart } from "./navigation.js";
export type { BeaconView, ChartView } from "./navigation.js";
export { buildJournal, searchJournal } from "./journal.js";
export type { CreatureEntry, CycleEntry, FieldJournal, JournalEntry, JournalTab } from "./journal.js";
export { advanceSystems } from "./step.js";
export type { SystemsEvent } from "./step.js";
export { incapacitateKeepingInstances, instanceProblems, retainsIdentity } from "./instances.js";
