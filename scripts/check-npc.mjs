// Simulates the NPC brain (src/floor/npc.ts) without WebGL: a fake scene clock,
// a fake ball that copies the prototype's frame() physics, and a seeded rng.
// Checks every behaviour in the brief's NPC list plus the tuning numbers.
//
//   node scripts/check-npc.mjs        (Node 22.18+ / 24: strips the TS types itself)
//
// Exits 1 if any check fails.

import { createNpc } from "../src/floor/npc.ts";
import { BALL_START, HEADLINES } from "../src/content.ts";

const PADS = HEADLINES.map((h) => h.pad);
const DT = 1 / 60;
const R = 0.62;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fake floor: the prototype's ball physics, pad detection, kick wiring and
 *  ball-versus-body collision, driving the real brain. */
function makeWorld(seed = 1) {
  const w = {
    now: 0,
    ball: { x: BALL_START.x, z: BALL_START.z, vx: 0, vz: 0, by: 0, bvy: 0 },
    target: null,
    keys: { x: 0, z: 0 },
    lastInputAt: -9999,
    onPad: -1,
    out: null,
    kicks: [],
    npc: null,
  };
  w.npc = createNpc(PADS, w.now, mulberry32(seed));
  w.out = { x: -3.5, z: -3.5, facing: 0, pose: { state: "idle", speed: 0, kick: 0, paddling: false, swing: 0, activity: null }, kick: null };

  /** Visitor input: a held key direction, or a click target. */
  w.hold = (x, z) => { w.keys = { x, z }; if (x || z) { w.lastInputAt = w.now; w.npc.userTookBall(); } };
  w.click = (x, z) => { w.target = { x, z }; w.lastInputAt = w.now; w.npc.userTookBall(); };

  w.tick = () => {
    w.now += DT * 1000;
    const b = w.ball;
    let ax = w.keys.x, az = w.keys.z;
    if (ax || az) w.lastInputAt = w.now;          // a held key keeps refreshing the last input
    if (w.target) {
      const dx = w.target.x - b.x, dz = w.target.z - b.z, d = Math.hypot(dx, dz);
      if (d < 0.25) w.target = null;
      else { const s = Math.min(1, d / 2.5); ax = dx / d * s; az = dz / d * s; }
    }
    const m = Math.hypot(ax, az); if (m > 1) { ax /= m; az /= m; }
    b.vx += ax * 30 * DT; b.vz += az * 30 * DT;
    const damp = Math.exp(-3.4 * DT); b.vx *= damp; b.vz *= damp;
    b.x += b.vx * DT; b.z += b.vz * DT;
    const rr = Math.hypot(b.x, b.z); if (rr > 17) { b.x *= 17 / rr; b.z *= 17 / rr; }
    b.bvy -= 18 * DT; b.by += b.bvy * DT; if (b.by < 0) { b.by = 0; b.bvy = b.bvy < -2 ? -b.bvy * 0.42 : 0; }
    let on = -1;
    PADS.forEach((p, i) => { if (Math.hypot(p.x - b.x, p.z - b.z) < 2.2) on = i; });
    w.onPad = on;

    const px = w.out.x, pz = w.out.z;
    const out = w.npc.step({
      now: w.now, dt: DT, ballX: b.x, ballZ: b.z, ballHeight: b.by,
      ballSpeed: Math.hypot(b.vx, b.vz),
      steering: !!(w.keys.x || w.keys.z || w.target),
      lastInputAt: w.lastInputAt, onPad: on,
    });
    w.out = out;
    if (out.kick) {
      const kx = out.kick.x - b.x, kz = out.kick.z - b.z, kl = Math.hypot(kx, kz) || 1;
      w.kicks.push({ at: w.now, from: on, dest: out.kick, dist: Math.hypot(px - b.x, pz - b.z), swing: out.pose.swing, paddling: out.pose.paddling,
        kickPose: out.pose.kick, facing: out.facing, bx: b.x, bz: b.z });
      w.target = { x: out.kick.x, z: out.kick.z }; b.vx = kx / kl * 7; b.vz = kz / kl * 7; b.bvy = 4.6;
      Object.assign(w.kicks.at(-1), { speed: Math.hypot(b.vx, b.vz), bvy: b.bvy });
    }
    // ball-versus-body collision (lives in scene.ts; prototype offset 42310)
    const bx = b.x - px, bz = b.z - pz, bd = Math.hypot(bx, bz);
    if (bd < R + 0.5 && b.by < 0.5 && out.pose.state !== "chase") {
      const nx = bd > 0.001 ? bx / bd : 1, nz = bd > 0.001 ? bz / bd : 0;
      b.x = px + nx * (R + 0.5); b.z = pz + nz * (R + 0.5);
      const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= 1.5 * vn * nx; b.vz -= 1.5 * vn * nz; }
    }
    return out;
  };
  w.runUntil = (ms, each) => { while (w.now < ms) { const o = w.tick(); if (each && each(o, w) === false) return; } };
  return w;
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n      ${detail}` : ""}`);
}
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const f2 = (n) => n.toFixed(2);

/* 1. Forehand hits: after the first pass (always a kick), about half of his
      passes are a pickleball forehand from paddle reach, the ball leaving at
      the swing's contact point; the paddle is out for every hit. */
{
  let firstHits = 0, total = 0, hits = 0, badReach = 0, badContact = 0, noPaddle = 0, passes = 0, offAim = 0, worst = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const w = makeWorld(seed);
    w.runUntil(400000);
    w.kicks.forEach((k, i) => {
      const hit = k.swing > 0;
      // the ball leaves the way he faces (never behind him)
      const aim = angDiff(k.facing, Math.atan2(k.dest.x - k.bx, k.dest.z - k.bz));
      passes++; worst = Math.max(worst, aim); if (aim > 0.45) offAim++;
      if (i === 0) { if (hit) firstHits++; return; }
      total++;
      if (!hit) return;
      hits++;
      if (!(k.dist > 1.4 && k.dist < 1.95)) badReach++;
      if (!(k.swing > 0.5 && k.swing < 0.62)) badContact++;
      if (!k.paddling) noPaddle++;
    });
  }
  check("after the first pass, ~50% of passes are forehands (the first is always a kick)",
    firstHits === 0 && Math.abs(hits / total - 0.5) < 0.05, `${hits}/${total} = ${f2(hits / total)}; first-pass forehands ${firstHits}`);
  check("forehands send the ball from paddle reach at the swing's contact, paddle out",
    hits > 0 && badReach === 0 && badContact === 0 && noPaddle === 0,
    `${hits} hits; off reach ${badReach}, off contact ${badContact}, without paddle ${noPaddle}`);
  check("every pass (kick or forehand) goes the way he faces, within 26°",
    passes > 0 && offAim === 0, `${passes} passes; off aim ${offAim}; worst ${f2(worst)} rad`);
}

/* 2. First pass: untouched, he starts the chase at 12 s and passes the ball onto a pad. */
{
  const w = makeWorld(2);
  let chaseAt = null, maxRun = 0;
  w.runUntil(16000, (o) => {
    if (o.pose.state === "chase") { chaseAt ??= w.now; maxRun = Math.max(maxRun, o.pose.speed); }
    if (w.kicks.length) return false;
  });
  const k = w.kicks[0];
  const toPad = k && PADS.some((pp) => pp.x === k.dest.x && pp.z === k.dest.z);
  check("untouched, he runs to the ball at 12 s, lines up behind it and kicks it onto a pad (from ~1.15, at the strike's contact, ball speed 7, bvy 4.6)",
    chaseAt > 12000 && chaseAt < 12000 + 20 && toPad && k && k.dist > 1.0 && k.dist < 1.35 && k.kickPose > 0.4 && k.kickPose < 0.52 && Math.abs(k.speed - 7) < 1e-9 && k.bvy === 4.6,
    `chase began ${f2(chaseAt / 1000)} s; kick at ${k && f2(k.at / 1000)} s from ${k && f2(k.dist)} away to (${k && k.dest.x}, ${k && k.dest.z}) at speed ${k && f2(k.speed)}, bvy ${k && k.bvy}; top chase speed ${f2(maxRun)}`);
  check("chase speed tops out at 6.2", maxRun <= 6.2 + 1e-9 && maxRun > 5.5, `max ${maxRun.toFixed(3)}`);
  const kickPoses = [];
  w.runUntil(w.now + 450, (o) => { kickPoses.push(o.pose.kick); });
  const nonzero = kickPoses.filter((v) => v > 0);
  check("the strike follows through to the end (~0.3 s after contact)",
    nonzero.length >= 15 && nonzero.length <= 22 && nonzero.every((v, i) => i === 0 || v > nonzero[i - 1]) && nonzero.at(-1) > 0.9,
    `${nonzero.length} frames of kick, last ${f2(nonzero.at(-1))}`);
}

/* 3. Kick destinations (after the first pass): 65% to a pad off a pad, 50% on a pad, never the same pad; 45 s cooldown. */
{
  let offPad = 0, offPadToPad = 0, onPad = 0, onPadToPad = 0, samePad = 0, minGap = Infinity;
  for (let seed = 1; seed <= 300; seed++) {
    const w = makeWorld(seed);
    w.runUntil(600000);
    for (let i = 0; i < w.kicks.length; i++) {
      const k = w.kicks[i];
      if (i > 0) minGap = Math.min(minGap, k.at - w.kicks[i - 1].at);
      if (i === 0) continue;              // the first pass always goes to a pad (section 2)
      const toPad = !(k.dest.x === BALL_START.x && k.dest.z === BALL_START.z);
      if (k.from < 0) { offPad++; if (toPad) offPadToPad++; }
      else {
        onPad++; if (toPad) onPadToPad++;
        if (toPad && PADS[k.from].x === k.dest.x && PADS[k.from].z === k.dest.z) samePad++;
      }
    }
  }
  const pOff = offPadToPad / offPad, pOn = onPadToPad / onPad;
  check("off a pad he aims for a pad ~65% of the time", Math.abs(pOff - 0.65) < 0.03, `${offPadToPad}/${offPad} = ${f2(pOff)}`);
  check("on a pad he aims for another pad ~50% of the time, never the same pad",
    Math.abs(pOn - 0.5) < 0.04 && samePad === 0, `${onPadToPad}/${onPad} = ${f2(pOn)}; same-pad passes ${samePad}`);
  check("kicks are at least 45 s apart", minGap >= 45000, `shortest gap ${Math.round(minGap)} ms`);
}

/* 4. Lit pad: runs beside it, fist-pumps ~1.9 s after arriving, then watches. */
{
  const w = makeWorld(3);
  w.click(PADS[2].x, PADS[2].z);                     // visitor rolls the ball onto pad 2
  let arrived = null, cheerFrom = null, cheerTo = null, watchAt = null, lastOut = null, maxRun = 0;
  w.runUntil(20000, (o) => {
    lastOut = o;
    if (o.pose.state === "run") maxRun = Math.max(maxRun, o.pose.speed);
    if (o.pose.state === "cheer") { cheerFrom ??= w.now; cheerTo = w.now; }
    if (o.pose.state === "watch") watchAt ??= w.now;
    if (arrived === null && (o.pose.state === "cheer" || o.pose.state === "watch")) arrived = w.now;
  });
  const p = PADS[2], sx = p.x * 0.72, sz = p.z * 0.72 - 0.6;
  const off = Math.hypot(lastOut.x - sx, lastOut.z - sz);
  check("runs beside a lit pad at (p.x*0.72, p.z*0.72-0.6), at 6.2",
    off < 0.5 && maxRun <= 6.2 + 1e-9 && maxRun > 5.5, `${f2(off)} from the spot; top run speed ${maxRun.toFixed(3)}`);
  const cheerMs = cheerTo - cheerFrom + DT * 1000;
  check("fist-pumps ~1.9 s then watches, facing 0.35",
    Math.abs(cheerMs - 1900) < 40 && watchAt > cheerTo && lastOut.pose.state === "watch" && angDiff(lastOut.facing, 0.35) < 0.01,
    `cheer ${Math.round(cheerMs)} ms (from ${f2(cheerFrom / 1000)} s), then watch; facing ${f2(lastOut.facing)}`);
}

/* 5. Visitor parks the ball on a pad: he never kicks it off. */
{
  const w = makeWorld(4);
  w.click(PADS[0].x, PADS[0].z);
  w.runUntil(120000);
  check("ball the visitor parked on a pad stays there (no kick in 120 s)",
    w.kicks.length === 0 && w.onPad === 0, `kicks ${w.kicks.length}; ball still on pad ${w.onPad}`);
}

/* 6. He passed it onto a pad: kicks it off only after 6 s on the pad; a visitor touch revokes it. */
{
  let checked = 0, minWait = Infinity, revokedKicks = 0, revokedRuns = 0;
  for (let seed = 1; seed <= 200 && checked < 40; seed++) {
    const w = makeWorld(seed);
    let padSince = null, pad = -1, waits = [];
    w.runUntil(90000, (o, ww) => {
      if (ww.onPad !== pad) { pad = ww.onPad; padSince = ww.now; }
      const k = ww.kicks.at(-1);
      if (k && k.at === ww.now && k.from >= 0) waits.push(ww.now - padSince);
    });
    if (waits.length) { checked++; minWait = Math.min(minWait, ...waits); }
  }
  check("kicks off a pad he passed to only after 6 s there", checked > 0 && minWait > 6000,
    `${checked} runs with pad kick-offs; shortest wait on a pad ${Math.round(minWait)} ms`);

  for (let seed = 1; seed <= 200 && revokedRuns < 20; seed++) {
    const w = makeWorld(seed);
    let landed = false;
    w.runUntil(60000, (o, ww) => { if (ww.kicks.length && ww.onPad >= 0 && ww.target === null && Math.hypot(ww.ball.vx, ww.ball.vz) < 0.2) { landed = true; return false; } });
    if (!landed) continue;
    const pad = w.onPad, kicksBefore = w.kicks.length;
    w.click(w.ball.x + 0.1, w.ball.z);            // visitor nudges it, still on the pad
    w.runUntil(w.now + 60000);
    revokedRuns++;
    if (w.kicks.length > kicksBefore || w.onPad !== pad) revokedKicks++;
  }
  check("after the visitor touches a ball he passed onto a pad, he leaves it", revokedRuns > 0 && revokedKicks === 0,
    `${revokedRuns} runs; kicked anyway in ${revokedKicks}`);
}

/* 7. Never touches the ball while the visitor steers; waits 3 s after the last input. */
{
  const w = makeWorld(5);
  let chase = 0, minDist = Infinity;
  // drive the ball in a slow circle around his start for 30 s
  w.runUntil(30000, (o, ww) => {
    const a = ww.now / 3000;
    ww.hold(Math.cos(a), Math.sin(a));
    if (o.pose.state === "chase") chase++;
  });
  check("while a key is held he never chases or kicks", chase === 0 && w.kicks.length === 0, `chase frames ${chase}, kicks ${w.kicks.length} over 30 s`);

  w.hold(0, 0);
  const released = w.lastInputAt;
  let chaseAt = null;
  w.runUntil(w.now + 15000, (o) => { if (o.pose.state === "chase") { chaseAt ??= w.now; } });
  check("he waits 3 s after the last input before going for the ball",
    chaseAt !== null && chaseAt - released > 3000,
    `released at ${f2(released / 1000)} s, chase began ${chaseAt && f2(chaseAt / 1000)} s (+${chaseAt && Math.round(chaseAt - released)} ms)`);

  const w2 = makeWorld(6);
  w2.click(12, 4);                                    // a pending click target counts as steering
  let chase2 = 0;
  w2.runUntil(9500, (o, ww) => { if (o.pose.state === "chase" && ww.target) chase2++; });
  check("a pending click target also keeps him off the ball", chase2 === 0, `chase frames with a target pending: ${chase2}`);

  const w3 = makeWorld(7);
  w3.runUntil(8000);
  w3.ball.vx = 1.6; w3.ball.vz = 0;                   // keep the ball rolling at >= 1.5
  let chase3 = 0;
  w3.runUntil(12000, (o, ww) => { ww.ball.vx = 1.6; if (o.pose.state === "chase") chase3++; });
  check("he leaves a ball rolling at 1.5 or faster alone", chase3 === 0, `chase frames ${chase3}`);
}

/* 8. Wanders near the ball at 2.3, faces it when standing. */
{
  let walks = 0, paddles = 0, maxWalk = 0, badTarget = 0, faceSamples = 0, faceOff = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const w = makeWorld(seed);
    w.lastInputAt = 1e12;                             // the input guard keeps him off the ball
    let prev = "idle", idleFromWalk = false, paddledThisIdle = false, walkStart = null;
    w.runUntil(600000, (o, ww) => {
      ww.lastInputAt = ww.now;
      const s = o.pose.state;
      if (s === "walk") { maxWalk = Math.max(maxWalk, o.pose.speed); if (prev !== "walk") walkStart = { x: o.x, z: o.z }; }
      if (prev === "walk" && s === "idle") {
        walks++; idleFromWalk = true; paddledThisIdle = false;
        if (o.x < -14.5 || o.x > 14.5 || o.z < -13.5 || o.z > 6.5 || Math.abs(o.x - ww.ball.x) > 7.5) badTarget++;
      }
      if (s === "idle" && idleFromWalk && o.pose.paddling) paddledThisIdle = true;
      if (prev === "idle" && s !== "idle" && idleFromWalk) { if (paddledThisIdle) paddles++; idleFromWalk = false; }
      if (s === "idle" && !o.pose.paddling && !o.pose.activity && o.pose.speed < 0.05 && idleFromWalk) {
        // after turning settles, he should face the ball
        faceSamples++;
        if (angDiff(o.facing, Math.atan2(ww.ball.x - o.x, ww.ball.z - o.z)) > 0.15) faceOff++;
      }
      prev = s;
    });
  }
  check("wanders near the ball (x within ±7 of it, clamps ±14, z −13..6) at 2.3",
    walks > 1000 && badTarget === 0 && maxWalk <= 2.3 + 1e-9 && maxWalk > 2.2, `${walks} walks; off-limits ${badTarget}; top walk speed ${maxWalk.toFixed(3)}`);
  check("faces the ball when standing", faceSamples > 0 && faceOff / faceSamples < 0.05,
    `${faceSamples - faceOff}/${faceSamples} settled idle frames within 0.15 rad of the ball`);
}

/* 9. Self-demo: left alone for 30 s, the ball reaches a pad. */
{
  let lit = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const w = makeWorld(seed);
    let hit = false;
    w.runUntil(30000, (o, ww) => { if (ww.onPad >= 0) { hit = true; return false; } });
    if (hit) lit++;
  }
  check("left idle for 30 s, he passes the ball onto a pad (page demos itself)", lit >= 90, `${lit}/100 seeds lit a pad within 30 s`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
