/* The suggestions form.
 *
 * The joke is that your suggestion goes in the bin. The rule is that the joke never costs
 * anybody their suggestion, and three things enforce that:
 *
 *   1. The post happens first. The animation only runs on a 200. A failed submission
 *      drops the bit entirely and says so in plain words, because a lie about delivery is
 *      funny and a lie about failure is just a lost bug report.
 *   2. The draft is kept in localStorage until the post succeeds. A closed tab, a dead
 *      connection or a fat-fingered reload gives the text back instead of eating it.
 *   3. The confirmation admits the truth. The bin is a gag; "Evan reads these" is not.
 *
 * Everything below degrades. With scripting off the browser posts the form natively and
 * the Worker answers with a plain page, so this file is the decoration, not the feature.
 */
(function () {
  "use strict";

  var form = document.querySelector(".suggest-form");
  if (!form) { return; }

  var endpoint = form.getAttribute("data-endpoint");
  var text = form.querySelector("#suggest-text");
  var button = form.querySelector(".suggest-send");
  var status = form.querySelector(".suggest-status");
  var bin = document.querySelector(".bin");
  var lid = document.querySelector(".bin-lid");
  var DRAFT = "suggestion-draft";

  /* The silhouette, at three stages of being screwed up. All three have twelve points in
     the same order, which is what lets the browser interpolate between them — a polygon
     morph only works point-for-point, so a rectangle has to be written as twelve points
     even though four would draw it. */
  var RECT = "polygon(0% 0%, 33% 0%, 67% 0%, 100% 0%, 100% 33%, 100% 67%, " +
             "100% 100%, 67% 100%, 33% 100%, 0% 100%, 0% 67%, 0% 33%)";
  var DENTED = "polygon(5% 9%, 34% 1%, 64% 10%, 95% 3%, 98% 35%, 90% 64%, " +
               "96% 96%, 63% 89%, 32% 98%, 4% 92%, 10% 63%, 2% 32%)";
  var CRUSHED = "polygon(23% 13%, 41% 3%, 61% 14%, 85% 21%, 93% 43%, 85% 62%, " +
                "75% 85%, 53% 93%, 32% 86%, 16% 73%, 9% 49%, 14% 27%)";
  // Roughly how wide the finished ball should read, in pixels.
  var BALL_PX = 62;

  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function store(value) {
    try {
      if (value) { localStorage.setItem(DRAFT, value); }
      else { localStorage.removeItem(DRAFT); }
    } catch (e) { /* private mode; the draft is a courtesy, not a guarantee */ }
  }

  // Give back whatever the last visit did not manage to send.
  try {
    var saved = localStorage.getItem(DRAFT);
    if (saved && !text.value) {
      text.value = saved;
      status.textContent = "Restored what you were writing last time.";
    }
  } catch (e) { /* nothing to restore from */ }

  text.addEventListener("input", function () { store(text.value); });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!text.value.trim()) { return; }

    button.disabled = true;
    button.textContent = "Filing…";
    status.textContent = "";
    status.classList.remove("bad");

    var payload = {
      text: text.value,
      kind: form.querySelector("#suggest-kind").value,
      from: form.querySelector("#suggest-from").value,
      website: form.querySelector("#suggest-website").value
    };

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response.ok) { throw new Error("HTTP " + response.status); }
      // Only now is it safe to forget: it is on Evan's side of the wire.
      store("");
      return trash();
    }).then(function () {
      confirmSent();
    }).catch(function (error) {
      // Break character. The draft is still in localStorage and still in the box.
      button.disabled = false;
      button.textContent = "Submit";
      status.classList.add("bad");
      status.textContent =
        "That did not send, and this time it really is broken (" + error.message +
        "). Nothing was lost — your text is still here. Try again, or just text Evan.";
    });
  });

  /* The bin, in four beats: it arrives, the sheet is screwed up, the ball goes in, the
     lid slams. Each waits for the one before it, because they read as one action only if
     they do not overlap. Returns a promise so the confirmation waits for all of it. */
  function trash() {
    if (still || !bin || !text.animate) { return Promise.resolve(); }

    var paper = document.createElement("div");
    paper.className = "paper";
    var body = document.createElement("span");
    body.className = "paper-text";
    body.textContent = text.value;
    paper.appendChild(body);

    // Filled in once the sheet is measured; the throw reads it back so the ball keeps its
    // proportions all the way into the can.
    var ball = { x: 0.1, y: 0.9 };

    var settled = false;
    function land() {
      if (settled) { return; }
      settled = true;
      paper.remove();
      lid.classList.remove("open");
      bin.classList.remove("up");
      bin.classList.add("away");
    }

    // Beat one. The bin slides up from below the fold. Nothing is measured until it has
    // stopped moving — the slide is a transform, and a transform is inside the rect.
    var sequence = Promise.resolve()
      .then(function () {
        bin.classList.add("up");
        form.classList.add("is-trashing");
        return after(460);
      })
      .then(function () {
        // Beat two. The sheet lifts off the textarea and is screwed into a ball, in
        // place, where it can be seen. The old version crumpled it during the throw,
        // which is when it is smallest and moving fastest.
        var from = text.getBoundingClientRect();
        paper.style.left = from.left + "px";
        paper.style.top = from.top + "px";
        paper.style.width = from.width + "px";
        paper.style.height = from.height + "px";
        document.body.appendChild(paper);

        // A ball is roughly square; a textarea is emphatically not. Scaling a 660x78 box
        // down evenly keeps it 8:1, which is why the first version looked like a flake
        // rather than a ball. So the two axes are scaled by different amounts, worked out
        // from the box actually on screen, and the sheet squashes as it crushes.
        ball = { x: BALL_PX / from.width, y: BALL_PX / from.height };

        // Forces a frame so the crease and blur transitions have a state to run from.
        void paper.offsetWidth;
        paper.classList.add("crushed");

        return paper.animate([
          { transform: "scale(1, 1) rotate(0deg)", clipPath: RECT },
          { transform: "scale(" + (0.62 + ball.x * 0.4) + ", 0.82) rotate(-5deg)",
            clipPath: DENTED, offset: 0.45 },
          { transform: "scale(" + ball.x * 1.35 + ", " + ball.y * 1.3 + ") rotate(8deg)",
            clipPath: CRUSHED, offset: 0.74 },
          { transform: "scale(" + ball.x + ", " + ball.y + ") rotate(-3deg)", clipPath: CRUSHED }
        ], { duration: 640, easing: "cubic-bezier(.5,-0.2,.35,1.25)", fill: "forwards" }).finished;
      })
      .then(function () {
        // Beat three. The throw. Measured now, not earlier: the bin has settled, and the
        // page may have been scrolled while the sheet was being crushed.
        var from = paper.getBoundingClientRect();
        var to = bin.getBoundingClientRect();
        var dx = (to.left + to.width / 2) - (from.left + from.width / 2);
        var dy = (to.top + to.height * 0.3) - (from.top + from.height / 2);

        // Every keyframe keeps the squashed aspect. A plain `scale(0.16)` here would undo
        // the crumple mid-flight and land a wide flake in the bin.
        function squash(k) { return "scale(" + ball.x * k + ", " + ball.y * k + ")"; }

        lid.classList.add("open");
        return paper.animate([
          { transform: squash(1) + " rotate(-3deg)" },
          { transform: "translate(" + dx * 0.45 + "px," + (dy * 0.3 - 70) + "px) " +
              squash(0.95) + " rotate(170deg)", offset: 0.5 },
          { transform: "translate(" + dx + "px," + dy + "px) " + squash(0.6) + " rotate(400deg)",
            opacity: 0.9 }
        ], { duration: 520, easing: "cubic-bezier(.3,0,.5,1)", fill: "forwards" }).finished;
      })
      .then(function () {
        // Beat four. Lid down, can rocks, bin leaves.
        land();
        bin.classList.add("stuffed");
        return after(420);
      });

    // A browser freezes animations in a hidden tab, and `finished` never resolves while
    // it is frozen. Someone who submits and immediately switches away would come back to
    // a disabled button and no confirmation, which reads as a failure — and the natural
    // response to that is to send the same suggestion again. So the whole sequence is
    // capped: whichever finishes first, the page moves on. A timer is not throttled to a
    // stop the way an animation is.
    return Promise.race([sequence, after(4200)]).then(land, land);
  }

  function after(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function confirmSent() {
    var done = document.createElement("div");
    done.className = "card suggest-done";
    done.innerHTML =
      '<p class="suggest-done-head">Straight in the bin.</p>' +
      '<p class="suggest-done-sub">Thank you for your contribution. It has been filed ' +
      'with the care it deserves.</p>' +
      '<p class="suggest-done-real">It did actually send. Evan reads every one of these, ' +
      'and the good ones turn up on <a href="#archive">the list below</a>.</p>' +
      '<p><button type="button" class="suggest-send again">Submit another</button></p>';
    form.replaceWith(done);

    done.querySelector(".again").addEventListener("click", function () {
      window.location.reload();
    });

    // The admission lands late. Arriving with "Straight in the bin" steps on the joke;
    // a beat of silence first makes it the punchline instead of a footnote. With motion
    // reduced there is no beat to wait for, and the CSS has it visible from the start.
    var real = done.querySelector(".suggest-done-real");
    if (still) { real.classList.add("shown"); return; }
    after(1500).then(function () { real.classList.add("shown"); });
  }
})();
