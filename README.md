# Brooks Crew Cast

Live broadcast control system for Brooks School Crew — manages overlay graphics, race timing, coach audio, and real-time display for races.

## Pages

| URL | Role | Description |
|-----|------|-------------|
| `/` | Public | Sign-in page |
| `/control.html` | Admin | Broadcast control panel — overlay, timer, lanes, teams |
| `/audio.html` | Coach | Microphone / commentary controls |
| `/viewer.html` | Public | Live broadcast display |
| `/overlay.html` | OBS | Transparent overlay source for OBS Studio |

## Credentials

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Full control panel access |
| coach | crew2024 | Coach audio page |
| staff | staff456 | Control panel access |

## Running locally

```bash
npm install
npm start
```

App runs at `http://localhost:3000`.

## Deploying to Railway

1. Push to GitHub (`git push origin main`)
2. Railway auto-deploys on every push
3. Uses `process.env.PORT` automatically — no config needed

## Tech

- **Backend:** Node.js + Express + WebSocket (`ws`)
- **Auth:** JWT (8-hour tokens, stored in localStorage)
- **State:** JSON file in `data/state.json`
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
