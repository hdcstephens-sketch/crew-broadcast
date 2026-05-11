# Brooks School Crew Broadcast App

Live broadcast control system for rowing regattas. Runs on Railway, accessible from any device on the network.

---

## Logins

| Username | Password | Role |
|---|---|---|
| admin | admin123 | Full access |
| coach | crew2024 | Control + monitor |
| staff | staff456 | Commentary mic only |

---

## Pages

| URL | Purpose |
|---|---|
| `/` | Login |
| `/control.html` | **Main broadcast control** (admin) |
| `/setup.html` | Roster, schedule, presets (admin) |
| `/audio.html` | Staff commentary mic |
| `/overlay.html` | OBS browser source — add this URL in OBS |
| `/monitor.html` | Commentary monitor audio |

---

## OBS Setup

1. In OBS, add a **Browser Source**
2. Set URL to `https://your-railway-url/overlay.html`
3. Width: **1920**, Height: **1080**
4. Check **Shutdown source when not visible** = OFF

The Overlay and Monitor links are in the topbar of `/control.html` (top right).

---

## Before Race Day — Setup

### 1. Enter the roster (Setup → Boats tab)

**Option A — CSV Import (fastest):**
1. Open Google Sheets or Excel
2. Three columns: `Boat`, `Name`, `Seat`
3. Copy all rows (including header)
4. Go to Setup → Boats → **CSV Import**
5. Paste → Import → **Save** (Cmd+S)

Valid boat names:
- `Boys Varsity 1` through `Boys Varsity 4`
- `Boys JV 1`, `Boys JV 2`
- `Girls Varsity 1` through `Girls Varsity 4`
- `Girls JV 1`, `Girls JV 2`

Shorthands also work: `BV1`, `GV2`, `BJV1`, `GJV2`, etc.

Seat options: `Stroke`, `Cox`, `Bow`, `2`–`7`

**Sample CSV** is available at `/sample-roster.csv` — replace the names with your athletes.

**Option B — Manual:**
Select a boat in the left panel → click **+ Add Athlete** → type name and seat.

---

### 2. Build the schedule (Setup → Schedule tab)

Click **Import Schedule** and paste your race schedule in any format — times and race names are auto-detected. Or add races manually with **+ Add Race** and assign a boat to each.

---

### 3. Set presets (Setup → Presets tab)

Each race button on the control page triggers a preset. Check which overlay widgets each preset activates (race bar, timer, countdown, etc.).

---

## Race Day — Control Page

### Athlete Intro (before racing starts)
1. Expand **Athlete Intro** section
2. Set seconds per athlete with the slider
3. Hit **▶ Run Intro** — plays every Brooks athlete, Girls 6→1 then Boys 6→1
4. Hit **Stop** when done

### Starting a Race
1. Click the race in the **Schedule** section to select it
2. Hit the appropriate preset button (e.g. **Varsity** or **JV**)
3. The overlay activates with the race header

### Lower Third / Name Bug
- Expand **Lower Third** section
- Type name, title, school → **Show** / **Hide**

### Alerts
- Expand **Alerts** section
- Type message → **Flash** sends it as a broadcast-style alert on the overlay

### Timer & Countdown
- Control the race clock from the **Timer** section
- Set a target time and use **Countdown** for pre-race

---

## Audio Chain (admin control page only)

The commentary mic signal chain is: **EQ Low → EQ Mid → EQ High → Compressor → Gain → output**

- **EQ sliders**: Low shelf (120 Hz), Mid peak (1.8 kHz), High shelf (6 kHz). Range ±12 dB.
- **Comp**: Toggle on/off. Threshold slider sets the compression onset point.
- **Gain fader**: Master output level 0–150%.

Staff commentary is routed via the audio monitor to BlackHole (virtual audio device) for mixing into OBS.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Overlay not updating | Check WebSocket dot — should be green. Reload `/overlay.html` in OBS |
| No sound in monitor | Make sure commentary mic is started on `/audio.html` and BlackHole is selected as monitor device |
| CSV import fails | Check boat name matches exactly — see valid names above. Seat column is optional |
| Athletes not showing in intro | Go to Setup → Boats, confirm athletes are saved (Cmd+S after import) |
| Railway deploy stuck | Push a new commit — Railway auto-deploys on every push to `main` |
