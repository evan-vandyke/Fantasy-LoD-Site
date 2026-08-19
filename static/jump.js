/* The jump-to palette.
 *
 * One field over every destination on the site: managers, seasons, the record book, and
 * the pages themselves. The list arrives as JSON in the page — `publish.search` builds
 * it — so there is nothing to fetch, nothing to index, and no state that outlives the
 * dialog being closed.
 *
 * It adds itself. The button in the rail and the dialog are both hidden by CSS until
 * this file runs and marks the page, because a palette that cannot open is worse than
 * no palette, and every destination in the index is also a link somewhere in the rail
 * or on a page the rail reaches. Nothing here is load-bearing for reading the site.
 */
(function () {
  "use strict";

  var data = document.getElementById("jump-index");
  var dialog = document.getElementById("jump");
  var input = document.getElementById("jump-input");
  var results = document.getElementById("jump-results");
  if (!data || !dialog || !input || !results) { return; }

  var entries;
  try {
    entries = JSON.parse(data.textContent);
  } catch (e) {
    return;
  }
  if (!entries || !entries.length) { return; }

  // Pages sit at two different depths, so every href in the index is relative to the
  // site root and the hop back to it rides along on the script tag.
  var root = data.getAttribute("data-root") || "";

  // The most this will show at once. Typing narrows it long before the cap matters; the
  // cap is there so the empty query does not render 60 rows nobody scrolls.
  var LIMIT = 40;

  var rows = [];
  var highlight = 0;
  var opener = null;

  document.documentElement.classList.add("can-jump");

  function matches(entry, query) {
    if (!query) { return true; }
    return (
      entry.label.toLowerCase().indexOf(query) !== -1 ||
      entry.detail.toLowerCase().indexOf(query) !== -1
    );
  }

  function render(query) {
    var found = [];
    for (var i = 0; i < entries.length && found.length < LIMIT; i++) {
      if (matches(entries[i], query)) { found.push(entries[i]); }
    }

    results.textContent = "";
    rows = [];

    if (!found.length) {
      var empty = document.createElement("p");
      empty.className = "jump-empty";
      empty.textContent = "Nothing by that name.";
      results.appendChild(empty);
      return;
    }

    // Grouped, in the order the index is built in, so the headings do not reshuffle
    // as you type.
    var group = null;
    found.forEach(function (entry) {
      if (entry.group !== group) {
        group = entry.group;
        var heading = document.createElement("p");
        heading.className = "jump-group";
        heading.textContent = group;
        results.appendChild(heading);
      }

      var row = document.createElement("a");
      row.className = "jump-row";
      row.href = root + entry.href;
      row.appendChild(document.createTextNode(entry.label));

      if (entry.detail) {
        var detail = document.createElement("span");
        detail.className = "jump-detail";
        detail.textContent = entry.detail;
        row.appendChild(detail);
      }

      // The pointer moves the highlight rather than fighting it, so the row the mouse
      // is on is the row Enter would take.
      row.addEventListener("mousemove", function () {
        move(rows.indexOf(row) - highlight);
      });

      results.appendChild(row);
      rows.push(row);
    });

    highlight = 0;
    mark();
  }

  function mark() {
    rows.forEach(function (row, i) {
      var on = i === highlight;
      row.classList.toggle("is-on", on);
      if (on) { row.scrollIntoView({ block: "nearest" }); }
    });
  }

  function move(step) {
    if (!rows.length) { return; }
    highlight = (highlight + step + rows.length) % rows.length;
    mark();
  }

  function open() {
    opener = document.activeElement;
    dialog.hidden = false;
    input.value = "";
    render("");
    input.focus();
  }

  function close() {
    dialog.hidden = true;
    if (opener && opener.focus) { opener.focus(); }
    opener = null;
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) { return; }
    if (target.closest("[data-open-jump]")) {
      event.preventDefault();
      open();
    } else if (target.closest("[data-close-jump]")) {
      close();
    }
  });

  input.addEventListener("input", function () {
    render(input.value.trim().toLowerCase());
  });

  document.addEventListener("keydown", function (event) {
    // Cmd-K on a Mac, Ctrl-K everywhere else. The browser's own binding for it opens a
    // search bar, which is the wrong search bar.
    if ((event.metaKey || event.ctrlKey) && event.key === "k") {
      event.preventDefault();
      if (dialog.hidden) { open(); } else { close(); }
      return;
    }
    if (dialog.hidden) { return; }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter" && rows[highlight]) {
      event.preventDefault();
      rows[highlight].click();
    }
  });
})();
