// The front page, catching up with itself.
//
// Two jobs on this page, and they are both about a number being older than it looks.
//
// The first is the stamp. The page says when its scores were pulled, in Eastern time,
// spelled out in the markup — that is the honest form and it is what a reader gets with
// scripting off. What it is not is quick to read: "Sun 12 Oct, 4:20pm ET" makes you look
// at a clock before you know whether to trust the number beside it. So it becomes
// "22 minutes ago". A static page cannot compute that at build without being wrong a
// minute later, which is why the absolute time ships and this improves on it.
//
// The second is the scores. A full site build checks out 243 MB and rebuilds the whole
// database, so it cannot run every twenty minutes on a Sunday. Instead the snapshot job —
// which already runs at that cadence — writes `live.json` beside the page, and this
// applies it.
//
// **This script does no arithmetic.** Every number in `live.json` is finished:
// `fantasy.livefeed` computes them with `metrics.live.progress`, the same function the
// page itself was built from. That was a deliberate design move rather than an
// accident — see `docs/plans/live-week.md` §6.3. The risk named there was two
// implementations of one formula drifting apart with no compiler to notice; the answer
// was to stop having two. What is left here is finding the right node and writing text
// into it, plus looking up a manager's name the page already knows.
//
// It degrades to nothing. No fetch, a 404, a malformed file, a file about a different
// week — in every case the page keeps what the build gave it, which is complete and
// correct and merely older. Nothing here is required for the page to be right.

(function () {
  "use strict";

  var MINUTE = 60;
  var HOUR = 60 * MINUTE;
  var DAY = 24 * HOUR;

  // Bumped by `livefeed.FORMAT` when the shape changes. A deployed page and the file
  // beside it are written by different jobs minutes apart, so there is no moment when
  // they agree by construction — the page checks rather than assumes.
  var FORMAT = 1;

  // ------------------------------------------------------------------ the stamp

  function plural(value, unit) {
    return value + " " + unit + (value === 1 ? "" : "s") + " ago";
  }

  function phrase(seconds) {
    // Clock skew, or a page opened in the same minute it was built. Neither is worth a
    // negative number on the page.
    if (seconds < 45) { return "just now"; }
    if (seconds < HOUR) { return plural(Math.round(seconds / MINUTE), "minute"); }
    if (seconds < DAY) { return plural(Math.round(seconds / HOUR), "hour"); }
    // Past a day the absolute date is the more useful answer, so leave it alone.
    return null;
  }

  function ageStamps() {
    var nodes = document.querySelectorAll("time[data-relative][datetime]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var when = Date.parse(node.getAttribute("datetime"));
      if (isNaN(when)) { continue; }

      // Kept so a second run reads the original rather than its own output, and so the
      // exact time is still there on hover.
      if (!node.hasAttribute("data-absolute")) {
        node.setAttribute("data-absolute", node.textContent.trim());
        node.setAttribute("title", node.textContent.trim());
      }

      var said = phrase((Date.now() - when) / 1000);
      node.textContent = said === null ? node.getAttribute("data-absolute") : said;
    }
  }

  // ------------------------------------------------------------------ the scores

  // Matches the `pts` filter in `publish/site.py`: always two decimals. Fantasy scores
  // are decimal by nature and a score rounded to an integer reads as a different number
  // to anyone checking. No thousands separator, because the filter's only differs above
  // 1000 and no fantasy score gets there.
  function pts(value) {
    return value === null || value === undefined ? "–" : Number(value).toFixed(2);
  }

  // A seam for the test suite, and nothing else. Node has no `document`, so everything
  // below this line would throw there — the helpers above it are the ones with rules in
  // them worth checking against Python, and `test_livefeed.py` runs them through node to
  // prove `pts` formats exactly as the `pts` Jinja filter does.
  if (typeof document === "undefined") {
    if (typeof module !== "undefined") { module.exports = { pts: pts, phrase: phrase }; }
    return;
  }

  function set(root, key, text) {
    var node = root.querySelector('[data-live="' + key + '"]');
    if (node) { node.textContent = text; }
    return node;
  }

  function flag(state) {
    if (state === "pre") { return ['<span class="week-flag">to play</span>', true]; }
    if (state === "in") { return ['<span class="week-flag on">on now</span>', false]; }
    if (state === "bye") { return ['<span class="week-flag">bye</span>', false]; }
    return ["", false];
  }

  function applyMatchup(card, matchup) {
    var names = {
      home: card.getAttribute("data-home-name"),
      away: card.getAttribute("data-away-name")
    };

    ["home", "away"].forEach(function (which) {
      var side = matchup[which];
      if (!side) { return; }
      set(card, which + ".score", pts(side.score));
      set(card, which + ".finish", pts(side.finish));
      set(card, which + ".left", String(side.left));

      // The accent follows the lead, which is the one thing on the card a reader takes
      // in without reading it.
      var node = card.querySelector('[data-side="' + which + '"]');
      if (node) { node.classList.toggle("ahead", matchup.leader === which); }
    });

    var left = (matchup.home.left || 0) + (matchup.away.left || 0);
    var tail = left
      ? " · " + left + " starter" + (left === 1 ? "" : "s") + " to come"
      : " · everyone has played";
    var head = matchup.leader === null
      ? "level"
      : names[matchup.leader] + " by " + pts(matchup.margin);
    set(card, "margin", head + tail);
  }

  function applyPlayers(rows) {
    // One pass over the rows rather than a query per player: twelve rosters is about two
    // hundred nodes, and two hundred selector calls on a phone is a visible pause.
    var byId = {};
    for (var i = 0; i < rows.length; i++) {
      byId[rows[i].team_key + "/" + rows[i].player_id] = rows[i];
    }

    var cards = document.querySelectorAll(".week-game");
    for (var c = 0; c < cards.length; c++) {
      var keys = [cards[c].getAttribute("data-home"), cards[c].getAttribute("data-away")];
      var tables = cards[c].querySelectorAll(".week-roster");
      for (var t = 0; t < tables.length && t < keys.length; t++) {
        var trs = tables[t].querySelectorAll("tr[data-player]");
        for (var r = 0; r < trs.length; r++) {
          var row = byId[keys[t] + "/" + trs[r].getAttribute("data-player")];
          if (!row) { continue; }

          var parts = flag(row.game_state);
          var waiting = parts[1];
          var points = trs[r].querySelector('[data-live="player.points"]');
          if (points) {
            points.innerHTML = waiting
              ? '<span class="dim">–</span>'
              : pts(row.points);
          }
          var mark = trs[r].querySelector('[data-live="player.flag"]');
          if (mark) { mark.innerHTML = parts[0]; }
          trs[r].classList.toggle("waiting", waiting);
        }
      }
    }
  }

  function applySummary(summary, cards) {
    if (!summary || !summary.high) { return; }
    var doc = document;

    set(doc, "high.score", pts(summary.high.score));
    var name = nameFor(cards, summary.high.team_key);
    if (name) { set(doc, "high.name", name); }

    var closest = summary.closest;
    if (closest) {
      set(doc, "closest.margin", pts(closest.projected_margin));
      var leader = closest.leader === null
        ? nameFor(cards, closest.home) + " and " + nameFor(cards, closest.away) + " level"
        : nameFor(cards, closest.leader === "home" ? closest.home : closest.away) + " ahead";
      set(doc, "closest.note", "projected · " + leader);
    }

    if (summary.left_to_play !== undefined) {
      var on = summary.in_play;
      set(
        doc,
        "progress",
        on + " starter" + (on === 1 ? "" : "s") + " on the field, " +
          summary.left_to_play + " still to come."
      );
    }
  }

  function nameFor(cards, teamKey) {
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute("data-home") === teamKey) {
        return cards[i].getAttribute("data-home-name");
      }
      if (cards[i].getAttribute("data-away") === teamKey) {
        return cards[i].getAttribute("data-away-name");
      }
    }
    return null;
  }

  // Cards are built closest-projected-game first, and a refresh can change which that
  // is. Moving them is a DOM operation, not a decision — the order comes straight from
  // the order the file lists them in.
  function reorder(container, matchups, index) {
    var ordered = matchups.slice().sort(function (a, b) {
      return a.projected_margin - b.projected_margin;
    });
    for (var i = 0; i < ordered.length; i++) {
      var card = index[ordered[i].home.team_key];
      if (card) { container.appendChild(card); }
    }
  }

  function refresh(feed) {
    var head = document.querySelector("[data-live-year]");
    if (!head || !feed || feed.format !== FORMAT) { return; }

    // The check that makes a stale file harmless. After a deploy the page and the file
    // are written by different jobs minutes apart, and a file still describing week 5
    // applied to a page rendering week 6 would overwrite this week with last week.
    if (
      String(feed.year) !== head.getAttribute("data-live-year") ||
      String(feed.week) !== head.getAttribute("data-live-week")
    ) {
      return;
    }

    var container = document.querySelector(".week-games");
    var cards = document.querySelectorAll(".week-game");
    var index = {};
    for (var i = 0; i < cards.length; i++) {
      index[cards[i].getAttribute("data-home")] = cards[i];
    }

    for (var m = 0; m < feed.matchups.length; m++) {
      var card = index[feed.matchups[m].home.team_key];
      if (card) { applyMatchup(card, feed.matchups[m]); }
    }
    applyPlayers(feed.players || []);
    applySummary(feed.summary, cards);
    if (container) { reorder(container, feed.matchups, index); }

    // Last, so the page never claims to be fresher than the numbers on it.
    var stamp = document.querySelector("time[data-relative]");
    if (stamp && feed.captured_at) {
      stamp.setAttribute("datetime", feed.captured_at);
      stamp.removeAttribute("data-absolute");
      ageStamps();
    }
  }

  function pull() {
    // Only in season. Out of season the root is the all-time table, it carries no
    // subject to check a file against, and there is nothing to refresh.
    //
    // Every in-season state asks, including `preview`. A page built before the first
    // kickoff is exactly the page most likely to be looked at after it, and the year and
    // week check below is what makes applying a file safe — not the state it was built
    // in. Anchors the preview markup does not have are simply not found.
    if (!document.querySelector("[data-live-year]")) { return; }

    // Cache-busted, because a static host will happily serve a twenty-minute-old copy of
    // a file whose whole purpose is being newer than that.
    fetch("live.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (feed) {
        if (feed) { refresh(feed); }
      })
      .catch(function () {
        // Offline, blocked, or no such file. The page is already correct and merely
        // older, and saying so would alarm somebody whose phone dropped a bar.
      });
  }

  ageStamps();
  pull();

  // A phone that has had this tab open in the background since kickoff restores it from
  // the back/forward cache without reloading. Without this the page would insist it was
  // four minutes old three hours later.
  window.addEventListener("pageshow", function () {
    ageStamps();
    pull();
  });
})();
