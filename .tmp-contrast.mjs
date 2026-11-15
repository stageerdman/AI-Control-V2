const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (fg, a, bg) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
const L = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return ((x + 0.05) / (y + 0.05)).toFixed(2);
};
const W = hex('#ffffff');
const ink = hex('#241a44');
const soft = hex('#5b5280');
const coral = hex('#ff6f73');
const warmBg = mix(coral, 0.1, W);
const door = hex('#fff3f1');
const twilight = hex('#1a1430');
const scrim = mix(hex('#1a1430'), 0.84, W); // worst case: scrim over white
const cream = hex('#fff6e9');
const cream72 = mix(cream, 0.72, scrim);
const rows = [
  ['ink on panel', ink, W],
  ['ink-soft on panel', soft, W],
  ['ink on warm tint', ink, warmBg],
  ['ink-soft on warm tint (dt label)', soft, warmBg],
  ['ink-soft on door', soft, door],
  ['err #a3242a on panel', hex('#a3242a'), W],
  ['err on warm tint', hex('#a3242a'), warmBg],
  ['coral bar vs warm tint (non-text)', coral, warmBg],
  ['coral bar vs white (non-text)', coral, W],
  ['hero text #4a2600 on sun', hex('#4a2600'), hex('#ffc24b')],
  ['hero text on sun-deep', hex('#4a2600'), hex('#ff9b3d')],
  ['keep border .28 vs white', mix(ink, 0.28, W), W],
  ['select border line .1 vs white', mix(ink, 0.1, W), W],
  ['sky focus ring vs white', hex('#4ea8ff'), W],
  ['grape focus ring vs white', hex('#9b6cff'), W],
  ['cream on scrim', cream, scrim],
  ['cream-72 on scrim', cream72, scrim],
  ['ink-soft on stale (opacity .62)', mix(soft, 0.62, W), W],
  ['ink on bot pill .05', ink, mix(ink, 0.05, W)],
  ['ink on moved bot (sky .16)', ink, mix(hex('#4ea8ff'), 0.16, W)],
];
for (const al of [0.4, 0.45, 0.5, 0.55]) rows.push([`ink @${al} border vs white`, mix(ink, al, W), W]);
for (const [n, a, b] of rows) console.log(ratio(a, b).padStart(6), n);
void twilight;
