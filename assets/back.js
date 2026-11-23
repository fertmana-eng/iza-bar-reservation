// The phone's back button goes back one step inside the page instead of leaving the app
// (owner, Nov 2026). Each page says how many steps deep its screen is now (levels(): 0 is
// the main screen) and what one back press does (stepBack()). The page calls the returned
// sync() after every change of screen, and the history is kept at that depth: an entry
// is added when a screen opens (always after a tap: Chrome skips entries added without
// one) and removed when it closes by a button, so back never lands on a stale step.
// On the main screen, back leaves the app as usual.
function backSteps(levels, stepBack) {
  let depth = 0, ignore = 0;
  function sync() {
    const want = levels();
    while (depth < want) { history.pushState({ step: depth + 1 }, ''); depth++; }
    if (depth > want) { ignore++; history.go(want - depth); depth = want; }
  }
  addEventListener('popstate', () => {
    if (ignore) { ignore--; return; }   // our own going back after a button closed a screen
    depth = Math.max(0, depth - 1);     // the phone's back button
    stepBack();
    sync();
  });
  return sync;
}
