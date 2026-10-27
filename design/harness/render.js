// Draws one .dc.html artboard the way the canvas runtime does, closely enough to measure its fit:
// helmet into <head>, renderVals() from the artboard's own script, {{holes}}, <sc-for> and <sc-if> expanded.
// Query: f = file, w/h = the frame from canvas.json, fill = 1 for a PAGE (height = content), z = zoom for viewing.
const q = new URLSearchParams(location.search)
const file = q.get('f')
const W = Number(q.get('w') || 1280)
const H = Number(q.get('h') || 900)
const fill = q.get('fill') === '1'
const zoom = Number(q.get('z') || 0)

const decode = (s) => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value }

function lookup(path, scope) {
  path = path.trim()
  if (path === 'true') return true
  if (path === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path)
  if (/^'.*'$/.test(path)) return path.slice(1, -1)
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope)
}

function interp(str, scope) {
  return str.replace(/\{\{([^}]+)\}\}/g, (_, p) => { const v = lookup(p, scope); return v == null ? '' : String(v) })
}

function expand(node, scope) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) { if (child.data.includes('{{')) child.data = interp(child.data, scope); continue }
    if (child.nodeType !== 1) continue
    if (child.tagName === 'TEMPLATE' && child.hasAttribute('data-scfor')) {
      const list = lookup(child.getAttribute('list').replace(/[{}]/g, ''), scope) || []
      const as = child.getAttribute('as') || 'item'
      const out = document.createDocumentFragment()
      list.forEach((item, i) => { const c = child.content.cloneNode(true); expand(c, { ...scope, [as]: item, $index: i }); out.appendChild(c) })
      child.replaceWith(out)
      continue
    }
    if (child.tagName === 'TEMPLATE' && child.hasAttribute('data-scif')) {
      const v = lookup(child.getAttribute('value').replace(/[{}]/g, ''), scope)
      if (v) { const c = child.content.cloneNode(true); expand(c, scope); child.replaceWith(c) } else child.remove()
      continue
    }
    for (const a of [...child.attributes]) if (a.value.includes('{{')) child.setAttribute(a.name, interp(a.value, scope))
    expand(child, scope)
  }
}

const src = await (await fetch('/project/' + file)).text()
const xdc = src.match(/<x-dc>([\s\S]*)<\/x-dc>/)[1]
const helmet = (xdc.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1]
const tpl = xdc.replace(/<helmet>[\s\S]*?<\/helmet>/, '')
  .replace(/<sc-for\b/g, '<template data-scfor').replace(/<\/sc-for>/g, '</template>')
  .replace(/<sc-if\b/g, '<template data-scif').replace(/<\/sc-if>/g, '</template>')
const sm = src.match(/<script type="text\/x-dc" data-dc-script([^>]*)>([\s\S]*?)<\/script>/)
const declared = JSON.parse(decode((sm[1].match(/data-props='([^']*)'/) || [, '{}'])[1]))
const props = {}
for (const [k, v] of Object.entries(declared)) if (v && typeof v === 'object' && 'default' in v) props[k] = v.default
class DCLogic { constructor(p) { this.props = p; this.state = {} } setState(s) { Object.assign(this.state, s) } forceUpdate() {} }
const Component = new Function('DCLogic', sm[2] + '\n;return Component;')(DCLogic)
const vals = new Component(props).renderVals() || {}

document.head.insertAdjacentHTML('beforeend', helmet)
const frame = document.getElementById('frame')
frame.style.width = W + 'px'
frame.style.height = fill ? 'auto' : H + 'px'
const holder = document.createElement('template')
holder.innerHTML = tpl
const content = holder.content.cloneNode(true)
expand(content, vals)
frame.appendChild(content)
if (zoom) document.documentElement.style.zoom = String(zoom)

// What a fit check needs: how tall the content is, whether anything runs past the frame, and which boxes clip.
window.measure = async () => {
  await document.fonts.ready
  await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r }))))
  const root = frame.firstElementChild
  const f = frame.getBoundingClientRect()
  const z = zoom || 1
  const contentHeight = Math.ceil(root.scrollHeight)
  const rootBox = root.getBoundingClientRect()
  const outside = []
  const clipped = []
  for (const el of frame.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    const label = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(el.textContent || '').trim().slice(0, 40)}"`
    if (r.right - f.right > 1 * z || r.left < f.left - 1 * z) outside.push(`${label} x ${Math.round((r.left - f.left) / z)}..${Math.round((r.right - f.left) / z)}`)
    if (!fill && r.bottom - f.bottom > 1 * z) outside.push(`${label} bottom ${Math.round((r.bottom - f.top) / z)} > ${H}`)
    const cs = getComputedStyle(el)
    const hides = ['hidden', 'clip', 'auto', 'scroll']
    if ((hides.includes(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) || (hides.includes(cs.overflowY) && el.scrollHeight > el.clientHeight + 1)) {
      clipped.push(`${label} overflow ${cs.overflowX}/${cs.overflowY} scroll ${el.scrollWidth}x${el.scrollHeight} > client ${el.clientWidth}x${el.clientHeight}`)
    }
  }
  const brokenImages = [...frame.querySelectorAll('img')].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src'))
  const unresolved = (frame.innerHTML.match(/\{\{[^}]+\}\}/g) || []).slice(0, 5)
  return { file, W, H, fill, contentHeight, rootWidth: Math.round(rootBox.width / z), docScrollWidth: document.documentElement.scrollWidth, outside: outside.slice(0, 12), clipped: clipped.slice(0, 12), brokenImages, unresolved }
}
