const ROUTES = new Set(["home", "grade", "insights", "similarity", "dashboard", "calibration", "activity", "export", "settings"]);
const TITLES = { home: "Home", grade: "Grading", insights: "Class insights", similarity: "Similarity review", dashboard: "Dashboard", calibration: "Calibration", activity: "Activity", export: "Export and backup", settings: "Settings" };
function routeFromHash() {
  const path = location.hash.replace(/^#\/?/, "").split("/")[0] || "home";
  return ROUTES.has(path) ? path : "home";
}
function sync() {
  const view = routeFromHash();
  document.title = `TalkGrade — ${TITLES[view]}`;
  window.dispatchEvent(new CustomEvent("talkgrade:navigate", { detail: { view } }));
  requestAnimationFrame(() => {
    const target = document.querySelector(`#${view}-view h2, #work h1, #work h2`);
    if (target) { target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }
  });
}
function navigate(view) {
  const next = ROUTES.has(view) ? view : "home";
  const hash = next === "home" ? "#/" : `#/${next}`;
  if (location.hash === hash) sync();
  else location.hash = hash;
}
window.TG_router = { navigate, sync, current: routeFromHash };
window.addEventListener("hashchange", sync);
