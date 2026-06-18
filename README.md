# NERDNIA voice switchboard (Phase 2, Option B)

Tiny always-on relay for the per-voice lip-sync feature. It does **two** things:

1. Relays WebRTC signaling (SDP/ICE) between the GM dashboard and each player. **Audio never passes through here** — it's peer-to-peer, so this server adds ~0 audio latency.
2. Serves the player **join page** (`public/join.html`) over the host's HTTPS (required for microphone access).

## Files
- `server.js` — the relay + static file server.
- `public/join.html` — the player page (name + mic, WebRTC offer + control data channel).
- `package.json` — one dependency (`ws`).

## Deploy (one-time — GM does this, ~10 min)
Any free always-on Node host works. **Render** example:
1. Push this `switchboard/` folder to a GitHub repo (or use Render's "deploy from folder").
2. Render → **New → Web Service** → pick the repo.
3. Environment: **Node**. Build command: `npm install`. Start command: `npm start`.
4. Deploy. Render gives you an HTTPS URL like `https://nerdnia-voice.onrender.com`.

Railway / Fly.io are equivalent (Node service, `npm install` / `npm start`).

> Note: free tiers may sleep when idle and take ~30s to wake on the first hit. Open the join page once a couple of minutes before recording to wake it.

## Wire it to the dashboard
In `Nerdnia O&M Dashboard - Episode 1.html`, set the `§VOICE` constant:
```js
const VOICE_SIGNAL_URL = 'wss://nerdnia-voice.onrender.com';   // your host, wss:// (not https://)
```
Then in the Shift+L lip-sync panel, click **GO LIVE**.

## Player link
Players open the **root URL** of the same host: `https://nerdnia-voice.onrender.com/`
They type their name, click **Allow microphone & join**, and appear in the GM's Shift+L panel.

## Local dry run (optional, no account)
`server.js` runs anywhere Node ≥18 is installed. On a machine with Node:
`npm install && npm start`, then open `http://localhost:8080/` (localhost is a secure
context, so the mic works) and point the dashboard at `ws://localhost:8080`.
This box has no Node, so the dry run must be done elsewhere or skipped in favor of the cloud deploy.

## Security note
Pass 1 has no room password — anyone with the link can join and stream audio to the GM.
The GM's **KICK** button closes a bad connection. A shared room code can be added later if needed.
