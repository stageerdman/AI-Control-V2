/* ============================================================
   office-layout.js — turns an office config into a floor plan.
   Pure geometry: no DOM, no art, no story. See spec-office-config.md.

   Public: officeLayout(cfg) → PLAN
     cfg  = { teams: [{ id, members: [agentId…] }], solo: [agentId…], spare: n }
            spare = free solo desks (no owner yet — the Agent Creator builds bots there)
     PLAN = {
       W                    room width (≥ 1600; grows so pods never overflow)
       rows: [y…]           seat y of each desk row (1 or 2 rows)
       pods: [{ id, teamId|null, row, rug:{x,y,w,h}, seats:[seatId…] }]
       seats: { seatId: {x, y, row, pod} }
       home:  { agentId: seatId }        every configured agent's desk
       director: {x,y} · couch: [{x,y}] (couch-1..3)
       lanes: { back, mid } · gaps: [x]  (where walkers cross between lanes)
       spare: [seatId…]                  free desks (seat with no home)
       objects: { door, outbox, console, dossier, whiteboard, health, clock, safe, plaque } {x,y,w,h,stand?,label?}
       windows: [{x}] · lamps: [x]
     }
   Room is a dollhouse: wall y −40…380, floor 380…900, right column (400 wide)
   is the Director's corner (top) + the couch (bottom).
   ============================================================ */

const OL = { DX: 124, RUG: 140, GAP: 72, LEFT: 50, RIGHT: 440, MIN_W: 1600, STEP: 40, PER_POD: 7 };

function officeLayout(cfg) {
  /* blocks: one desk row per team (≤ 7), solo agents share neutral blocks */
  const blocks = [];
  (cfg.teams || []).forEach(t => {
    for (let i = 0; i < t.members.length; i += OL.PER_POD) blocks.push({ teamId: t.id, members: t.members.slice(i, i + OL.PER_POD) });
  });
  const solo = [...(cfg.solo || []), ...Array(cfg.spare || 0).fill(null)];
  for (let i = 0; i < solo.length; i += OL.PER_POD) blocks.push({ teamId: null, members: solo.slice(i, i + OL.PER_POD) });
  blocks.forEach(b => { b.w = (b.members.length - 1) * OL.DX + OL.RUG; });

  /* pack into ≤ 2 rows; widen the room until it fits */
  const pack = W => {
    const avail = W - OL.RIGHT - OL.LEFT; const rows = [[]]; let used = 0;
    for (const b of blocks) {
      const need = (rows[rows.length - 1].length ? OL.GAP : 0) + b.w;
      if (used + need > avail && rows[rows.length - 1].length) { rows.push([]); used = 0; }
      rows[rows.length - 1].push(b); used += (rows[rows.length - 1].length > 1 ? OL.GAP : 0) + b.w;
      if (b.w > avail) return null;
    }
    return rows.length <= 2 ? rows : null;
  };
  let W = OL.MIN_W, rows = pack(W);
  while (!rows && W < 6000) { W += OL.STEP; rows = pack(W); }
  rows = rows || [blocks];
  /* 3+ pods that happen to fit one row still use both rows — fills the floor evenly */
  const rowW = r => r.reduce((s, b, i) => s + b.w + (i ? OL.GAP : 0), 0);
  if (rows.length === 1 && blocks.length >= 3) rows.push(rows[0].splice(Math.ceil(blocks.length / 2)));

  const rowY = rows.length === 1 ? [604] : [530, 794];
  const plan = { W, rows: rowY, pods: [], seats: {}, home: {}, spare: [] };
  const areaL = OL.LEFT, areaR = W - OL.RIGHT;
  const count = {};
  rows.forEach((r, ri) => {
    let x = areaL + (areaR - areaL - rowW(r)) / 2;
    r.forEach(b => {
      const key = b.teamId || 'solo'; count[key] = count[key] || 0;
      const y = rowY[ri];
      const pod = { id: key + '@' + plan.pods.length, teamId: b.teamId, row: ri, rug: { x, y: y - 72, w: b.w, h: 136 }, seats: [] };
      b.members.forEach((agentId, i) => {
        const sid = `${key}-${++count[key]}`;
        plan.seats[sid] = { x: x + OL.RUG / 2 + i * OL.DX, y, row: ri, pod: pod.id };
        if (agentId) plan.home[agentId] = sid; else plan.spare.push(sid);
        pod.seats.push(sid);
      });
      plan.pods.push(pod);
      x += b.w + OL.GAP;
    });
  });

  plan.director = { x: W - 208, y: 512 };
  plan.couch = [{ x: W - 308, y: 798 }, { x: W - 222, y: 798 }, { x: W - 136, y: 798 }];
  plan.lanes = { back: 432, mid: 664 };
  /* crossing columns: left edge, every gap between row-0 rugs, the right column's edge */
  const r0 = plan.pods.filter(p => p.row === 0).sort((a, b) => a.rug.x - b.rug.x);
  plan.gaps = [30];
  r0.forEach((p, i) => { const n = r0[i + 1]; if (n) plan.gaps.push((p.rug.x + p.rug.w + n.rug.x) / 2); });
  plan.gaps.push(W - OL.RIGHT + 24);
  if (rows.length === 1) plan.gaps = []; /* one row: lanes never need crossing */

  /* the wall: door + ship corner on the LEFT, planning wall centred over the pods */
  const center = (areaL + areaR) / 2;
  const gx = Math.max(392, Math.min(center - 388, W - 400 - 40 - 776));
  plan.objects = {
    door: { x: 26, y: 136, w: 136, h: 250, stand: { x: 96, y: 414 }, label: 'Leave office' },
    clock: { x: 64, y: 40, w: 60, h: 60 },
    outbox: { x: 196, y: 262, w: 62, h: 86, stand: { x: 227, y: 424 } },
    console: { x: 282, y: 318, w: 72, h: 96, stand: { x: 318, y: 430 } },
    dossier: { x: gx, y: 96, w: 80, h: 112, label: 'Features' },
    whiteboard: { x: gx + 104, y: 44, w: 528, h: 264, stand: { x: gx + 104 + 300, y: 416 }, label: 'Whiteboard' },
    health: { x: gx + 104 + 528 + 28, y: 76, w: 116, h: 160, label: 'Health check' },
    /* the Director's wall: the project's safe (Access) and a tiny % plaque above it */
    safe: { x: W - 258, y: 112, w: 100, h: 104, label: 'Access' },
    plaque: { x: W - 278, y: 40, w: 140, h: 40 },
  };
  plan.windows = [];
  for (let x = gx + 776 + 70; x + 180 <= W - 440 && plan.windows.length < 2; x += 260) plan.windows.push({ x });
  plan.lamps = [];
  const nl = Math.max(3, Math.round(W / 520));
  for (let i = 0; i < nl; i++) plan.lamps.push(Math.round(W * (i + 0.5) / nl));
  return plan;
}
