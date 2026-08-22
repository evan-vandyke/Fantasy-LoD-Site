/* The countdown on the front page.
 *
 * The site is static and rebuilt on a schedule, so the only clock in the room that can be
 * right is the reader's. The build writes down the instant each event starts — a full ISO
 * timestamp with the offset already resolved from a zone name, so no browser has to work
 * out what Eastern was doing that particular week — and this file counts to it.
 *
 * It adds itself, on the same rule as the palette: the digits are hidden by CSS until
 * this runs, because four dashes above the word DAYS is worse than no clock at all. What
 * the server already rendered — the date, the time, and what happens at it — is the page
 * with scripting off, and unlike a number of days it never goes stale.
 *
 * Four states, and the card moves through them without a rebuild:
 *
 *   counting  — digits.
 *   soon      — inside twenty-four hours. Same digits, in the accent, and they perform:
 *               the colons blink and the seconds tick. `prefers-reduced-motion` stops
 *               the performance, not the counting.
 *   now       — started, and still inside the `runs_for` the event declared. The clock
 *               is replaced by HAPPENING NOW rather than counting past zero.
 *   retired   — over. The card removes itself, the next one is promoted to NEXT UP, and
 *               when the last one goes so does the whole block. The build applies the
 *               same rule, so nothing comes back on the next reload.
 *
 * Nothing here writes to storage, fetches anything, or outlives the tab.
 */
(function () {
  "use strict";

  var section = document.querySelector("[data-countdown]");
  if (!section) { return; }

  var UNITS = ["days", "hours", "minutes", "seconds"];
  var DAY = 86400000;

  var cards = [];
  var nodes = section.querySelectorAll("[data-when]");
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var at = Date.parse(node.getAttribute("data-when"));
    /* A date the browser cannot read is left exactly as the server sent it: the printed
       time is still correct, and a card showing NaN days would not be. */
    if (isNaN(at)) { continue; }

    var card = {
      node: node,
      at: at,
      /* How long the thing lasts, from `events.yml`. The card reads HAPPENING NOW for
         exactly this long, so a two-hour town hall and a five-hour draft do not retire
         at the same arbitrary moment. */
      runs: (parseInt(node.getAttribute("data-runs-minutes"), 10) || 0) * 60000,
      clock: node.querySelector(".countdown-clock"),
      now: node.querySelector(".countdown-now"),
      rank: node.querySelector(".countdown-rank"),
      cells: {}
    };
    for (var u = 0; u < UNITS.length; u++) {
      card.cells[UNITS[u]] = node.querySelector('[data-unit="' + UNITS[u] + '"]');
    }
    cards.push(card);
    yourTime(card);
  }
  if (!cards.length) { return; }

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  /* What the reader's own clock says, but only when it disagrees with the printed one.
     Under "6:00 PM EDT", the line "6:00 PM your time" tells a Virginian nothing; two
     time zones west it is the whole point. Compared by UTC offset rather than by
     formatted text, so it does not depend on how a locale spells anything. */
  function yourTime(card) {
    var line = card.node.querySelector(".countdown-yours");
    if (!line) { return; }

    var stamp = card.node.getAttribute("data-when");
    var match = /([+-])(\d\d):(\d\d)$/.exec(stamp);
    var printed = match
      ? (match[1] === "-" ? -1 : 1) * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10))
      : (/[Zz]$/.test(stamp) ? 0 : null);
    if (printed === null) { return; }

    var here = -new Date(card.at).getTimezoneOffset();
    if (here === printed) { return; }

    try {
      line.textContent = "That is " + new Date(card.at).toLocaleString(undefined, {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit"
      }) + " where you are.";
      line.hidden = false;
    } catch (e) { /* an engine without Intl keeps the Eastern line and nothing else */ }
  }

  /* NEXT UP belongs to the soonest card still standing, which is not always the one the
     build gave it to: after the town hall retires on Friday, the draft is next. Rewritten
     rather than restyled, because the word is the label, not the colour. */
  function promote(first) {
    for (var i = 0; i < cards.length; i++) {
      var isNext = cards[i] === first;
      cards[i].node.classList.toggle("is-next", isNext);
      if (cards[i].rank) { cards[i].rank.textContent = isNext ? "Next up" : "Then"; }
    }
  }

  /* Returns whether any card is still worth showing, which is what decides if there is
     any reason to run again. */
  function tick() {
    var now = Date.now();
    var first = null;

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var left = card.at - now;

      /* Over. The build applies the same rule against its own clock, so the card does
         not come back on the next reload. */
      if (left <= -card.runs) {
        card.node.hidden = true;
        continue;
      }
      if (!first) { first = card; }

      if (left <= 0) {
        card.node.classList.remove("is-soon");
        if (card.clock) { card.clock.classList.remove("is-live"); }
        if (card.now) { card.now.classList.add("is-live"); }
        continue;
      }

      var seconds = Math.floor(left / 1000);
      var parts = {
        days: Math.floor(seconds / 86400),
        hours: pad(Math.floor(seconds / 3600) % 24),
        minutes: pad(Math.floor(seconds / 60) % 60),
        seconds: pad(seconds % 60)
      };
      for (var u = 0; u < UNITS.length; u++) {
        var cell = card.cells[UNITS[u]];
        if (cell) { cell.textContent = parts[UNITS[u]]; }
      }
      card.node.classList.toggle("is-soon", left < DAY);
      if (card.clock) { card.clock.classList.add("is-live"); }
    }

    /* Nothing left to count to. The heading and its explanation would be a label over an
       empty space, so the whole block goes rather than just its contents. */
    if (!first) {
      section.hidden = true;
      return false;
    }
    promote(first);
    return true;
  }

  /* Checked before the interval is set as well as inside it: a page opened the morning
     after the draft has nothing to count and should not wake up every second to say so. */
  if (tick()) {
    var timer = setInterval(function () {
      if (!tick()) { clearInterval(timer); }
    }, 1000);
  }
})();
