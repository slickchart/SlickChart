// THE build stamp, in one place.
//
// Three fixes in a row landed on main while both of a provider's devices kept running an older
// build, and nothing in the app could tell us that — so each fix looked like it had failed and the
// next one was aimed at the wrong thing. A day went into that.
//
// slickchart.html carries the same string in its own APP_BUILD const (it is a standalone file and
// cannot import). scripts/check-build-stamp.cjs fails the build if the two ever drift apart.
export const APP_BUILD = '2026-09-19t';
