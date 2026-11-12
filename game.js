'use strict';
const $ = id => document.getElementById(id);
const socket = io();
let myId = null, myTeam = null, roomCode = null, gameState = null, toastTimer = null;
const canvas = $('pitch'), ctx = canvas.getContext('2d');
const input = { x:0, y:0, sprint:false, shoot:false, pass:false };
let keyState = {}, joyPointer = null;
const rarity = [
  {name:'일반',key:'common',chance:55,min:48,max:65},
  {name:'희귀',key:'rare',chance:25,min:60,max:76},
  {name:'영웅',key:'hero',chance:12,min:72,max:86},
  {name:'전설',key:'legend',chance:6,min:83,max:95},
  {name:'신화',key:'myth',chance:92,min:92,max:99}
];
const positions = ['공격수','미드필더','수비수','골키퍼'];
const names = ['스피드 러너','파워 슈터','테크니션','철벽 수비수','세이브 마스터','플레이메이커','윙 스프린터','에이스 스트라이커'];
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2300)}
function message(msg){$('lobbyMessage').textContent=msg}
socket.on('connect',()=>{$('connection').textContent='● 서버 연결됨';$('connection').style.color='#65e0b5';message('서버에 연결됐어요. 방을 만들거나 코드를 입력하세요.')});
socket.on('disconnect',()=>{$('connection').textContent='● 연결 끊김';$('connection').style.color='#ff8188';message('서버 연결이 끊겼어요. 인터넷을 확인하고 새로고침하세요.')});
socket.on('notice',toast);
socket.on('opponentLeft',msg=>{toast(msg);$('matchStatus').textContent=msg;$('gamePanel').classList.add('hidden');$('lobby').classList.remove('hidden');myId=null;roomCode=null});
socket.on('goal',score=>toast('⚽ 골! '+score[0]+' : '+score[1]));
socket.on('matchEnded',r=>toast(r.winner==='무승부'?'경기 종료 · 무승부':`경기 종료 · ${r.winner==='BLUE'?'파랑 팀':'빨강 팀'} 승리!`));
socket.on('state',s=>{gameState=s;updateHud();draw()});
function onJoined(r){if(!r.ok){message(r.error||'입장할 수 없어요.');return}myId=r.playerId;myTeam=r.team;roomCode=r.code;$('roomCode').value=r.code;$('lobby').classList.add('hidden');$('gamePanel').classList.remove('hidden');$('matchStatus').textContent='방 '+r.code+' · '+(r.team===0?'파랑 팀':'빨강 팀');toast('방 입장 완료! 친구에게 코드 '+r.code+'를 알려주세요.');}
$('createRoom').onclick=()=>{if(!socket.connected)return message('서버 연결을 기다려 주세요.');socket.emit('createRoom',{name:$('playerName').value},onJoined)};
$('joinRoom').onclick=()=>{const code=$('roomCode').value.replace(/\D/g,'');if(code.length!==6)return message('6자리 방 코드를 입력하세요.');socket.emit('joinRoom',{name:$('playerName').value,code},onJoined)};
$('leaveRoom').onclick=()=>{socket.emit('leaveRoom');$('gamePanel').classList.add('hidden');$('lobby').classList.remove('hidden');myId=null;roomCode=null;gameState=null;message('방에서 나왔어요.')};
function updateHud(){if(!gameState)return;$('blueScore').textContent=gameState.score[0];$('redScore').textContent=gameState.score[1];const t=Math.max(0,gameState.timeLeft);$('timer').textContent=String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');$('matchStatus').textContent=gameState.started?'경기 진행 중 · '+(myTeam===0?'파랑 팀':'빨강 팀')+' · 선수 '+(myActive()+1):'친구가 입장하면 경기가 시작돼요.'}
function myActive(){const p=gameState?.players.find(x=>x.id===myId);return p?p.active:0}
function sendInput(){if(socket.connected&&myId)socket.emit('input',input)}
function action(name,on){if(name==='switch'){if(on){socket.emit('input',{...input,switch:true});}return}input[name]=on;sendInput()}
document.querySelectorAll('[data-action]').forEach(b=>{const a=b.dataset.action;b.addEventListener('pointerdown',e=>{e.preventDefault();action(a,true)});['pointerup','pointercancel','pointerleave'].forEach(ev=>b.addEventListener(ev,()=>action(a,false))) });
function updateFromKeys(){let x=0,y=0;if(keyState.w||keyState.arrowup)y--;if(keyState.s||keyState.arrowdown)y++;if(keyState.a||keyState.arrowleft)x--;if(keyState.d||keyState.arrowright)x++;const len=Math.hypot(x,y)||1;input.x=x/len;input.y=y/len;input.sprint=!!keyState.shift;input.shoot=!!keyState[' '];input.pass=!!keyState.e;sendInput()}
window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(k==='q'&&!e.repeat){action('switch',true);return}keyState[k]=true;updateFromKeys()});
window.addEventListener('keyup',e=>{keyState[e.key.toLowerCase()]=false;updateFromKeys()});
const joy=$('joystick'),stick=$('stick');
function joyMove(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.34,len=Math.hypot(dx,dy)||1,k=Math.min(1,max/len);const sx=dx*k,sy=dy*k;stick.style.transform=`translate(${sx}px,${sy}px)`;input.x=sx/max;input.y=sy/max;sendInput()}
joy.addEventListener('pointerdown',e=>{e.preventDefault();joyPointer=e.pointerId;joy.setPointerCapture(joyPointer);joyMove(e)});
joy.addEventListener('pointermove',e=>{if(e.pointerId===joyPointer)joyMove(e)});
function joyEnd(e){if(e.pointerId!==joyPointer)return;joyPointer=null;stick.style.transform='translate(0,0)';input.x=0;input.y=0;sendInput()}
joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);
function draw(){if(!gameState)return;ctx.clearRect(0,0,1000,600);for(let i=0;i<10;i++){ctx.fillStyle=i%2?'#16834d':'#1b8d55';ctx.fillRect(i*100,0,100,600)}
ctx.strokeStyle='rgba(255,255,255,.86)';ctx.lineWidth=4;ctx.strokeRect(12,12,976,576);ctx.beginPath();ctx.moveTo(500,12);ctx.lineTo(500,588);ctx.stroke();ctx.beginPath();ctx.arc(500,300,85,0,Math.PI*2);ctx.stroke();ctx.strokeRect(12,190,130,220);ctx.strokeRect(858,190,130,220);ctx.strokeRect(12,240,55,120);ctx.strokeRect(933,240,55,120);ctx.fillStyle='#f4f7ed';ctx.fillRect(0,240,12,120);ctx.fillRect(988,240,12,120);
for(const p of gameState.players){for(let i=0;i<p.roster.length;i++){const r=p.roster[i];ctx.beginPath();ctx.fillStyle=p.team===0?'#39a9ff':'#ff5964';ctx.arc(r.x,r.y,i===3?19:16,0,Math.PI*2);ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#fff';ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText(r.number,r.x,r.y+4);if(p.id===myId&&p.active===i){ctx.beginPath();ctx.arc(r.x,r.y,25,0,Math.PI*2);ctx.strokeStyle='#ffe66d';ctx.lineWidth=5;ctx.stroke();}}}
ctx.beginPath();ctx.arc(gameState.ball.x,gameState.ball.y,11,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#333';ctx.lineWidth=2;ctx.stroke();
if(gameState.players.length<2){ctx.fillStyle='#001b';ctx.fillRect(260,260,480,80);ctx.fillStyle='#fff';ctx.font='bold 25px sans-serif';ctx.textAlign='center';ctx.fillText('친구를 기다리는 중…',500,310)}if(gameState.ended){ctx.fillStyle='#001d';ctx.fillRect(250,245,500,110);ctx.fillStyle='#fff';ctx.font='bold 32px sans-serif';ctx.fillText('경기 종료',500,292);ctx.font='bold 22px sans-serif';ctx.fillText(`${gameState.score[0]} : ${gameState.score[1]}`,500,328)}}

// Local demo gacha; inventory is stored in this browser. Multiplayer lineup persistence is not yet account-based.
function inventory(){try{return JSON.parse(localStorage.getItem('rf_inventory')||'[]')}catch{return []}}
function renderInventory(){const items=inventory();$('collectionCount').textContent=items.length+'명';$('collection').innerHTML=items.length?items.slice().reverse().map(c=>`<div class="player-card rarity-${c.rarity.key}"><strong>${c.name}</strong><em>${c.rarity.name} · ${c.position}</em><div>OVR ${c.ovr}</div><div>속도 ${c.stats.speed} · 슛 ${c.stats.shoot}</div><div>패스 ${c.stats.pass} · 수비 ${c.stats.defense}</div><div>체력 ${c.stats.stamina} · GK ${c.stats.gk}</div></div>`).join(''):'<div class="empty">아직 획득한 선수가 없어요.</div>'}
function drawPlayer(){const roll=Math.random()*100;let sum=0,rar=rarity.find(r=>(sum+=r.chance)>=roll)||rarity[0];const val=()=>Math.floor(rar.min+Math.random()*(rar.max-rar.min+1));const c={id:Date.now()+Math.random(),name:names[Math.floor(Math.random()*names.length)],position:positions[Math.floor(Math.random()*positions.length)],rarity:rar,stats:{speed:val(),shoot:val(),pass:val(),defense:val(),stamina:val(),gk:val()}};c.ovr=Math.round((c.stats.speed+c.stats.shoot+c.stats.pass+c.stats.defense+c.stats.stamina+c.stats.gk)/6);const list=inventory();list.push(c);localStorage.setItem('rf_inventory',JSON.stringify(list));$('drawResult').innerHTML=`<div><b>${c.rarity.name} 선수 획득!</b><br>${c.name} · ${c.position} · OVR ${c.ovr}</div>`;$('drawResult').style.color=({common:'#d5e1e8',rare:'#6bbcff',hero:'#d5a0ff',legend:'#ffd17a',myth:'#ff8dc8'})[rar.key];renderInventory();}
$('drawPlayer').onclick=()=>{const b=$('drawPlayer');b.disabled=true;b.textContent='선수 확인 중…';$('drawResult').textContent='✨ 선수 뽑는 중…';setTimeout(()=>{drawPlayer();b.disabled=false;b.textContent='선수 뽑기 ×1'},650)};
renderInventory();
