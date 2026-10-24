// The team pages' script (written by hand; the pages come from scripts/team-pages/build.mjs).
// - The cookie question, the same as the game's: nothing is measured before "Allow analytics" (same storage key).
// - Google Analytics events: team_page_view / team_page_click on the team page, start_page_view / start_page_click
//   on its start page. Only the game's own ids: state, school, scenario and the test version.
// - Test 1: half the visitors see the start page after the button, half go straight to New Game. The version is
//   picked on the first visit and kept in this browser; ?flow=page or ?flow=direct shows one on purpose.
// On localhost nothing is sent: events go to the console as [analytics], like the game's dev server.
(function () {
  var GA_ID = 'G-FE5ZDP3K2T';
  var CONSENT = 'fc.cookieConsent';
  var FLOW = 'fc.teamPageFlow';
  var page = document.body.dataset;
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage blocked: asked again next visit */ }
  }

  var asked = new URLSearchParams(location.search).get('flow');
  var flow = asked === 'page' || asked === 'direct' ? asked : read(FLOW);
  if (flow !== 'page' && flow !== 'direct') {
    flow = Math.random() < 0.5 ? 'page' : 'direct';
    write(FLOW, flow);
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  var loaded = false;
  function loadAnalytics() {
    if (loaded || local) return;
    loaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA_ID);
  }
  function send(name) {
    var params = { state: page.state, school: page.school, scenario: page.scenario, flow: flow, transport_type: 'beacon' };
    if (local) return console.debug('[analytics]', name, params);
    if (read(CONSENT) !== 'analytics') return;
    loadAnalytics();
    gtag('event', name, params);
  }

  var start = page.page === 'start';
  send(start ? 'start_page_view' : 'team_page_view');

  // The button: on the team page it opens the start page or New Game (the test); on the start page, New Game
  var button = document.getElementById('go');
  if (button) {
    if (!start && flow === 'direct') button.href = page.game + '&v=direct';
    if (start) button.href = page.game + '&v=page';
    button.addEventListener('click', function () {
      send(start ? 'start_page_click' : 'team_page_click');
    });
  }

  if (read(CONSENT) === null) {
    var banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookies');
    banner.innerHTML =
      '<b>Cookies</b><p>We use one cookie to keep you signed in. With your OK we also use Google Analytics to see how the game is played. ' +
      '<a href="/privacy" target="_blank" rel="noopener">Cookie details</a></p>' +
      '<div><button type="button" data-choice="necessary">Only necessary</button><button type="button" class="allow" data-choice="analytics">Allow analytics</button></div>';
    banner.addEventListener('click', function (e) {
      var choice = e.target.getAttribute && e.target.getAttribute('data-choice');
      if (!choice) return;
      write(CONSENT, choice);
      banner.remove();
      // The page view happened before the answer: count it now
      if (choice === 'analytics') send(start ? 'start_page_view' : 'team_page_view');
    });
    document.body.appendChild(banner);
  }
})();
