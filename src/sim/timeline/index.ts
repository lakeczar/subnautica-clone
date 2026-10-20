/** SYS-2 play timeline and feedback key: local only, never in the save, never sent. */
export { addNote, createRecorder, exportTimeline, exportTimelineText, observe, recordEvent, recordSystemsEvents, resumeRecorder,
  TIMELINE_STORAGE_KEY } from "./recorder.js";
export type { ObserveContext, RecorderOptions, TimelineRecorder } from "./recorder.js";
export { analyseTimeline, DEFAULT_THRESHOLDS, formatTimelineReport, parseTimeline, serializeTimeline } from "./report.js";
export type { TimelineAnalysis, TimelineEvent, TimelineExport } from "./report.js";
