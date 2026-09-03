'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX = 12_000;
const TM = 60_000;
let cwd = process.env.HOME || '/data/data/com.termux/files/home'; // Default
const SF = path.join(cwd, 'claude_workspace/.mcp_state.json');

// State yüklə
const WS = path.join(cwd, 'claude_workspace');
if (!fs.existsSync(WS)) fs.mkdirSync(WS, { recursive: true });
try { const s = JSON.parse(fs.readFileSync(SF, 'utf8')); if (s.cwd && fs.existsSync(s.cwd)) cwd = s.cwd; } catch {}

const saveCwd = () => { try { fs.writeFileSync(SF, JSON.stringify({ cwd })); } catch {} };
const getCwd = () => cwd;
const setCwd = (newCwd) => { cwd = newCwd; saveCwd(); };

const cut = (t) => {
  const s = String(t ?? '');
  if (s.length <= MAX) return s;
  const h = (MAX >> 1) - 40;
  return s.slice(0, h) + `\n...[${s.length - MAX} simvol kəsildi]...\n` + s.slice(-h);
};

const run = (cmd) => new Promise(r => {
  let o = '', e = '', done = false;
  const fin = v => { if (!done) { done = true; r(v); } };
  const env = { ...process.env, HOME: cwd, TERM: 'xterm-256color', PATH: process.env.PATH };
  const p = spawn('bash', ['-c', cmd], { cwd, env });
  
  p.stdout.on('data', d => o += d);
  p.stderr.on('data', d => e += d);
  
  p.on('close', (code, signal) => {
    const c = code ?? (signal ? 128 + (signal === 'SIGKILL' ? 9 : 1) : 1);
    let hint = '';
    if (c !== 0) {
      const errLower = e.toLowerCase();
      if (errLower.includes('command not found')) hint = '\n💡 [AI Məsləhəti]: Bu əmr sistemdə yoxdur. `pkg install` yoxla.';
      else if (errLower.includes('permission denied')) hint = '\n💡 [AI Məsləhəti]: İcazə xətası. `chmod +x` lazım ola bilər.';
      else if (errLower.includes('syntax error')) hint = '\n💡 [AI Məsləhəti]: Bash sintaksis xətası. Dırnaq işarələrini yoxla.';
    }
    let exactErr = e;
    if (e.length > MAX) {
        exactErr = e.slice(0, 3000) + `\n\n... [Ortası kəsildi, amma sonluq (traceback) tam saxlanıldı] ...\n\n` + e.slice(-10000);
    }
    fin({ c, o: cut(o), e: exactErr + hint, signal });
  });
  
  p.on('error', x => fin({ c: 1, o: '', e: x.message, signal: null }));
  const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch {} fin({ c: 124, o: cut(o), e: e + '\n[TIMEOUT]', signal: 'SIGKILL' }); }, TM);
  p.on('close', () => clearTimeout(t));
});

const resolvePath = (p) => path.isAbsolute(p) ? p : path.join(cwd, p);

module.exports = { run, cut, resolvePath, getCwd, setCwd, WS };
