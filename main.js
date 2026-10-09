/* WINTER site motion.
   GSAP + ScrollTrigger drive everything tied to scroll; Lenis smooths the
   scroll itself; three small canvases draw the generative visuals. */
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(pointer: fine)").matches;
  const hasGsap = typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined";
  if (!hasGsap) { document.documentElement.classList.remove("js"); }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };

  /* Run a canvas loop only while its element is on screen. */
  function whileVisible(el, start, stop) {
    new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { rootMargin: "100px" }).observe(el);
  }

  function sizeCanvas(cv, maxDpr = 1.75) {
    const dpr = Math.min(devicePixelRatio || 1, maxDpr);
    const r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    return { w: cv.width, h: cv.height, dpr };
  }

  /* ---------------- Wordmark fit: WINTER spans the full content width ---------------- */
  const fit = document.querySelector("[data-fit]");
  function fitWord() {
    const gutter = parseFloat(getComputedStyle(fit.parentElement).paddingLeft);
    fit.style.fontSize = "100px";
    const w = fit.getBoundingClientRect().width;
    fit.style.fontSize = (100 * (innerWidth - gutter * 2) / w) + "px";
  }
  fitWord();
  document.fonts && document.fonts.ready.then(() => { fitWord(); terrainSize(); if (reduced) drawTerrain(0); });

  /* ---------------- Terrain: point-cloud dunes with hidden-line occlusion ----------------
     Rows sit at fixed depths z; the height field slides toward the camera over time
     and with scroll. Each row is drawn back to front: first a background-coloured
     polygon from its ridge down (hides everything behind it, including the wordmark),
     then its dots. Projection: screenY = horizon + (camY - height) * f / z.          */
  const terrain = document.querySelector("[data-terrain]");
  const T = { scroll: 0, mx: 0, my: 0, tx: 0, ty: 0, raf: 0, time: 0 };
  let tw, th, rows, cols, focal, hScale = 1, horizonFrac = 0.45;
  function terrainSize() {
    ({ w: tw, h: th } = sizeCanvas(terrain));
    // Horizon sits just below the wordmark so dune crests bite into its lower third.
    const word = document.querySelector(".hero__word");
    const hh = terrain.clientHeight || innerHeight;
    const bottom = (word.offsetTop + word.offsetHeight) / hh;
    focal = th * 0.95;
    hScale = Math.min(1, tw / th / 1.5);          // portrait screens get lower dunes
    horizonFrac = bottom + 0.17 * Math.max(hScale, 0.45) - 0.35 * (word.offsetHeight / hh);
    const small = innerWidth < 768;
    rows = small ? 70 : 84;
    cols = small ? 150 : 190;
  }
  const height = (x, z) => {
    const a = Math.sin(0.55 * x + 0.32 * z);
    const b = Math.sin(1.25 * x - 0.7 * z + 1.7);
    const c = 1 - Math.abs(Math.sin(0.23 * x + 0.41 * z + 0.6)); // sharp dune crests
    const d = Math.sin(0.11 * x - 0.13 * z + 2.0); // slow swell
    return 1.25 * (0.34 * a + 0.16 * b + 0.75 * c * c) + 0.3 * d;
  };
  const snow = Array.from({ length: 140 }, (_, i) => ({ x: hash(i, 1), y: hash(i, 2), s: 0.4 + hash(i, 3) * 1.1, v: 0.2 + hash(i, 4) * 0.6 }));

  function drawTerrain(dt) {
    const ctx = terrain.getContext("2d");
    T.time += dt;
    T.mx += (T.tx - T.mx) * 0.04;
    T.my += (T.ty - T.my) * 0.04;
    ctx.clearRect(0, 0, tw, th);

    const f = focal;
    const camY = 0.62 * Math.max(hScale, 0.6) + T.my * 0.08;
    const horizon = th * horizonFrac;
    const cx = tw * 0.5 + T.mx * tw * 0.03;
    const travel = T.time * 0.22 + T.scroll * 5;
    const zNear = 1.1, zFar = 13;
    const unit = Math.max(tw / 1600, 0.9 * (tw / innerWidth)); // never thinner than ~1 css px

    for (let r = rows - 1; r >= 0; r--) {
      const u = r / (rows - 1);
      const z = zNear + (zFar - zNear) * u * u;           // denser rows near the camera
      const xr = (cx / f) * z * 1.15 + 0.5;
      const step = (2 * xr) / (cols - 1);
      const fade = smooth(0.0, 0.22, u) * (1 - 0.55 * smooth(0.8, 1, u)); // dark foreground, misty far
      const pts = new Float32Array(cols * 2);
      for (let c = 0; c < cols; c++) {
        const x = -xr + c * step;
        const y = hScale * height(x, z + travel) * (0.3 + 0.7 * smooth(zNear, 4.5, z)); // flatter under the camera
        pts[c * 2] = cx + (x * f) / z;
        pts[c * 2 + 1] = horizon + ((camY - y) * f) / z;
      }
      // occluder
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#0a0b0d";
      ctx.beginPath();
      ctx.moveTo(pts[0], th);
      for (let c = 0; c < cols; c++) ctx.lineTo(pts[c * 2], pts[c * 2 + 1]);
      ctx.lineTo(pts[(cols - 1) * 2], th);
      ctx.closePath();
      ctx.fill();
      if (fade < 0.02) continue;
      // dots, lit from the upper left: brightness follows the slope
      ctx.fillStyle = "#eef1f3";
      const size = Math.max(1, (4.2 * unit) / Math.sqrt(z));
      for (let c = 1; c < cols - 1; c++) {
        const slope = pts[c * 2 + 3] - pts[c * 2 - 1];
        const lit = clamp(0.28 + (slope / (step * f / z)) * 2.2, 0.06, 1);
        const n = hash(r, c);
        const rim = 0.45 * smooth(0.7, 0.95, u) * smooth(-0.2, 0.6, slope / (step * f / z) + 0.3); // moonlit far crests
        const a = Math.min(1, fade * lit * (0.6 + 0.9 * n) + rim * n);
        if (a < 0.03) continue;
        ctx.globalAlpha = a;
        const dx = step * f / z, dy = pts[c * 2 + 3] - pts[c * 2 - 1];
        // two jittered grains per cell, sitting on the ridge line
        for (let k = 0; k < 2; k++) {
          const t = hash(c * 2 + k, r + 9) - 0.5;
          ctx.fillRect(pts[c * 2] + t * dx, pts[c * 2 + 1] + t * dy * 0.5 + (hash(r + k, c) - 0.5) * size * 3, size, size);
        }
      }
    }
    // drifting snow over everything
    ctx.fillStyle = "#ffffff";
    for (const p of snow) {
      p.y += p.v * dt * 0.02; p.x += Math.sin(T.time * 0.5 + p.s * 9) * dt * 0.002;
      if (p.y > 1) { p.y = 0; p.x = Math.random(); }
      ctx.globalAlpha = 0.25 + p.s * 0.3;
      const s = p.s * 1.6 * unit * 1.4;
      ctx.fillRect(((p.x % 1) + 1) % 1 * tw, p.y * th, s, s);
    }
    ctx.globalAlpha = 1;
  }

  terrainSize();
  if (reduced) {
    drawTerrain(0);
  } else {
    let last = 0;
    const loop = (now) => {
      const dt = last ? Math.min(now - last, 50) / 1000 : 0.016;
      last = now;
      drawTerrain(dt * 1);
      T.raf = requestAnimationFrame(loop);
    };
    whileVisible(terrain, () => { if (!T.raf) { last = 0; T.raf = requestAnimationFrame(loop); } }, () => { cancelAnimationFrame(T.raf); T.raf = 0; });
    if (finePointer) {
      addEventListener("pointermove", (e) => {
        T.tx = (e.clientX / innerWidth - 0.5) * 2;
        T.ty = (e.clientY / innerHeight - 0.5) * 2;
      }, { passive: true });
    }
  }

  /* ---------------- Homeroom panel: a seating chart being "scanned" ---------------- */
  const grid = document.querySelector("[data-grid]");
  const G = { raf: 0, t: 0 };
  let gs = null;
  function drawGrid(dt) {
    if (!gs) gs = sizeCanvas(grid);
    const { w, h, dpr } = gs;
    const ctx = grid.getContext("2d");
    G.t += dt;
    const colsN = 8, rowsN = 5, padX = w * 0.1, padY = h * 0.1;
    const gx = (w - padX * 2) / (colsN - 1), gy = (h * 0.62 - padY) / (rowsN - 1);
    const scan = ((G.t * 0.18) % 1.3) * w;
    ctx.clearRect(0, 0, w, h);
    for (let r = 0; r < rowsN; r++) for (let c = 0; c < colsN; c++) {
      const x = padX + c * gx, y = padY + r * gy;
      const absent = hash(r, c) > 0.86;
      const seen = x < scan;
      ctx.beginPath();
      ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2);
      if (seen && !absent) { ctx.fillStyle = "#e8eaed"; ctx.fill(); }
      else { ctx.strokeStyle = seen ? "#b9d4e3" : "rgba(232,234,237,.25)"; ctx.lineWidth = 1.2 * dpr; ctx.stroke(); }
    }
    ctx.fillStyle = "rgba(185,212,227,.5)";
    ctx.fillRect(scan, padY * 0.4, 1 * dpr, h * 0.62);
  }
  if (grid) {
    if (reduced) drawGrid(10);
    else {
      let last = 0;
      const loop = (now) => { const dt = last ? Math.min(now - last, 50) / 1000 : 0.016; last = now; drawGrid(dt); G.raf = requestAnimationFrame(loop); };
      whileVisible(grid, () => { if (!G.raf) { last = 0; G.raf = requestAnimationFrame(loop); } }, () => { cancelAnimationFrame(G.raf); G.raf = 0; });
    }
  }

  /* ---------------- Waves: silk-like line field with a moon ---------------- */
  const waves = document.querySelector("[data-waves]");
  const W = { raf: 0, t: 0, scroll: 0 };
  let ww, wh;
  function wavesSize() { ({ w: ww, h: wh } = sizeCanvas(waves)); }
  function drawWaves(dt) {
    const ctx = waves.getContext("2d");
    W.t += dt;
    ctx.clearRect(0, 0, ww, wh);
    // moon
    const mr = Math.min(ww, wh) * 0.16;
    const mx = ww * 0.68, my = wh * (0.3 - W.scroll * 0.12);
    const g = ctx.createRadialGradient(mx - mr * 0.35, my - mr * 0.4, mr * 0.05, mx, my, mr);
    g.addColorStop(0, "#f2f3f4"); g.addColorStop(0.45, "#9ea4aa"); g.addColorStop(1, "#1a1d21");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    // ribbon of lines
    const N = innerWidth < 768 ? 36 : 64;
    const seg = 90;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      ctx.beginPath();
      for (let s = 0; s <= seg; s++) {
        const xn = s / seg;
        const x = xn * ww;
        const env = Math.exp(-Math.pow((xn - 0.42) / 0.36, 2));
        const y = wh * (0.26 + 0.34 * u + 0.18 * xn)
          + env * wh * 0.11 * Math.sin(xn * 6.0 + W.t * 0.35 + u * 2.6)
          + wh * 0.05 * Math.sin(xn * 2.2 - W.t * 0.22 + u * 4.0);
        s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      const crest = Math.exp(-Math.pow((u - 0.35) / 0.22, 2));
      ctx.strokeStyle = `rgba(232,234,237,${0.05 + 0.32 * crest})`;
      ctx.lineWidth = Math.max(1, wh / 900);
      ctx.stroke();
    }
    // fade the bottom into the list area
    const fade = ctx.createLinearGradient(0, wh * 0.55, 0, wh);
    fade.addColorStop(0, "rgba(10,11,13,0)"); fade.addColorStop(1, "rgba(10,11,13,1)");
    ctx.fillStyle = fade; ctx.fillRect(0, wh * 0.55, ww, wh * 0.45);
  }
  wavesSize();
  if (reduced) drawWaves(0);
  else {
    let last = 0;
    const loop = (now) => { const dt = last ? Math.min(now - last, 50) / 1000 : 0.016; last = now; drawWaves(dt); W.raf = requestAnimationFrame(loop); };
    whileVisible(waves, () => { if (!W.raf) { last = 0; W.raf = requestAnimationFrame(loop); } }, () => { cancelAnimationFrame(W.raf); W.raf = 0; });
  }

  let resizeT;
  addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { gs = null; fitWord(); terrainSize(); wavesSize(); if (reduced) { drawTerrain(0); drawWaves(0); } }, 120);
  });

  /* ---------------- Accordion ---------------- */
  document.querySelectorAll(".row__head").forEach((btn, i) => {
    const row = btn.parentElement;
    const set = (open) => { open ? row.setAttribute("data-open", "") : row.removeAttribute("data-open"); btn.setAttribute("aria-expanded", String(open)); };
    if (i === 0) set(true);
    btn.addEventListener("click", () => set(!row.hasAttribute("data-open")));
  });

  if (!hasGsap) return;
  gsap.registerPlugin(ScrollTrigger);

  /* ---------------- Smooth scroll ---------------- */
  let lenis = null;
  if (!reduced && typeof Lenis !== "undefined") {
    lenis = new Lenis({ lerp: 0.09 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      lenis ? lenis.scrollTo(target, { duration: 1.6 }) : target.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    });
  });

  if (reduced) return;

  /* ---------------- Hero intro + scroll-away ---------------- */
  const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
  intro
    .to(".ch", { y: 0, duration: 1.6, stagger: 0.07 }, 0.15)
    .to(".hero .reveal", { opacity: 1, y: 0, duration: 1.2, stagger: 0.1 }, 0.9)
    .set(".hero__fit", { clipPath: "none" });

  gsap.to(".hero__word", {
    yPercent: -45, opacity: 0.2, ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
  });
  ScrollTrigger.create({
    trigger: ".hero", start: "top top", end: "bottom top",
    onUpdate: (st) => { T.scroll = st.progress; },
  });

  /* ---------------- Statement: words light up in reading order ---------------- */
  const text = document.querySelector("[data-words]");
  text.innerHTML = text.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(" ");
  gsap.to(text.querySelectorAll(".w"), {
    opacity: 1, ease: "none", stagger: 0.12,
    scrollTrigger: { trigger: ".statement", start: "top top", end: "+=130%", pin: ".statement__pin", scrub: 0.6 },
  });

  /* ---------------- Work: pinned horizontal pan (desktop only) ---------------- */
  const mm = gsap.matchMedia();
  mm.add("(min-width: 768px)", () => {
    const track = document.querySelector("[data-track]");
    const distance = () => track.scrollWidth - innerWidth;
    const pan = gsap.to(track, {
      x: () => -distance(), ease: "none",
      scrollTrigger: {
        trigger: ".work", start: "top top", end: () => "+=" + distance(),
        pin: true, scrub: 1, invalidateOnRefresh: true,
        onUpdate: (st) => gsap.set("[data-progress]", { scaleX: st.progress }),
      },
    });
    document.querySelectorAll(".panel").forEach((panel) => {
      ScrollTrigger.create({
        trigger: panel, containerAnimation: pan, start: "left 72%", end: "right 28%",
        toggleClass: "is-active",
      });
      const img = panel.querySelector("img");
      if (img) {
        gsap.fromTo(img, { xPercent: -5, scale: 1.12 }, {
          xPercent: 5, scale: 1.12, ease: "none",
          scrollTrigger: { trigger: panel, containerAnimation: pan, start: "left right", end: "right left", scrub: true },
        });
      }
    });
  });

  /* ---------------- What I make + close: gentle reveals ---------------- */
  ScrollTrigger.create({
    trigger: ".make", start: "top bottom", end: "bottom top",
    onUpdate: (st) => { W.scroll = st.progress; },
  });
  gsap.from(".make__title, .row", {
    y: 40, opacity: 0, duration: 1.2, ease: "expo.out", stagger: 0.08,
    scrollTrigger: { trigger: ".make__inner", start: "top 85%" },
  });
  gsap.from(".close > *", {
    y: 60, opacity: 0, duration: 1.4, ease: "expo.out", stagger: 0.12,
    scrollTrigger: { trigger: ".close", start: "top 70%" },
  });

  /* ---------------- Magnetic buttons ---------------- */
  if (finePointer) {
    document.querySelectorAll(".magnetic").forEach((el) => {
      const xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.3);
        yTo((e.clientY - r.top - r.height / 2) * 0.4);
      });
      el.addEventListener("pointerleave", () => { xTo(0); yTo(0); });
    });
  }

  addEventListener("load", () => ScrollTrigger.refresh());
})();
