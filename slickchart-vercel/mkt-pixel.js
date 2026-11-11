/* Meta Pixel for the MARKETING pages only (homepage, /build, /build-any-business, /free).
 *
 * Why: so a Facebook/Instagram ad can tell which clicks became a checklist email or a sign-up,
 * and Meta can learn who to show it to. Ashley's ad plan, 2026-11-10.
 *
 * NEVER include this file in the provider app (slickchart.html), the client pages (/space, /c,
 * client-page.js) or anything that shows client notes, photos or health information. Those pages
 * hold PII and health data, and Meta's rules forbid sending it. The path guard below is a second
 * line of defence, not the first: the first is that only marketing pages have the script tag.
 *
 * Off until PIXEL_ID is filled in (Meta Events Manager -> Data sources -> the 15-16 digit id).
 * Respects the browser's Global Privacy Control signal (California opt-out of sharing).
 *
 * Pages call window.scTrack('Lead') etc.; it is a safe no-op while the Pixel is off.
 */
(function () {
  var PIXEL_ID = '';

  window.scTrack = function (ev, params) {
    try { if (typeof window.fbq === 'function') window.fbq('track', ev, params || {}); } catch (e) {}
  };

  if (!/^\d{10,20}$/.test(PIXEL_ID)) return;
  try { if (navigator.globalPrivacyControl === true) return; } catch (e) {}
  var p = location.pathname || '/';
  var MARKETING = /^\/(?:index(?:\.html)?|build(?:\.html)?|build-any-business(?:\.html)?|free(?:\.html)?)?\/?$/;
  if (!MARKETING.test(p)) return;

  /* Meta's standard base code. */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
    n.queue = []; t = b.createElement(e); t.async = !0;
    t.src = v; s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');
})();
