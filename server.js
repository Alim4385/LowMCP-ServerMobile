'use strict';
const http = require('http');
const os = require('os');
const { getCwd } = require('./utils');
const tools = require('./tools');

const PORT = 3000;
const HOST = '127.0.0.1';

const toolSchemas = [
  {
    name: 'exec',
    description: `Termux terminalında bash əmrləri icra edir. XƏTA ALARSAN, server sənə DƏQİQ XƏTA KODUNU (traceback) verəcək.
    QAYDALAR: İnteraktiv əmrlərdən (vim, nano) QAÇ. Qovluq dəyişmək üçün 'cd <qovluq>' yaz.`,
    inputSchema: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] }
  },
  {
    name: 'view',
    description: `Fayl və ya qovluğu oxuyur. Mətn fayllarına SƏTİR NÖMRƏSİ əlavə edir. Böyük fayllar üçün (10KB+) diqqətli ol.`,
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  },
  {
    name: 'create_file',
    description: `Yeni fayl yaradır. ÇOX BÖYÜK FAYLLAR ÜÇÜN BUNU İŞLƏTMƏ, əvəzində kiçik fayl yaradıb edit_block ilə böyüt.`,
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }
  },
  {
    name: 'str_replace',
    description: `Faylda qısa mətn dəyişikliyi edir. Dəqiq köhnə mətni (find) bilməlisən. Tapılmasa, xəta verəcək.`,
    inputSchema: { 
      type: 'object', 
      properties: { 
        path: { type: 'string' },
        edits: { type: 'array', items: { type: 'object', properties: { find: { type: 'string' }, replace: { type: 'string' }, replace_all: { type: 'boolean' } } } }
      }, 
      required: ['path', 'edits'] 
    }
  },
  {
    name: 'edit_block',
    description: `Faylın müəyyən sətir aralığını (blokunu) yeni kodla əvəz edir. BÜTÖV FAYLI YENİDƏN YAZMAQ ƏVƏZİNƏ HƏMİŞƏ BUNU İŞLƏT!
    1. 'view' ilə faylı oxu və sətir nömrələrini gör.
    2. 'startLine' və 'endLine' ilə dəyişəcək xananı (bloku) seç.
    3. 'newContent' ilə yeni kodu göndər.`,
    inputSchema: { 
      type: 'object', 
      properties: { 
        path: { type: 'string' }, 
        startLine: { type: 'integer', description: 'Başlanğıc sətir (1-dən)' }, 
        endLine: { type: 'integer', description: 'Son sətir (daxildir)' }, 
        newContent: { type: 'string' } 
      }, 
      required: ['path', 'startLine', 'endLine', 'newContent'] 
    }
  }
];

const handle = async ({ method, params, id }) => {
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'termux-mcp-modular', version: '1.3' } } };
  }
  if (method === 'notifications/initialized') return null;
  
  if (method === 'resources/list') {
    return { jsonrpc: '2.0', id, result: { resources: [{ uri: 'termux://env', name: 'Mühit', mimeType: 'text/plain' }] } };
  }
  if (method === 'resources/read' && params?.uri === 'termux://env') {
    return { jsonrpc: '2.0', id, result: { contents: [{ uri: params.uri, mimeType: 'text/plain', text: `Sistem: ${os.type()}\nCWD: ${getCwd()}` }] } };
  }

  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: toolSchemas } };
  
  if (method === 'tools/call' && tools[params.name]) {
    const result = await tools[params.name](params.arguments || {});
    return { jsonrpc: '2.0', id, result };
  }
  
  return { jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: 'Method not found' } };
};

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && req.url === '/health') { res.writeHead(200); return res.end(JSON.stringify({ status: 'ok', version: '1.3', cwd: getCwd() })); }
  if (req.method === 'POST' && req.url === '/mcp') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', async () => {
      try {
        const r = await handle(JSON.parse(body));
        if (!r) { res.writeHead(204); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r));
      } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, HOST, () => console.log(`🚀 v1.3 Modular Server on http://${HOST}:${PORT}/mcp`));

process.on('SIGINT', () => process.exit(0));
