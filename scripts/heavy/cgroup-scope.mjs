// STEW-2's cgroup membership predicates (scripts/cgroup-scope.mjs), for the
// queue's own nested and GPU checks (SCHED-3 R5): whole path components, never
// a substring. install.sh puts the real file here in each installed version.
export * from "../cgroup-scope.mjs";
