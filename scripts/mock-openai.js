'use strict';

// Lokaler Mock der OpenAI-APIs — nur zum Testen (kein externer Call).
//   /v1/audio/transcriptions -> Klartext (response_format=text)
//   /v1/chat/completions     -> Chat-JSON ({choices:[{message:{content}}]})
const http = require('http');

const PORT = 8765;

function handleTranscription(req, res, body) {
  const raw = body.toString('latin1');
  const auth = req.headers['authorization'] || '';
  const names = [...raw.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
  const filename = (raw.match(/filename="([^"]+)"/) || [])[1] || '(keine)';
  console.log('MOCK /transcriptions  auth=' + (auth.startsWith('Bearer ') ? 'ok' : 'FEHLT') +
    ' fields=[' + names.join(',') + '] file=' + filename + ' bytes=' + body.length);

  if (!auth.startsWith('Bearer ')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Incorrect API key provided' } }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Ich bin total genervt vom Drucker.');
}

function handleChat(req, res, body) {
  const auth = req.headers['authorization'] || '';
  let payload = {};
  try { payload = JSON.parse(body.toString('utf8')); } catch (_) { /* ignore */ }
  const model = payload.model || '?';
  const temperature = payload.temperature;
  const sys = (payload.messages && payload.messages[0] && payload.messages[0].content) || '';
  const user = (payload.messages && payload.messages[1] && payload.messages[1].content) || '';
  console.log('MOCK /chat  auth=' + (auth.startsWith('Bearer ') ? 'ok' : 'FEHLT') +
    ' model=' + model + ' temp=' + temperature +
    ' systemPrompt="' + sys.slice(0, 48).replace(/\n/g, ' ') + '…"' +
    ' user="' + user + '"');

  if (!auth.startsWith('Bearer ')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Incorrect API key provided' } }));
    return;
  }
  const content = `[${model}] Ergebnis aus Prompt "${sys.slice(0, 24)}…"`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content } }] }));
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    if (req.url.includes('chat/completions')) handleChat(req, res, body);
    else handleTranscription(req, res, body);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('MOCK listening on http://127.0.0.1:' + PORT);
});
