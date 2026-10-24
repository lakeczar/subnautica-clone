// Whether a process is inside a heavy-check job's scope (STEW-2 R1-F4), judged on
// complete cgroup path components: the scope itself, or a cgroup below it. A name
// that merely starts with the scope's name (`<unit>.scope-other.scope`) is a
// different scope, not membership. One predicate for every caller; SCHED's nested
// and GPU checks are to adopt it (SCHED-3 follow-up).
import { readFileSync } from "node:fs";

/** This process's cgroup v2 path (`/user.slice/...`), from the text of /proc/<pid>/cgroup; null if none. */
export function cgroupPathOf(procCgroupText) {
  const line = String(procCgroupText ?? "").split("\n").find((l) => l.startsWith("0::"));
  return line ? line.slice(3).trim() || "/" : null;
}

/** This process's own cgroup path, or null (not Linux, no cgroup v2). */
export function ownCgroupPath(pid = "self") {
  try { return cgroupPathOf(readFileSync(`/proc/${pid}/cgroup`, "utf8")); } catch { return null; }
}

/** Whether `path` is the cgroup `scopePath` or below it. Both are cgroup paths
 * (`/user.slice/...`); a leading /sys/fs/cgroup is ignored, as are trailing slashes. */
export function withinCgroup(path, scopePath) {
  const norm = (p) => String(p ?? "").replace(/^\/sys\/fs\/cgroup(?=\/)/, "").replace(/\/+$/, "");
  const p = norm(path), s = norm(scopePath);
  if (!p || !s || !s.startsWith("/")) return false;
  return p === s || p.startsWith(`${s}/`);
}

/** Whether some complete component of `path` is the scope unit `<unit>.scope` (when its full path isn't known). */
export function hasScopeComponent(path, unit) {
  if (!path || !unit) return false;
  return String(path).split("/").includes(`${unit}.scope`);
}

/** Whether some complete component of `path` matches `re` (anchored by the caller, e.g. /^siltwake-heavy-.+\.scope$/). */
export function hasComponentMatching(path, re) {
  return Boolean(path) && String(path).split("/").some((c) => re.test(c));
}
