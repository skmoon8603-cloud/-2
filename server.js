'use strict';
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true }, pingInterval: 10000, pingTimeout: 20000 });
app.use(express.static('public'));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'RANDOM FOOTBALL' }));

const W = 1000, H = 600, MATCH_SECONDS = 180, rooms = new Map(), socketRoom = new Map();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const makeCode = () => crypto.randomInt(100000, 1000000).toString();
function makeRoom(code) {
  return { code, players: new Map(), ball: { x: W/2, y: H/2, vx: 0, vy: 0 }, score: [0,0], startedAt: null, timeLeft: MATCH_SECONDS, last: Date.now(), goalPause: 0, ended: false };
}
function roster(team) {
  const left = team === 0;
  return [
    { id: 0, role: 'FW', x: left ? 245 : 755, y: 300, number: 9 },
    { id: 1, role: 'MF', x: left ? 180 : 820, y: 190, number: 8 },
    { id: 2, role: 'DF', x: left ? 180 : 820, y: 410, number: 4 },
    { id: 3, role: 'GK', x: left ? 48 : 952, y: 300, number: 1 }
  ];
}
function publicState(room) {
  return {
    code: room.code, score: room.score, timeLeft: room.timeLeft,
    started: room.startedAt !== null, ended: room.ended,
    players: [...room.players.values()].map(p => ({ id:p.id, name:p.name, team:p.team, roster:p.roster, active:p.active })),
    ball: room.ball
  };
}
function broadcast(room) { io.to(room.code).emit('state', publicState(room)); }
function roomOf(socket) { const c = socketRoom.get(socket.id); return c ? rooms.get(c) : null; }
function resetKickoff(room) {
  room.ball = { x: W/2, y: H/2, vx: 0, vy: 0 };
  for (const p of room.players.values()) p.roster = roster(p.team);
  room.goalPause = 1.4;
}
function startIfReady(room) {
  if (room.players.size === 2 && room.startedAt === null) room.startedAt = Date.now();
}

io.on('connection', socket => {
  socket.on('createRoom', ({ name } = {}, ack = () => {}) => {
    let code; do { code = makeCode(); } while (rooms.has(code));
    const room = makeRoom(code);
    rooms.set(code, room);
    addPlayer(socket, room, name, ack);
  });
  socket.on('joinRoom', ({ code, name } = {}, ack = () => {}) => {
    code = String(code || '').replace(/\D/g, '').slice(0,6);
    const room = rooms.get(code);
    if (!room) return ack({ ok:false, error:'방 코드를 찾을 수 없어요.' });
    if (room.players.size >= 2) return ack({ ok:false, error:'방이 가득 찼어요.' });
    if (room.startedAt !== null) return ack({ ok:false, error:'이미 경기가 시작된 방이에요.' });
    addPlayer(socket, room, name, ack);
  });
  function addPlayer(sock, room, name, ack) {
    if (room.players.size >= 2) return ack({ ok:false, error:'방이 가득 찼어요.' });
    const team = room.players.size === 0 ? 0 : 1;
    const p = { id:sock.id, name:String(name || '플레이어').trim().slice(0,12) || '플레이어', team, roster:roster(team), active:0, input:{x:0,y:0,sprint:false,shoot:false,pass:false}, cooldown:0 };
    room.players.set(sock.id, p); socketRoom.set(sock.id, room.code); sock.join(room.code);
    ack({ ok:true, code:room.code, team, playerId:sock.id });
    sock.emit('notice', room.players.size === 2 ? '상대가 입장했어요. 경기 시작!' : '방을 만들었어요. 친구를 기다리는 중!');
    startIfReady(room); broadcast(room);
  }
  socket.on('input', data => {
    const room = roomOf(socket), p = room && room.players.get(socket.id);
    if (!p || room.ended || room.players.size !== 2) return;
    const d = data || {};
    p.input.x = clamp(Number(d.x) || 0, -1, 1);
    p.input.y = clamp(Number(d.y) || 0, -1, 1);
    p.input.sprint = !!d.sprint; p.input.shoot = !!d.shoot; p.input.pass = !!d.pass;
    if (d.switch && Date.now() - (p.lastSwitch || 0) > 250) { p.active = (p.active + 1) % 3; p.lastSwitch = Date.now(); }
  });
  socket.on('leaveRoom', () => leave(socket));
  socket.on('disconnect', () => leave(socket));
});
function leave(socket) {
  const code = socketRoom.get(socket.id); if (!code) return;
  const room = rooms.get(code); socketRoom.delete(socket.id);
  if (room) {
    room.players.delete(socket.id);
    io.to(code).emit('opponentLeft', '상대가 방을 나갔어요.');
    if (room.players.size === 0) rooms.delete(code); else { room.startedAt = null; room.ended = false; room.timeLeft = MATCH_SECONDS; broadcast(room); }
  }
}

// Authoritative server simulation: clients send controls only; positions, ball and goals are server-owned.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const dt = Math.min(0.05, Math.max(0, (now-room.last)/1000)); room.last = now;
    if (room.players.size !== 2 || room.startedAt === null || room.ended) { broadcast(room); continue; }
    room.timeLeft = Math.max(0, MATCH_SECONDS - Math.floor((now-room.startedAt)/1000));
    if (room.goalPause > 0) { room.goalPause -= dt; broadcast(room); continue; }
    for (const p of room.players.values()) {
      const teamDir = p.team === 0 ? 1 : -1;
      const speed = p.input.sprint ? 245 : 180;
      const active = p.roster[p.active];
      active.x = clamp(active.x + p.input.x*speed*dt, 24, 976);
      active.y = clamp(active.y + p.input.y*speed*dt, 24, 576);
      // Teammate AI: maintain formation and move toward play when the ball approaches.
      p.roster.forEach((r, i) => {
        if (i === p.active) return;
        const baseX = (p.team === 0 ? [245,180,180,48] : [755,820,820,952])[i];
        const baseY = [300,190,410,300][i];
        const danger = Math.abs(room.ball.x-r.x) < 260;
        const tx = danger ? clamp(room.ball.x - teamDir*75, p.team===0?75:600, p.team===0?400:925) : baseX;
        const ty = danger ? room.ball.y + (i===1?-65:i===2?65:0) : baseY;
        const dx=tx-r.x, dy=ty-r.y, dist=Math.hypot(dx,dy);
        if (dist>1) { const step=Math.min(dist,105*dt); r.x+=dx/dist*step; r.y+=dy/dist*step; }
      });
      p.cooldown = Math.max(0,p.cooldown-dt);
      const nearest = p.roster.map((r,i)=>({r,i,d:Math.hypot(r.x-room.ball.x,r.y-room.ball.y)})).sort((a,b)=>a.d-b.d)[0];
      if (nearest.d < 31) {
        if (p.input.shoot && p.cooldown===0) {
          const dx = teamDir, dy = clamp(p.input.y*0.48 + (room.ball.y-300)/900,-0.55,0.55);
          const mag = Math.hypot(dx,dy); room.ball.vx=dx/mag*520; room.ball.vy=dy/mag*520; p.cooldown=0.42;
        } else if (p.input.pass && p.cooldown===0) {
          room.ball.vx=teamDir*330; room.ball.vy=p.input.y*190; p.cooldown=0.3;
        } else if (!p.input.shoot && !p.input.pass) {
          room.ball.x += (nearest.r.x-room.ball.x)*0.15;
          room.ball.y += (nearest.r.y-room.ball.y)*0.15;
        }
      }
    }
    room.ball.x += room.ball.vx*dt; room.ball.y += room.ball.vy*dt;
    const friction=Math.pow(0.985,dt*30); room.ball.vx*=friction; room.ball.vy*=friction;
    if (room.ball.y<18 || room.ball.y>H-18) { room.ball.y=clamp(room.ball.y,18,H-18); room.ball.vy*=-0.72; }
    if (room.ball.x<8 || room.ball.x>W-8) {
      const inGoal = room.ball.y>225 && room.ball.y<375;
      if (inGoal) { if (room.ball.x<8) room.score[1]++; else room.score[0]++; io.to(room.code).emit('goal', room.score); resetKickoff(room); }
      else { room.ball.x=clamp(room.ball.x,8,W-8); room.ball.vx*=-0.72; }
    }
    if (room.timeLeft===0) { room.ended=true; const winner=room.score[0]===room.score[1]?'무승부':room.score[0]>room.score[1]?'BLUE':'RED'; io.to(room.code).emit('matchEnded',{score:room.score,winner}); }
    broadcast(room);
  }
}, 33);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`RANDOM FOOTBALL listening on ${PORT}`));
