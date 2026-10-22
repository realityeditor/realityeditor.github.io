/* Self-hosted video player styled after the Vimeo embed player.
 * Markup: <div class="vp" data-sources='[{"q":1080,"src":"…mp4"},…]' data-poster="…jpg" data-color="#00ffff"></div>
 * Progressive MP4 renditions; "Auto" picks the smallest one that covers the player at the screen's pixel density. */
(function () {
  "use strict";
  var ICON = {
    play: '<svg viewBox="0 0 20 20"><polygon points="1,0 20,10 1,20"/></svg>',
    pause: '<svg viewBox="0 0 20 20"><rect width="6" height="20" x="2"/><rect width="6" height="20" x="12"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.7 7.7 0 0 0-1.7-1L15 3.3h-4l-.3 2.6a7.7 7.7 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.7 7.7 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7.7 7.7 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>',
    full: '<svg viewBox="0 0 12 12"><polygon points="6.3,0 12,0 12,5.7 9.9,3.6 7.7,5.8 6.2,4.3 8.4,2.1"/><polygon points="5.7,12 0,12 0,6.3 2.1,8.4 4.3,6.2 5.8,7.7 3.6,9.9"/></svg>',
    unfull: '<svg viewBox="0 0 12 12"><polygon points="12,5 7,5 7,0 8.9,1.9 11,0 12,1 10.1,3.1"/><polygon points="0,7 5,7 5,12 3.1,10.1 1,12 0,11 1.9,8.9"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm18.6-.6L20.2 7 18 9.2 15.8 7l-1.4 1.4 2.2 2.2-2.2 2.2 1.4 1.4 2.2-2.2 2.2 2.2 1.4-1.4-2.2-2.2z"/></svg>'
  };

  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (r < 10 ? "0" : "") + r;
  }

  function Player(root) {
    var sources = JSON.parse(root.getAttribute("data-sources")).sort(function (a, b) { return b.q - a.q; });
    if (root.getAttribute("data-color")) root.style.setProperty("--vp-color", root.getAttribute("data-color"));
    root.tabIndex = 0;
    root.innerHTML =
      '<video playsinline preload="metadata"></video><div class="vp-poster"></div><div class="vp-click"></div><div class="vp-spinner"></div>' +
      '<div class="vp-controls"><button class="vp-play" type="button" aria-label="Play">' + ICON.play + '</button>' +
      '<div class="vp-bar"><div class="vp-progress" role="slider" aria-label="Seek" tabindex="0"><div class="vp-track">' +
      '<div class="vp-loaded"></div><div class="vp-hovered"></div><div class="vp-played"></div></div>' +
      '<div class="vp-time vp-time-current">0:00</div><div class="vp-time vp-time-hover"></div></div>' +
      '<div class="vp-volume"><button class="vp-btn vp-mute" type="button" aria-label="Mute">' + ICON.vol + '</button>' +
      '<div class="vp-vol-bars" title="Volume"><span style="height:4px"></span><span style="height:7px"></span><span style="height:10px"></span><span style="height:14px"></span></div></div>' +
      '<button class="vp-btn vp-settings" type="button" aria-label="Settings" aria-expanded="false">' + ICON.gear + '</button>' +
      '<button class="vp-btn vp-full" type="button" aria-label="Fullscreen">' + ICON.full + '</button>' +
      '</div><div class="vp-menu" role="menu"><h4>Quality</h4><ul></ul></div></div>';
    var $ = function (s) { return root.querySelector(s); };
    var video = $("video"), playBtn = $(".vp-play"), progress = $(".vp-progress"), played = $(".vp-played"), loaded = $(".vp-loaded"),
        hovered = $(".vp-hovered"), tCur = $(".vp-time-current"), tHover = $(".vp-time-hover"), muteBtn = $(".vp-mute"),
        bars = root.querySelectorAll(".vp-vol-bars span"), menu = $(".vp-menu"), list = menu.querySelector("ul"),
        settings = $(".vp-settings"), fullBtn = $(".vp-full"), idleTimer = null, choice = "auto", current = null;
    if (root.getAttribute("data-poster")) {
      video.poster = root.getAttribute("data-poster");
      $(".vp-poster").style.backgroundImage = "url('" + root.getAttribute("data-poster") + "')";
    }

    function autoQuality() {
      var need = root.clientHeight * (window.devicePixelRatio || 1), w = root.clientWidth * (window.devicePixelRatio || 1);
      var pick = sources[sources.length - 1];
      for (var i = sources.length - 1; i >= 0; i--) { pick = sources[i]; if (sources[i].h >= need && sources[i].w >= w) break; }
      return pick;
    }
    function load(src, keepTime) {
      if (current === src) return;
      var t = keepTime ? video.currentTime : 0, wasPlaying = !video.paused;
      current = src;
      video.src = src.src;
      if (keepTime) {
        video.addEventListener("loadedmetadata", function once() { video.removeEventListener("loadedmetadata", once); video.currentTime = t; if (wasPlaying) video.play(); });
      }
      renderMenu();
    }
    function renderMenu() {
      var auto = autoQuality();
      list.innerHTML = '<li role="menuitemradio" data-q="auto" aria-checked="' + (choice === "auto") + '">Auto<small>' + (choice === "auto" && current ? current.q + "p" : "") + "</small></li>" +
        sources.map(function (s) { return '<li role="menuitemradio" data-q="' + s.q + '" aria-checked="' + (choice === s.q) + '">' + s.q + "p" + (s.q >= 720 ? '<small>HD</small>' : "") + "</li>"; }).join("");
      void auto;
    }
    list.addEventListener("click", function (e) {
      var li = e.target.closest("li"); if (!li) return;
      choice = li.getAttribute("data-q") === "auto" ? "auto" : +li.getAttribute("data-q");
      load(choice === "auto" ? autoQuality() : sources.filter(function (s) { return s.q === choice; })[0], true);
      renderMenu(); closeMenu();
    });
    function closeMenu() { menu.classList.remove("open"); settings.setAttribute("aria-expanded", "false"); }
    settings.addEventListener("click", function (e) { e.stopPropagation(); var open = !menu.classList.contains("open"); menu.classList.toggle("open", open); settings.setAttribute("aria-expanded", open); });
    document.addEventListener("click", function (e) { if (!menu.contains(e.target)) closeMenu(); });

    function toggle() { if (video.paused || video.ended) video.play(); else video.pause(); }
    playBtn.addEventListener("click", toggle);
    $(".vp-click").addEventListener("click", function () { closeMenu(); toggle(); });
    video.addEventListener("play", function () { root.classList.add("vp-playing", "vp-started"); playBtn.innerHTML = ICON.pause; playBtn.setAttribute("aria-label", "Pause"); poke(); });
    video.addEventListener("pause", function () { root.classList.remove("vp-playing"); playBtn.innerHTML = ICON.play; playBtn.setAttribute("aria-label", "Play"); });
    video.addEventListener("waiting", function () { root.classList.add("vp-waiting"); });
    ["playing", "canplay", "pause"].forEach(function (ev) { video.addEventListener(ev, function () { root.classList.remove("vp-waiting"); }); });

    function paint() {
      var d = video.duration || 0, f = d ? video.currentTime / d : 0;
      played.style.width = f * 100 + "%";
      tCur.textContent = fmt(video.currentTime);
      tCur.style.left = Math.min(Math.max(f * progress.clientWidth, 18), progress.clientWidth - 18) + "px";
      if (video.buffered.length && d) loaded.style.width = video.buffered.end(video.buffered.length - 1) / d * 100 + "%";
      progress.setAttribute("aria-valuenow", Math.round(video.currentTime));
    }
    ["timeupdate", "progress", "loadedmetadata", "seeked"].forEach(function (ev) { video.addEventListener(ev, paint); });

    function frac(e) { var r = progress.getBoundingClientRect(); return Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1); }
    progress.addEventListener("mousemove", function (e) {
      var f = frac(e); hovered.style.width = f * 100 + "%"; tHover.textContent = fmt(f * (video.duration || 0));
      tHover.style.left = Math.min(Math.max(f * progress.clientWidth, 18), progress.clientWidth - 18) + "px";
    });
    var dragging = false;
    progress.addEventListener("pointerdown", function (e) { dragging = true; progress.setPointerCapture(e.pointerId); seek(e); });
    progress.addEventListener("pointermove", function (e) { if (dragging) seek(e); });
    progress.addEventListener("pointerup", function () { dragging = false; });
    function seek(e) { if (video.duration) { video.currentTime = frac(e) * video.duration; paint(); } }

    function vol() {
      var level = video.muted ? 0 : Math.ceil(video.volume * 4);
      for (var i = 0; i < bars.length; i++) bars[i].classList.toggle("on", i < level);
      muteBtn.innerHTML = video.muted || video.volume === 0 ? ICON.mute : ICON.vol;
    }
    muteBtn.addEventListener("click", function () { video.muted = !video.muted; });
    $(".vp-vol-bars").addEventListener("click", function (e) {
      var r = e.currentTarget.getBoundingClientRect(); video.volume = Math.min(1, Math.max(0.25, Math.ceil((e.clientX - r.left) / r.width * 4) / 4)); video.muted = false;
    });
    video.addEventListener("volumechange", vol);

    function isFull() { return document.fullscreenElement === root || document.webkitFullscreenElement === root; }
    fullBtn.addEventListener("click", function () {
      if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else if (root.requestFullscreen) root.requestFullscreen();
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();  // iPhone
    });
    function fullChange() {
      fullBtn.innerHTML = isFull() ? ICON.unfull : ICON.full;
      if (choice === "auto") setTimeout(function () { load(autoQuality(), true); }, 300);
    }
    document.addEventListener("fullscreenchange", fullChange);
    document.addEventListener("webkitfullscreenchange", fullChange);

    function poke() {
      root.classList.remove("vp-idle"); clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { if (!menu.classList.contains("open")) root.classList.add("vp-idle"); }, 2500);
    }
    root.addEventListener("mousemove", poke);
    root.addEventListener("mouseleave", function () { if (!video.paused) root.classList.add("vp-idle"); });
    root.addEventListener("keydown", function (e) {
      if (e.target.tagName === "LI") return;
      var k = e.key;
      if (k === " " || k === "k") { e.preventDefault(); toggle(); }
      else if (k === "ArrowRight" || k === "ArrowLeft") { e.preventDefault(); video.currentTime += k === "ArrowRight" ? 5 : -5; }
      else if (k === "ArrowUp" || k === "ArrowDown") { e.preventDefault(); video.volume = Math.min(1, Math.max(0, video.volume + (k === "ArrowUp" ? 0.25 : -0.25))); video.muted = false; }
      else if (k === "f") fullBtn.click();
      else if (k === "m") video.muted = !video.muted;
      else return;
      poke();
    });
    window.addEventListener("resize", function () { if (choice === "auto" && video.paused && !root.classList.contains("vp-started")) load(autoQuality(), false); });

    load(autoQuality(), false);
    vol(); renderMenu();
  }

  function init() { [].forEach.call(document.querySelectorAll(".vp[data-sources]"), function (el) { if (!el._vp) { el._vp = true; Player(el); } }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
