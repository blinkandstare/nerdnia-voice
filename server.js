/* ════════════════════════════════════════════════════════════════
   NERDNIA voice switchboard — Phase 2, Option B (cloud-hosted)
   ----------------------------------------------------------------
   Relays one "is this player talking" BOOLEAN from each player to the GM
   dashboard (§REMOTE-VAD, v2). Each player's browser analyses its OWN mic
   locally and decides for itself; NO audio and NO WebRTC pass through here,
   so it adds ~0 latency and needs no STUN/TURN. This same
   process also serves the player join page (public/join.html) over the
   platform's HTTPS, which is required for getUserMedia.

   Roles per room: one HOST (the GM dashboard) + up to 3 PLAYERS.
   Single global room (one show). Add rooms later if ever needed.

   Deploy (Render / Railway / Fly — free always-on tier):
     - Node service, install:  npm install   start:  npm start
     - The platform gives you HTTPS + wss automatically.
     - GM dashboard connects to:  wss://<your-host>
     - Players open:              https://<your-host>/
   No secrets, no audio, nothing to launch each session.
   ════════════════════════════════════════════════════════════════ */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;

/* ── static file server: serves the player join page ─────────── */
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
    const reqPath = req.url === '/' ? '/join.html' : req.url.split('?')[0];
    const safe = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    const full = path.join(PUBLIC_DIR, safe);
    if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
    fs.readFile(full, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
    });
});

/* ── signaling relay ─────────────────────────────────────────── */
const wss     = new WebSocketServer({ server });
let   host    = null;          // the single dashboard socket
const players = new Map();     // connId -> ws

let _seq = 1;
const newId = () => 'p' + (_seq++) + '-' + Math.random().toString(36).slice(2, 7);
const send  = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

wss.on('connection', (ws) => {
    ws.role = null;
    ws.connId = null;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        /* dashboard announces itself */
        if (msg.type === 'hello' && msg.role === 'host') {
            host = ws; ws.role = 'host';
            /* replay current players so a (re)connecting host sees them */
            for (const [connId, pws] of players) send(host, { type: 'peer-join', connId, name: pws.name });
            return;
        }

        /* player announces itself */
        if (msg.type === 'hello' && msg.role === 'player') {
            ws.role = 'player';
            ws.connId = newId();
            ws.name = String(msg.name || 'Player').slice(0, 40);
            players.set(ws.connId, ws);
            send(ws, { type: 'welcome', connId: ws.connId });
            send(host, { type: 'peer-join', connId: ws.connId, name: ws.name });
            return;
        }

        /* §REMOTE-VAD — player -> host mouth STATE. The phone owns the decision and sends a
           versioned boolean; this relay validates and forwards, it never interprets audio.
           ⛔ STRICT v2, NO v1 ADAPTER. It used to rebuild the message as { ..., level: msg.level },
           which would silently DISCARD v and talking. A cached v1 page now stops here and its mouth
           closes on the dashboard's stale window — fail-closed beats being misread as speech.
           ⛔ Never forward the player's object as-is, and never accept string truthiness. */
        if (msg.type === 'mouth' && ws.role === 'player') {
            if (msg.v !== 2 || typeof msg.talking !== 'boolean') return;
            send(host, { type: 'mouth', from: ws.connId, v: 2, talking: msg.talking });
            return;
        }

        /* host -> player control (kick) */
        if (ws.role === 'host') {
            if (msg.type === 'kick') {
                const pws = players.get(msg.connId);
                if (pws) { send(pws, { type: 'kicked' }); pws.close(); }
                return;
            }
        }
    });

    ws.on('close', () => {
        if (ws.role === 'host') { if (host === ws) host = null; return; }
        if (ws.role === 'player' && ws.connId) {
            players.delete(ws.connId);
            /* network drop — host decides what to do (hold seat / reconnecting). */
            send(host, { type: 'peer-drop', connId: ws.connId });
        }
    });
});

server.listen(PORT, () => console.log('NERDNIA switchboard listening on :' + PORT));
