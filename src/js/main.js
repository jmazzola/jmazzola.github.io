// Progressive enhancement only: every page works without this file.
(function () {
  "use strict";

  /* ---------- mobile nav ---------- */
  function initNav() {
    var header = document.querySelector("[data-nav]");
    var toggle = document.querySelector("[data-nav-toggle]");
    if (!header || !toggle) return;
    var desktop = window.matchMedia("(min-width: 760px)");

    function setOpen(open, restoreFocus) {
      header.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      if (!open && restoreFocus) toggle.focus();
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true", false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && header.classList.contains("is-open")) setOpen(false, true);
    });

    document.addEventListener("click", function (e) {
      if (header.classList.contains("is-open") && !header.contains(e.target)) setOpen(false, false);
    });

    desktop.addEventListener("change", function (e) {
      if (e.matches) setOpen(false, false);
    });
  }

  /* ---------- blog category filter ---------- */
  function initFilter() {
    var root = document.querySelector("[data-filter-root]");
    var list = document.querySelector("[data-post-list]");
    if (!root || !list) return;

    var buttons = Array.prototype.slice.call(root.querySelectorAll("[data-filter]"));
    var rows = Array.prototype.slice.call(list.querySelectorAll(".post-row"));
    var status = root.querySelector("[data-filter-status]");
    var empty = document.querySelector("[data-filter-empty]");
    var emptyName = document.querySelector("[data-filter-empty-name]");
    var reset = document.querySelector("[data-filter-reset]");
    var total = rows.length;

    function labelFor(slug) {
      for (var i = 0; i < buttons.length; i++) {
        if (buttons[i].getAttribute("data-filter") === slug) return buttons[i].getAttribute("data-label");
      }
      return slug.replace(/-/g, " ");
    }
    function apply(slug, push) {
      var shown = 0;
      rows.forEach(function (row) {
        var match = slug === "all" || row.getAttribute("data-category") === slug;
        row.hidden = !match;
        if (match) shown++;
      });

      buttons.forEach(function (btn) {
        btn.setAttribute("aria-pressed", String(btn.getAttribute("data-filter") === slug));
      });

      if (status) {
        status.innerHTML = "Showing <b>" + shown + "</b> of <b>" + total + "</b> " + (total === 1 ? "post" : "posts");
      }
      if (empty) {
        empty.hidden = shown !== 0;
        if (emptyName) emptyName.textContent = labelFor(slug);
      }

      if (push) {
        var url = new URL(window.location.href);
        if (slug === "all") url.searchParams.delete("category");
        else url.searchParams.set("category", slug);
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        apply(btn.getAttribute("data-filter"), true);
      });
    });

    if (reset) {
      reset.addEventListener("click", function () {
        apply("all", true);
        buttons[0].focus();
      });
    }

    var initial = new URLSearchParams(window.location.search).get("category");
    if (initial && /^[a-z0-9-]+$/.test(initial)) {
      apply(initial, false);
      // On narrow screens the chip row scrolls sideways; bring the active chip into view.
      var group = root.querySelector(".filter-group");
      var active = root.querySelector('[aria-pressed="true"]');
      if (group && active && group.scrollWidth > group.clientWidth) {
        group.scrollLeft = active.offsetLeft - group.offsetLeft - 24;
      }
    }
  }

  /* ---------- 404: echo the missing path, roast injection attempts ---------- */
  var LOST_PATTERNS = {
    // <img src=...> in a "name", CS2 vote-kick style; with handlers or script it's plain XSS
    cs2: /<\s*img\b[^<>]*\bsrc\s*=/i,
    active: /<\s*script\b|javascript\s*:|\bon[a-z]+\s*=|\balert\s*\(|\bprompt\s*\(|document\s*\.\s*(cookie|domain)|\bsrcdoc\s*=/i,
    xss: /<\s*\/?\s*(script|img|svg|iframe|body|details|object|embed)\b|javascript\s*:|\bon(error|load|mouseover|focus|toggle|begin)\s*=|\balert\s*\(|\bprompt\s*\(|document\s*\.\s*(cookie|domain)|\bsrcdoc\s*=/i,
    // any other tag: <b>, <h1>, <marquee>, <font color=red>, Unity/TMP rich text like <color=red> or <size=500>
    html: /<\s*\/?\s*[a-z][\w-]*(\s*=\s*[^<>]*|\s+[^<>]*)?\s*\/?\s*>|<\s*#[0-9a-f]{3,8}\s*>/i,
    sqli: /'\s*(or|and)\s+['"\d]|\bunion\s+(all\s+)?select\s|\b(select|delete)\s[\s\S]*?\sfrom\s|\b(drop|truncate)\s+table\s|\binsert\s+into\s|\b(sleep|benchmark|pg_sleep)\s*\(\s*\d|\bwaitfor\s+delay\s|information_schema|\bor\s+1\s*=\s*1\b|'\s*;|'\s*--|\/\*[\s\S]*\*\//i,
  };

  function decodeUrlPart(s) {
    s = s.replace(/\+/g, " ");
    for (var i = 0; i < 3; i++) {  // unwrap double/triple encoding
      try {
        var next = decodeURIComponent(s);
        if (next === s) break;
        s = next;
      } catch (e) { break; }
    }
    return s;
  }

  /* Rich-text colors for the HTML-injection egg: <color=X>, <color="X">, <font color=X>,
     and TextMeshPro <#hex>. Only browser-validated colors are applied, via style.color;
     all text is inserted as text nodes. */
  function richColor(v) {
    if (!v || v.length > 40 || !/^[#a-z0-9(),.%\s+-]+$/i.test(v) || /var\s*\(/i.test(v)) return null;
    return window.CSS && CSS.supports && CSS.supports("color", v) ? v.trim() : null;
  }

  function renderRichText(target, text) {
    var tag = /<\s*(\/?)\s*(color|font)\b([^<>]*)>|<\s*(#[0-9a-f]{3,8})\s*>/gi;
    var stack = [], last = 0, applied = 0, first = null, m;
    function emit(s) {
      if (!s) return;
      var color = stack.length ? stack[stack.length - 1] : null;
      if (!color) { target.appendChild(document.createTextNode(s)); return; }
      var span = document.createElement("span");
      span.style.color = color;
      span.textContent = s;
      target.appendChild(span);
    }
    while ((m = tag.exec(text))) {
      emit(text.slice(last, m.index));
      last = tag.lastIndex;
      if (m[1]) { stack.pop(); continue; }  // closing tag: consumed
      var arg = null;
      if (m[4]) arg = m[4];
      else {
        var a = (m[2].toLowerCase() === "color" ? /^\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/ : /\bcolor\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i).exec(m[3]);
        if (a) arg = a[1] || a[2] || a[3];
      }
      var color = richColor(arg);
      if (color) { stack.push(color); applied++; first = first || color; }
      else { emit(m[0]); stack.push(stack.length ? stack[stack.length - 1] : null); }  // invalid: show literally
    }
    emit(text.slice(last));
    return { applied: applied, first: first };
  }

  function initLost() {
    var el = document.querySelector("[data-lost-path]");
    if (!el) return;
    el.textContent = window.location.pathname;

    var payload = decodeUrlPart(window.location.pathname + window.location.search + window.location.hash);
    var variant = LOST_PATTERNS.cs2.test(payload) && !LOST_PATTERNS.active.test(payload) ? "cs2"
      : LOST_PATTERNS.xss.test(payload) ? "xss"
      : LOST_PATTERNS.html.test(payload) ? "html"
      : LOST_PATTERNS.sqli.test(payload) ? "sqli" : null;
    if (!variant) return;

    var shown = payload.length > 160 ? payload.slice(0, 157) + "..." : payload;
    Array.prototype.forEach.call(document.querySelectorAll("[data-lost-variant]"), function (block) {
      var on = block.getAttribute("data-lost-variant") === variant;
      block.hidden = !on;
      var title = block.querySelector(".lost-title");
      if (title) title.id = on ? "lost-title" : "";
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-lost-payload]"), function (slot) {
      slot.textContent = shown;  // text only: never innerHTML
    });
    var rendered = document.querySelector("[data-lost-rendered]");
    if (variant === "html" && rendered) {
      var result = renderRichText(rendered, shown);
      document.querySelector("[data-lost-colors]").textContent = String(result.applied);
      if (result.first) document.querySelector("[data-lost-try]").style.color = result.first;
    }
    if (variant === "cs2") initVoteKick(payload);
    document.title = { cs2: "Vote failed", xss: "alert(1) not found", html: "Nice try", sqli: "Nice try, Bobby Tables" }[variant] + " | justmazz";

    // Reward the effort with a real alert (fixed text; the payload never executes).
    // The delay lets the roast page paint first so it's visible behind the dialog.
    setTimeout(function () { window.alert("you totally found something"); }, 500);
  }

  function initVoteKick(payload) {
    var tag = /<\s*img\b[^<>]*>?/i.exec(payload);
    document.querySelector("[data-lost-tag]").textContent = tag ? tag[0] : payload;  // text only
    var you = document.querySelector("[data-vote-you]");
    var yes = document.querySelector('[data-vote-count="yes"]');
    var no = document.querySelector('[data-vote-count="no"]');
    Array.prototype.forEach.call(document.querySelectorAll("[data-vote]"), function (btn) {
      btn.addEventListener("click", function () {
        var v = btn.getAttribute("data-vote");
        yes.textContent = v === "yes" ? "1" : "0";
        no.textContent = v === "no" ? "1" : "0";
        you.textContent = v.toUpperCase();
        you.className = v === "yes" ? "is-yes" : "";
      });
    });
  }

  /* ---------- theme picker (light mode gets flashbanged) ---------- */
  var FLASHBANG_ICON =
    '<svg class="kf-icon" viewBox="0 0 24 24" role="img" aria-label="flashbang">' +
    '<path fill="currentColor" d="M9.5 2h4v2h-4zM8 5h7a1 1 0 0 1 1 1v1H7V6a1 1 0 0 1 1-1zM7 8h9v11.5A2.5 2.5 0 0 1 13.5 22h-4A2.5 2.5 0 0 1 7 19.5z"/>' +
    '<path fill="none" stroke="rgba(0,0,0,.55)" stroke-width="1.2" d="M7 12h9M7 16h9"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M16 6.5c2.4 0 3.6 1.4 3.6 3.8"/>' +
    '<circle cx="19.6" cy="12.2" r="1.4" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    "</svg>";

  function showKillfeed() {
    var old = document.querySelector(".killfeed");
    if (old) old.remove();
    var feed = document.createElement("div");
    feed.className = "killfeed";
    feed.setAttribute("role", "status");
    document.body.appendChild(feed);
    feed.innerHTML =
      '<p class="killfeed-row"><span class="kf-name">Light Mode</span>' + FLASHBANG_ICON +
      '<span class="kf-name">you</span></p>' +
      '<p class="killfeed-note">Self-flash. That\'ll do it.<br>Dark mode is still one click away.</p>';

    var timer;
    function dismiss() {
      clearTimeout(timer);
      feed.classList.add("is-leaving");
      setTimeout(function () { feed.remove(); }, 300);
    }
    feed.addEventListener("click", dismiss);
    timer = setTimeout(dismiss, 7000);
  }

  function flashbang(swap) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      swap();
      showKillfeed();
      return;
    }
    var flash = document.createElement("div");
    flash.className = "flashbang";
    flash.setAttribute("aria-hidden", "true");
    document.body.appendChild(flash);
    // Paint full white first, then swap themes underneath and let the eyes "recover".
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        swap();
        flash.classList.add("is-fading");
        setTimeout(showKillfeed, 900);
        flash.addEventListener("transitionend", function () { flash.remove(); });
      });
    });
  }

  /* Hidden themes (site.json "hidden": true) never show in the picker until someone switches to one
     by hand (localStorage "theme" or ?theme=). After that they stay unlocked on this browser, and
     their notice shows exactly once (localStorage "theme-notice-<id>"). */
  var UNLOCKED_KEY = "theme-unlocked";

  function unlockedThemes() {
    try { return JSON.parse(localStorage.getItem(UNLOCKED_KEY) || "[]"); } catch (e) { return []; }
  }

  function unlockTheme(id) {
    var list = unlockedThemes();
    if (list.indexOf(id) !== -1) return;
    list.push(id);
    try { localStorage.setItem(UNLOCKED_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function showThemeNotice(id, lines) {
    var key = "theme-notice-" + id;
    try {
      if (localStorage.getItem(key) === "1") return;
      localStorage.setItem(key, "1");
    } catch (e) {}
    var old = document.querySelector(".theme-notice");
    if (old) old.remove();
    var box = document.createElement("div");
    box.className = "theme-notice";
    box.setAttribute("role", "status");
    var prompt = document.createElement("p");
    prompt.className = "theme-notice-prompt";
    prompt.textContent = "> ACCESS GRANTED";
    var title = document.createElement("p");
    title.className = "theme-notice-title";
    title.textContent = lines[0];
    var body = document.createElement("p");
    body.className = "theme-notice-body";
    body.textContent = lines[1] || "";
    box.append(prompt, title, body);
    document.body.appendChild(box);

    var timer;
    function dismiss() {
      clearTimeout(timer);
      box.classList.add("is-leaving");
      setTimeout(function () { box.remove(); }, 300);
    }
    box.addEventListener("click", dismiss);
    timer = setTimeout(dismiss, 8000);
  }

  function initTheme() {
    var picker = document.querySelector("[data-theme-picker]");
    if (!picker) return;
    var root = document.documentElement;
    var themes = JSON.parse(picker.getAttribute("data-themes"));
    var buttons = Array.prototype.slice.call(picker.querySelectorAll("[data-theme-choice]"));

    function sync() {
      var unlocked = unlockedThemes();
      buttons.forEach(function (btn) {
        var id = btn.getAttribute("data-theme-choice");
        btn.setAttribute("aria-pressed", String(id === root.dataset.theme));
        if (themes[id] && themes[id].hidden) btn.hidden = unlocked.indexOf(id) === -1;
      });
    }

    function setTheme(id) {
      root.dataset.theme = id;
      document.querySelector('link[rel="icon"]').href = themes[id].favicon;
      document.querySelector('meta[name="theme-color"]').content = themes[id].themeColor;
      try { localStorage.setItem("theme", id); } catch (e) {}
      sync();
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-theme-choice");
        if (id === root.dataset.theme || !themes[id]) return;
        if (id === "light") flashbang(function () { setTheme(id); });
        else setTheme(id);
        if (themes[id].notice) showThemeNotice(id, themes[id].notice);
      });
    });

    // Loaded straight into a hidden theme: unlock it and greet them (once ever, see showThemeNotice).
    var current = themes[root.dataset.theme];
    if (current && current.hidden) {
      unlockTheme(root.dataset.theme);
      if (current.notice) showThemeNotice(root.dataset.theme, current.notice);
    }

    sync();
  }

  /* ---------- footer quip: fresh one each load ---------- */
  function initQuip() {
    var el = document.querySelector("[data-quips]");
    if (!el) return;
    try {
      var quips = JSON.parse(el.getAttribute("data-quips"));
      el.textContent = quips[Math.floor(Math.random() * quips.length)];
    } catch (e) {}
  }

  /* ---------- code blocks: slide the <details> fold instead of snapping ---------- */
  function initCodeBlocks() {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var ease = getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim() || "ease-out";
    document.querySelectorAll(".code-block").forEach(function (block) {
      var head = block.querySelector(".code-head");
      if (!head || !block.animate) return;
      var anim = null;

      head.addEventListener("click", function (e) {
        if (reduce.matches) return;
        e.preventDefault();
        var opening = !block.open || block.classList.contains("is-closing");
        var from = block.offsetHeight; // mid-animation height when reversing
        if (anim) anim.cancel();
        block.classList.toggle("is-closing", !opening);
        block.open = true; // a closing block stays open until the slide ends
        var borders = block.offsetHeight - block.clientHeight;
        var to = opening ? block.offsetHeight : head.offsetHeight + borders;
        // longer folds get more time so a 70-line script doesn't whip shut
        var duration = Math.min(360, 160 + Math.abs(to - from) * 0.15);
        anim = block.animate({ height: [from + "px", to + "px"] }, { duration: duration, easing: ease });
        anim.onfinish = function () {
          anim = null;
          if (opening) return;
          block.open = false;
          block.classList.remove("is-closing");
        };
      });
    });
  }

  /* ---------- post images: click to blow up, zoom and pan, click out to close ---------- */
  function initLightbox() {
    var imgs = Array.prototype.filter.call(document.querySelectorAll(".prose img"), function (img) {
      return !img.closest("a");
    });
    if (!imgs.length || typeof HTMLDialogElement !== "function") return;

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var ease = getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim() || "ease-out";
    var MIN = 1, MAX = 8, STEP = 1.5;

    var dialog = document.createElement("dialog");
    dialog.className = "lightbox";
    dialog.setAttribute("aria-label", "Image viewer");
    dialog.innerHTML =
      '<div class="lightbox-scrim"></div>' +
      '<img class="lightbox-img" alt="" draggable="false">' +
      '<div class="lightbox-bar">' +
      '<button type="button" class="lightbox-btn" data-act="out" aria-label="Zoom out">\u2212</button>' +
      '<button type="button" class="lightbox-btn lightbox-zoom" data-act="reset" aria-label="Reset zoom">100%</button>' +
      '<button type="button" class="lightbox-btn" data-act="in" aria-label="Zoom in">+</button>' +
      '<button type="button" class="lightbox-btn" data-act="close" aria-label="Close">\u00d7</button>' +
      "</div>";
    document.body.appendChild(dialog);
    var scrim = dialog.querySelector(".lightbox-scrim");
    var view = dialog.querySelector(".lightbox-img");
    var bar = dialog.querySelector(".lightbox-bar");
    var zoomLabel = dialog.querySelector(".lightbox-zoom");

    var source = null, closing = false;
    var scale = 1, tx = 0, ty = 0, fitW = 0, fitH = 0;
    var pointers = new Map(), pinchDist = 0, dragged = false;

    function apply() {
      view.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
      zoomLabel.textContent = Math.round(scale * 100) + "%";
      view.classList.toggle("is-zoomed", scale > 1);
    }

    // Fit the image inside the viewport (never past 1.5x its natural size), leaving room for the bar.
    function size() {
      var nw = source.naturalWidth || source.clientWidth;
      var nh = source.naturalHeight || source.clientHeight;
      var k = Math.min((window.innerWidth * 0.94) / nw, (window.innerHeight * 0.84) / nh, 1.5);
      fitW = Math.round(nw * k);
      fitH = Math.round(nh * k);
      view.style.width = fitW + "px";
      view.style.height = fitH + "px";
    }

    // Panning only goes as far as the zoomed image overflows the viewport.
    function clampPan() {
      var overX = fitW * scale - window.innerWidth;
      var overY = fitH * scale - window.innerHeight;
      var maxX = overX > 0 ? overX / 2 + 24 : 0;
      var maxY = overY > 0 ? overY / 2 + 24 : 0;
      tx = Math.min(maxX, Math.max(-maxX, tx));
      ty = Math.min(maxY, Math.max(-maxY, ty));
    }

    // Zoom so the image point under (cx, cy) stays put; no point means the viewport center.
    function zoomTo(next, cx, cy) {
      next = Math.min(MAX, Math.max(MIN, next));
      var px = (cx == null ? window.innerWidth / 2 : cx) - window.innerWidth / 2;
      var py = (cy == null ? window.innerHeight / 2 : cy) - window.innerHeight / 2;
      tx = px - ((px - tx) * next) / scale;
      ty = py - ((py - ty) * next) / scale;
      scale = next;
      if (scale === MIN) tx = ty = 0;
      clampPan();
      apply();
    }

    // Transform that puts the centered viewer image exactly over a rect on the page.
    function overRect(r) {
      var dx = r.left + r.width / 2 - window.innerWidth / 2;
      var dy = r.top + r.height / 2 - window.innerHeight / 2;
      return "translate(" + dx + "px," + dy + "px) scale(" + r.width / fitW + ")";
    }

    function open(img) {
      source = img;
      closing = false;
      view.src = img.currentSrc || img.src;
      view.alt = img.alt;
      scale = 1;
      tx = ty = 0;
      size();
      apply();
      var r = img.getBoundingClientRect();
      document.documentElement.classList.add("lightbox-open");
      dialog.showModal();
      img.classList.add("is-lifted");
      if (reduce.matches || !view.animate) return;
      view.animate([{ transform: overRect(r) }, { transform: view.style.transform }], { duration: 340, easing: ease });
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "linear" });
      bar.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 120, easing: "linear", fill: "backwards" });
    }

    function close() {
      if (closing || !dialog.open) return;
      closing = true;
      var anims = [];
      function done() {
        anims.forEach(function (a) { a.cancel(); });
        dialog.close();
        document.documentElement.classList.remove("lightbox-open");
        source.classList.remove("is-lifted");
        source.focus({ preventScroll: true });
        pointers.clear();
        closing = false;
      }
      if (reduce.matches || !view.animate) return done();
      // Shrink back into the page image; if it has scrolled away, just fade out.
      var r = source.getBoundingClientRect();
      var visible = r.bottom > 0 && r.top < window.innerHeight;
      var opts = { duration: 280, easing: ease, fill: "forwards" };
      anims.push(view.animate(
        [{ transform: view.style.transform, opacity: 1 }, { transform: visible ? overRect(r) : view.style.transform, opacity: visible ? 1 : 0 }],
        opts
      ));
      anims.push(scrim.animate([{ opacity: 1 }, { opacity: 0 }], opts));
      anims.push(bar.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" }));
      anims[0].onfinish = done;
    }

    imgs.forEach(function (img) {
      img.classList.add("zoomable");
      img.tabIndex = 0;
      img.setAttribute("role", "button");
      img.setAttribute("aria-haspopup", "dialog");
      img.addEventListener("click", function () { open(img); });
      img.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(img);
        }
      });
    });

    dialog.addEventListener("cancel", function (e) { // Esc
      e.preventDefault();
      close();
    });
    scrim.addEventListener("click", close);
    bar.addEventListener("click", function (e) {
      var act = e.target.closest("[data-act]");
      if (!act) return;
      var a = act.getAttribute("data-act");
      if (a === "in") zoomTo(scale * STEP);
      else if (a === "out") zoomTo(scale / STEP);
      else if (a === "reset") zoomTo(MIN);
      else close();
    });

    dialog.addEventListener("wheel", function (e) {
      e.preventDefault();
      zoomTo(scale * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });

    dialog.addEventListener("keydown", function (e) {
      var pan = 60;
      if (e.key === "+" || e.key === "=") zoomTo(scale * STEP);
      else if (e.key === "-" || e.key === "_") zoomTo(scale / STEP);
      else if (e.key === "0") zoomTo(MIN);
      else if (scale > 1 && e.key === "ArrowLeft") tx += pan;
      else if (scale > 1 && e.key === "ArrowRight") tx -= pan;
      else if (scale > 1 && e.key === "ArrowUp") ty += pan;
      else if (scale > 1 && e.key === "ArrowDown") ty -= pan;
      else return;
      e.preventDefault();
      clampPan();
      apply();
    });

    // Drag to pan when zoomed, two fingers to pinch-zoom, and a plain click toggles zoom.
    view.addEventListener("pointerdown", function (e) {
      view.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) dragged = false;
      if (pointers.size === 2) {
        var p = Array.from(pointers.values());
        pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      }
    });
    view.addEventListener("pointermove", function (e) {
      var prev = pointers.get(e.pointerId);
      if (!prev) return;
      var cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);
      if (pointers.size === 2) {
        var p = Array.from(pointers.values());
        var dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (pinchDist) zoomTo((scale * dist) / pinchDist, (p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
        pinchDist = dist;
        dragged = true;
        return;
      }
      var dx = cur.x - prev.x, dy = cur.y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
      if (scale > 1) {
        tx += dx;
        ty += dy;
        clampPan();
        apply();
      }
    });
    function release(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
    }
    view.addEventListener("pointerup", release);
    view.addEventListener("pointercancel", release);
    view.addEventListener("click", function (e) {
      if (dragged) return;
      zoomTo(scale > 1 ? MIN : 2.5, e.clientX, e.clientY);
    });

    window.addEventListener("resize", function () {
      if (!dialog.open || closing) return;
      size();
      scale = 1;
      tx = ty = 0;
      apply();
    });
  }

  /* ---------- post contents rail: mark the section you're reading ---------- */
  function initToc() {
    var toc = document.querySelector("[data-toc]");
    if (!toc) return;
    var root = document.documentElement;
    var links = Array.prototype.slice.call(toc.querySelectorAll(".toc-link"));
    var heads = links.map(function (a) { return document.getElementById(decodeURIComponent(a.hash.slice(1))); });
    var current = null;
    var queued = false;

    function update() {
      queued = false;
      // a section counts as "being read" once its heading passes a line 20% down, under the sticky header
      var line = (parseFloat(getComputedStyle(root).scrollPaddingTop) || 0) + window.innerHeight * 0.2;
      var active = -1;
      heads.forEach(function (h, i) {
        if (h && h.getBoundingClientRect().top <= line) active = i;
      });
      if (window.innerHeight + window.scrollY >= root.scrollHeight - 2) active = heads.length - 1;
      var next = active >= 0 ? links[active] : null;
      if (next === current) return;
      if (current) current.removeAttribute("aria-current");
      if (next) next.setAttribute("aria-current", "true");
      current = next;
    }
    function queue() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    }
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    update();
  }

  initNav();
  initFilter();
  initLost();
  initTheme();
  initQuip();
  initCodeBlocks();
  initLightbox();
  initToc();
})();
