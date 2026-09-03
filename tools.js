'use strict';
const fs = require('fs');
const path = require('path');
const { run, resolvePath, getCwd } = require('./utils');

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };

const exec = async (args) => {
  const cmd = args.cmd;
  if (!cmd) return { content: [{ type: 'text', text: '❌ cmd boşdur' }], isError: true };

  const cdMatch = cmd.match(/^cd\s+(.+)$/);
  if (cdMatch) {
    const target = resolvePath(cdMatch[1].trim().replace(/['"]/g, ''));
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) { 
      require('./utils').setCwd(target); 
      const lsResult = await run('ls -la --color=never');
      return { content: [{ type: 'text', text: `✅ Qovluq dəyişdi: ${target}\n\nBurada nələr var:\n${lsResult.o}` }] }; 
    }
    return { content: [{ type: 'text', text: `❌ Qovluq tapılmadı: ${target}` }], isError: true };
  }

  const { c, o, e, signal } = await run(cmd);
  let status = `exit ${c}`;
  if (signal) status += ` (Signal: ${signal})`;
  let text = `[${status}] [cwd: ${getCwd()}]\n`;
  if (o) text += `--- STDOUT ---\n${o}\n`;
  if (e) text += `--- STDERR (DƏQİQ XƏTA) ---\n${e}`;
  return { content: [{ type: 'text', text }], isError: c !== 0 };
};

const view = async (args) => {
  const target = resolvePath(args.path);
  if (!fs.existsSync(target)) return { content: [{ type: 'text', text: `❌ Tapılmadı: ${target}` }], isError: true };

  const stats = fs.statSync(target);
  if (stats.isDirectory()) {
    const items = fs.readdirSync(target, { withFileTypes: true });
    const text = items.map(d => {
      if (d.isDirectory()) return `📁 ${d.name}`;
      try {
        const size = fs.statSync(path.join(target, d.name)).size;
        const sz = size < 1024 ? `${size}B` : `${(size/1024).toFixed(1)}KB`;
        return `📄 ${d.name} (${sz})`;
      } catch { return `📄 ${d.name}`; }
    }).join('\n');
    return { content: [{ type: 'text', text: `📂 Qovluq: ${target}\n\n${text}` }] };
  }

  const ext = path.extname(target).toLowerCase();
  if (MIME[ext]) {
    const data = fs.readFileSync(target);
    return { content: [{ type: 'image', data: data.toString('base64'), mimeType: MIME[ext] }] };
  }

  const content = fs.readFileSync(target, 'utf8');
  const lines = content.split('\n');
  const numbered = lines.map((l, i) => `${String(i + 1).padStart(4, ' ')} | ${l}`).join('\n');
  return { content: [{ type: 'text', text: numbered }] };
};

const create_file = async (args) => {
  const target = resolvePath(args.path);
  const content = args.content || '';
  try {
    if (fs.existsSync(target)) fs.copyFileSync(target, target + '.bak');
    fs.writeFileSync(target, content);
    return { content: [{ type: 'text', text: `✅ Fayl yaradıldı/yeniləndi: ${target} (Backup: .bak)` }] };
  } catch (err) { return { content: [{ type: 'text', text: `❌ Xəta: ${err.message}` }], isError: true }; }
};

const str_replace = async (args) => {
  const target = resolvePath(args.path);
  const edits = args.edits;
  if (!fs.existsSync(target)) return { content: [{ type: 'text', text: `❌ Fayl tapılmadı: ${target}` }], isError: true };
  
  try {
    let content = fs.readFileSync(target, 'utf8');
    const original = content;
    let changedCount = 0;
    
    // Backup (yalnız ilk dəyişiklikdə)
    let backedUp = false;

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if (!content.includes(edit.find)) {
        return { content: [{ type: 'text', text: `❌ Edit #${i+1} uğursuz: "${edit.find.slice(0,50)}..." faylda tapılmadı. (Sətir nömrələri və boşluqları yoxla).` }], isError: true };
      }
      if (!backedUp) { fs.copyFileSync(target, target + '.bak'); backedUp = true; }
      
      if (edit.replace_all) content = content.split(edit.find).join(edit.replace);
      else content = content.replace(edit.find, edit.replace);
      changedCount++;
    }
    
    fs.writeFileSync(target, content);
    return { content: [{ type: 'text', text: `✅ ${changedCount} dəyişiklik uğurla edildi.` }] };
  } catch (err) { return { content: [{ type: 'text', text: `❌ Xəta: ${err.message}` }], isError: true }; }
};

// 🎯 YENİ VƏ ƏN GÜCLÜ ALƏT: edit_block (Sətir Nömrəli Blok Redaktəsi)
const edit_block = async (args) => {
  const target = resolvePath(args.path);
  const { startLine, endLine, newContent } = args;
  
  if (!fs.existsSync(target)) return { content: [{ type: 'text', text: `❌ Fayl tapılmadı: ${target}` }], isError: true };
  
  try {
    const content = fs.readFileSync(target, 'utf8');
    const lines = content.split('\n');
    
    if (startLine < 1 || endLine > lines.length || startLine > endLine) {
      return { content: [{ type: 'text', text: `❌ Sətir nömrələri yanlışdır. Fayl 1-${lines.length} sətirlərindən ibarətdir.` }], isError: true };
    }
    
    // Backup
    fs.copyFileSync(target, target + '.bak');
    
    // Sətirləri əvəz et (0-indexed olduğu üçün -1 edirik)
    const before = lines.slice(0, startLine - 1);
    const after = lines.slice(endLine);
    const newLines = newContent.split('\n');
    
    const result = [...before, ...newLines, ...after].join('\n');
    fs.writeFileSync(target, result);
    
    return { 
      content: [{ type: 'text', text: `✅ Sətir ${startLine}-${endLine} uğurla əvəz edildi.\n\nYeni blok:\n${newContent.slice(0, 500)}...` }] 
    };
  } catch (err) { return { content: [{ type: 'text', text: `❌ Xəta: ${err.message}` }], isError: true }; }
};

module.exports = { exec, view, create_file, str_replace, edit_block };
