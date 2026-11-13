# Robot minions redesign — progress log (owner: hero.js / hero.css / gallery.js)

Task: BRIEF-v4.md §R + user-feedback-v4.md. Turn characters into cute robot minions; keep the
`hero()` interface (spec-cast §1.6) identical. Don't touch office-*.js, office.css, data-office.js,
cast.js, teams.js. Don't commit the generated `ai-control-disney-v3.html`.

## Checklist
- [x] R1 no legs / nothing humanlike — screen-face head, antenna, chassis, mitten arms, hover base
- [x] R2 hue = shell; 4 builds → 4 silhouettes (hero=squircle+jet, sprout=orb+pad, bruiser=box+wheel,
      lanky=dome on stalk neck+ring); role = headgear + tool + chassis decal + badge
- [x] R3 interface/pose names kept; seated = hover low (base hidden), walking = glide + lean
- [x] R4 calm motion: 4.2s hover bob + blink, slow gestures, no leg/arm swinging
- [ ] Visual QA: gallery sections, #cast, #cast/agent/a-pete, #cast/teams, #cast/teams/ship-it, #office
- [ ] Polish pass after QA

## Notes / gotchas
- HAIR names now = antenna styles; ACCESSORIES = screen/shell extras (names unchanged).
- Captain armband (px>=100) = band around chassis + star medallion; <100px still the fx pip.
- Never write `${O} class="o x"` (duplicate class attr; first wins) — write `class="o x"`.
- Screenshot helper: headless Chrome with fresh --user-data-dir, --force-prefers-reduced-motion not needed.
  Shots go to shots/r-*.png.

## Next
Run screenshots of all routes, judge, iterate; then final commit.
