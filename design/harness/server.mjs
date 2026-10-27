// Local preview of the design board's .dc.html artboards. Run `node design/harness/server.mjs`, then open
//   http://localhost:5050/render.html?f=<file>&w=<frame width>&h=<frame height>[&fill=1][&z=<zoom>]
// fill=1 for a page (the frame grows to its content). window.measure() in that page reports the content height,
// anything running past the frame, clipped boxes, broken images and unresolved {{holes}}.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const design = join(here, '..')
const repo = join(design, '..')
// Uploaded board assets, by id, mapped to their copies in the repository. Today's screenshots stay on the board only.
const blobs = {
  '67291cc5cf75113d16832678d92ee54a': join(design, 'assets', 'silverleaf-logo.png'),
  '00bf92a7ef79827719071d325e84d75f': join(repo, 'client', 'public', 'cert-fellowship.jpg'),
  '41ef4b0f69a735d77eaea8d5f397462a': join(repo, 'client', 'public', 'cert-advanced.jpg'),
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' }

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  let file
  if (url.pathname.startsWith('/_blob/')) file = blobs[url.pathname.slice(7)]
  else if (url.pathname === '/' || url.pathname === '/render.html') file = join(here, 'render.html')
  else if (url.pathname === '/render.js') file = join(here, 'render.js')
  else if (url.pathname.startsWith('/project/')) file = join(design, 'board', normalize(url.pathname.slice('/project/'.length)).replace(/^[\\/]+/, ''))
  if (!file) { res.writeHead(404); return res.end() }
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(body)
  } catch { res.writeHead(404); res.end() }
}).listen(Number(process.env.PORT || 5050), () => console.log(`design harness on http://localhost:${process.env.PORT || 5050}`))
