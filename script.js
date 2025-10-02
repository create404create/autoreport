
const $ = sel => document.querySelector(sel);
const createEl = (tag, cls) => { const e = document.createElement(tag); if(cls) e.className = cls; return e; };

// Simple random helpers
const randInt = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const pick = (arr)=> arr[randInt(0, arr.length-1)];

// ----------------- DOM refs -----------------
const startBtn = $('#startBtn');
const pauseBtn = $('#pauseBtn');
const resumeBtn = $('#resumeBtn');
const stopBtn = $('#stopBtn');
const usernameInput = $('#username');
const logEl = $('#log');
const countEl = $('#count');
const inspectorPre = $('#inspectorPre');
const speedRange = $('#speedRange');
const autoScroll = $('#autoScroll');
const showPackets = $('#showPackets');
const exportCSV = $('#exportCSV');
const clearLogBtn = $('#clearLog');
const replayBtn = $('#replayBtn');
const undoBtn = $('#undoBtn');
const saveSessionBtn = $('#saveSessionBtn');
const loadSessionBtn = $('#loadSessionBtn');
const shareStateBtn = $('#shareStateBtn');
const loadBatchBtn = $('#loadBatchBtn');
const batchInput = $('#batchInput');
const presetSelect = $('#presetSelect');
const searchLog = $('#searchLog');
const muteBtn = $('#muteBtn');
const fullscreenBtn = $('#fullscreenBtn');
const helpBtn = $('#helpBtn');
const helpModal = $('#helpModal');
const closeHelp = $('#closeHelp');
const dontShowHelp = $('#dontShowHelp');
const consoleModal = $('#consoleModal');
const toggleConsoleBtn = $('#toggleConsoleBtn');
const closeConsole = $('#closeConsole');
const consoleOutput = $('#consoleOutput');
const copyConsole = $('#copyConsole');
const captchaModal = $('#captchaModal');
const captchaBtn = $('#captchaBtn');
const captchaShown = { val:false };
const copyBtn = $('#copyBtn');
const downloadLogsBtn = $('#downloadLogsBtn');
const fakeIpEl = $('#fakeIp');
const modeLabel = $('#modeLabel');
const statusBar = $('#statusBar');

// ----------------- State -----------------
let running = false;
let paused = false;
let intervalId = null;
let count = 0;
let logEntries = []; // {id, time, user, status, code, payload, severity}
let replayIndex = 0;
let lastEntry = null;
let batch = [];
let currentTarget = '';
let audioEnabled = true;
let dontShowHelpPref = localStorage.getItem('fox_dont_show_help') === 'true';
let showConsole = false;

// Load help preference
if(!dontShowHelpPref){ helpModal.classList.remove('hidden'); }

// ----------------- Sounds -----------------
const beep = () => {
  if(!audioEnabled) return;
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.02;
    o.start(); o.stop(ctx.currentTime + 0.08);
  }catch(e){/* ignore */}
}

// ----------------- Fake behaviours -----------------
const statusCodes = [200,202,429,500,403];
const severities = {200:'info',202:'success',429:'warn',500:'error',403:'warn'};

function makeFakePayload(user){
  return {
    username:user,
    action:'report',
    reason: pick(['spam','inappropriate','harassment','other']),
    timestamp: new Date().toISOString(),
    meta:{ ua: 'Mozilla/5.0 (FakeAgent)', loc: pick(['US','PK','GB','DE','IN']) }
  }
}

function fakeIp(){
  return `${randInt(11,223)}.${randInt(1,254)}.${randInt(1,254)}.${randInt(2,254)}`;
}

// ----------------- Matrix background -----------------
(function matrixBg(){
  const canvas = document.getElementById('matrix');
  const ctx = canvas.getContext('2d');
  let w,h;
  const cols = [];
  function resize(){ w=canvas.width=innerWidth; h=canvas.height=innerHeight; cols.length = Math.floor(w/14); for(let i=0;i<cols.length;i++) cols[i]=randInt(0, h); }
  window.addEventListener('resize', resize); resize();
  function tick(){ ctx.fillStyle='rgba(0,0,0,0.15)'; ctx.fillRect(0,0,w,h); ctx.fillStyle='rgba(0,255,70,0.09)'; ctx.font='13px monospace'; for(let i=0;i<cols.length;i++){ const text = String.fromCharCode(33+Math.floor(Math.random()*94)); ctx.fillText(text, i*14, cols[i]*13); cols[i] += 1; if(cols[i]*13 > h && Math.random()>0.975) cols[i]=0; } requestAnimationFrame(tick); }
  tick();
})();

// ----------------- Core simulation -----------------
function appendLog(entry){
  logEntries.unshift(entry);
  lastEntry = entry;
  renderLog();
}

function renderLog(){
  const q = (searchLog.value||'').toLowerCase();
  logEl.innerHTML = '';
  logEntries.forEach(e=>{
    if(q && !(e.user + ' ' + e.payload.reason + ' ' + e.status).toLowerCase().includes(q)) return;
    const div = createEl('div','entry');
    const left = createEl('div','left');
    left.innerHTML = `<div><strong>${e.user}</strong> <span class="muted">${new Date(e.time).toLocaleTimeString()}</span></div><div class="meta">${e.payload.reason} • ${e.status} (${e.code})</div>`;
    const right = createEl('div','right');
    right.innerHTML = `<div class="badge">${e.severity.toUpperCase()}</div>`;
    div.appendChild(left); div.appendChild(right);
    div.addEventListener('click', ()=> { inspectorPre.textContent = JSON.stringify(e, null, 2); $('#fakeIp').textContent = e.fakeIp; });
    logEl.appendChild(div);
  });
  if(autoScroll.checked) logEl.scrollTop = 0;
  countEl.textContent = count;
  modeLabel.textContent = running ? (paused? 'paused':'running') : 'idle';
}

function simulateOnce(user){
  // random jitter and possible captcha
  if(Math.random() < 0.03 && !captchaShown.val){ // 3% chance
    captchaShown.val = true; captchaModal.classList.remove('hidden'); return;
  }

  const payload = makeFakePayload(user);
  const code = pick(statusCodes);
  const severity = severities[code] || 'info';
  const entry = { id: Date.now() + Math.random(), time: Date.now(), user, status: severity.toUpperCase(), code, payload, severity, fakeIp: fakeIp() };

  // simulate progress bar (visual) using consoleOutput and small delay
  appendLog(entry);
  inspectorPre.textContent = JSON.stringify(entry, null, 2);
  $('#fakeIp').textContent = entry.fakeIp;
  count +=1;
  // packet animation: optional
  if(showPackets.checked){ const p = createEl('div','packet'); p.textContent='→'; p.style.position='absolute'; p.style.right='20px'; p.style.top=(100+randInt(0,200))+'px'; document.body.appendChild(p); setTimeout(()=>p.remove(),1200); }
  // sound
  if(audioEnabled) beep();
  // small random error & retry simulation
  if(code>=500 && Math.random()>0.4){ // retry
    setTimeout(()=>{ const retryEntry = {...entry, id:Date.now()+Math.random(), time:Date.now()+5000, code:202, status:'SUCCESS (RETRY)', severity:'success'}; appendLog(retryEntry); count+=1; if(autoScroll.checked) logEl.scrollTop = 0; }, randInt(800,1800));
  }
}

function startSimulation(){
  if(running) return;
  running = true; paused = false;
  currentTarget = usernameInput.value.trim() || batch.shift() || '[no-username]';
  if(batch.length===0 && batchInput.value.trim()){ batch = batchInput.value.split(',').map(s=>s.trim()).filter(Boolean); }
  statusBar.textContent = `Running — target: ${currentTarget}`;
  modeLabel.textContent = 'running';
  startBtn.disabled = true; pauseBtn.disabled = false; stopBtn.disabled = false; resumeBtn.disabled = true;

  // immediate first
  simulateOnce(currentTarget);

  const baseInterval = 5000; // base 5s
  function schedule(){
    const speedFactor = parseInt(speedRange.value, 10); // 1..10 (lower = faster when mapped)
    const interval = Math.max(400, baseInterval - (speedFactor*380));
    intervalId = setTimeout(()=>{
      if(!running || paused) return;
      // pick next target if batch available
      if(batch.length>0){ currentTarget = batch.shift(); }
      simulateOnce(currentTarget);
      schedule();
    }, interval + randInt(-400, 900));
  }
  schedule();
}

function pauseSimulation(){ if(!running || paused) return; paused=true; modeLabel.textContent='paused'; pauseBtn.disabled=true; resumeBtn.disabled=false; statusBar.textContent='Paused'; }
function resumeSimulation(){ if(!running||!paused) return; paused=false; modeLabel.textContent='running'; pauseBtn.disabled=false; resumeBtn.disabled=true; statusBar.textContent='Resumed'; }
function stopSimulation(){ running=false; paused=false; clearTimeout(intervalId); intervalId=null; statusBar.textContent='Stopped'; startBtn.disabled=false; pauseBtn.disabled=true; resumeBtn.disabled=true; stopBtn.disabled=true; }

// ----------------- UI wiring -----------------
startBtn.addEventListener('click', startSimulation);
pauseBtn.addEventListener('click', pauseSimulation);
resumeBtn.addEventListener('click', resumeSimulation);
stopBtn.addEventListener('click', stopSimulation);

presetSelect.addEventListener('change', ()=>{
  const v = presetSelect.value;
  if(v==='stealth'){ speedRange.value = 2; audioEnabled=false; muteBtn.textContent='🔇'; }
  if(v==='aggressive'){ speedRange.value = 9; audioEnabled=true; muteBtn.textContent='🔊'; }
  if(v==='silent'){ audioEnabled=false; muteBtn.textContent='🔇'; }
});

loadBatchBtn.addEventListener('click', ()=>{ batch = batchInput.value.split(',').map(s=>s.trim()).filter(Boolean); alert('Batch loaded: '+batch.join(', ')); });

clearLogBtn.addEventListener('click', ()=>{ if(confirm('Clear log?')){ logEntries=[]; count=0; renderLog(); } });
undoBtn.addEventListener('click', ()=>{ if(logEntries.length){ const removed = logEntries.shift(); appendConsole(`Undid entry for ${removed.user}`); renderLog(); } });

exportCSV.addEventListener('click', ()=>{
  const lines = ['time,user,status,code,reason'];
  logEntries.slice().reverse().forEach(e=> lines.push([new Date(e.time).toISOString(), e.user, e.status, e.code, e.payload.reason].map(s=>`"${String(s).replace(/"/g,'""')}"`).join(',')));
  const blob = new Blob([lines.join('\n')], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='foxreport_log.csv'; a.click(); URL.revokeObjectURL(url);
});

replayBtn.addEventListener('click', ()=>{
  if(logEntries.length===0) return alert('No entries to replay');
  // simple replay from oldest to newest
  const items = logEntries.slice().reverse();
  let i=0; consoleOutput.textContent += '\n-- replay start --\n';
  const rid = setInterval(()=>{
    if(i>=items.length){ clearInterval(rid); consoleOutput.textContent += '\n-- replay end --\n'; return; }
    const it=items[i]; consoleOutput.textContent += `[replay] ${new Date(it.time).toLocaleTimeString()} ${it.user} ${it.status}\n`;
    i++; logEl.scrollTop = 0;
  }, 400);
});

saveSessionBtn.addEventListener('click', ()=>{ const s = {username:usernameInput.value, batch:batchInput.value, speed:speedRange.value, log:logEntries}; localStorage.setItem('fox_demo_session', JSON.stringify(s)); alert('Session saved locally'); });
loadSessionBtn.addEventListener('click', ()=>{ const s = JSON.parse(localStorage.getItem('fox_demo_session')||'null'); if(!s) return alert('No saved session'); usernameInput.value = s.username||''; batchInput.value = s.batch||''; speedRange.value = s.speed||5; logEntries = s.log||[]; renderLog(); alert('Session loaded'); });

shareStateBtn.addEventListener('click', ()=>{
  const state = {username:usernameInput.value, batch:batchInput.value, speed:speedRange.value}; const hash = btoa(JSON.stringify(state)); prompt('Permalink (copy):', location.origin + location.pathname + '#state=' + hash);
});

copyBtn.addEventListener('click', ()=>{ navigator.clipboard.writeText(inspectorPre.textContent).then(()=> alert('Payload copied')); });

downloadLogsBtn.addEventListener('click', ()=>{
  const data = JSON.stringify(logEntries, null, 2); const blob = new Blob([data], {type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='foxreport_logs.json'; a.click(); URL.revokeObjectURL(url);
});

// help & modals
helpBtn.addEventListener('click', ()=> helpModal.classList.remove('hidden'));
closeHelp.addEventListener('click', ()=>{ helpModal.classList.add('hidden'); if(dontShowHelp.checked) localStorage.setItem('fox_dont_show_help','true'); });

toggleConsoleBtn.addEventListener('click', ()=>{ consoleModal.classList.toggle('hidden'); });
closeConsole.addEventListener('click', ()=>{ consoleModal.classList.add('hidden'); });
copyConsole.addEventListener('click', ()=>{ navigator.clipboard.writeText(consoleOutput.textContent).then(()=> alert('Console copied')) });

captchaBtn.addEventListener('click', ()=>{ captchaModal.classList.add('hidden'); captchaShown.val=false; appendConsole('CAPTCHA cleared (simulated)').then(()=>{}); });

// keyboard shortcuts
window.addEventListener('keydown', (e)=>{
  if(e.key.toLowerCase()==='h') helpModal.classList.remove('hidden');
  if(e.key.toLowerCase()==='s') startSimulation();
  if(e.key.toLowerCase()==='p') pauseSimulation();
  if(e.key.toLowerCase()==='r') resumeSimulation();
  if(e.key.toLowerCase()==='f') toggleFullScreen();
  if(e.key.toLowerCase()==='c') consoleModal.classList.toggle('hidden');
});

// fullscreen
function toggleFullScreen(){ if(!document.fullscreenElement){ document.documentElement.requestFullscreen(); } else { document.exitFullscreen(); } }
fullscreenBtn.addEventListener('click', toggleFullScreen);

// mute toggle
muteBtn.addEventListener('click', ()=>{ audioEnabled = !audioEnabled; muteBtn.textContent = audioEnabled ? '🔊' : '🔇'; });

// search filter
searchLog.addEventListener('input', renderLog);

// small console helper
function appendConsole(msg){ consoleOutput.textContent += '\n' + new Date().toLocaleTimeString() + ' ' + msg; consoleOutput.scrollTop = consoleOutput.scrollHeight; return Promise.resolve(); }

// inspector copy on click
inspectorPre.addEventListener('click', ()=> navigator.clipboard.writeText(inspectorPre.textContent));

// undo implemented earlier via undoBtn

// initial render
renderLog();

// if URL hash has state
(function restoreFromHash(){ try{ if(location.hash.includes('state=')){ const b = location.hash.split('state=')[1]; const s = JSON.parse(atob(b)); if(s.username) usernameInput.value = s.username; if(s.batch) batchInput.value = s.batch; if(s.speed) speedRange.value = s.speed; alert('State loaded from permalink (client-only)'); } }catch(e){} })();

// accessibility focus
usernameInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') startSimulation(); });
