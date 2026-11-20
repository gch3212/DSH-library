/**
 * 迷你渲染器：不依赖 react-dom，直接调函数组件、把元素树摊平成
 * 带 className 与文本的 HTML 片段，用来给手写 IIFE 面板做冒烟检查。
 */
export function walk(node, out = []) {
  if (node === null || node === undefined || node === false || node === true) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push({ text: String(node) })
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) walk(child, out)
    return out
  }
  if (typeof node === 'function') {
    walk(node(node.props || {}), out)
    return out
  }
  if (typeof node === 'object') {
    // react element: { type, props, key }
    const type = node.type
    if (typeof type === 'function') {
      walk(type(node.props || {}), out)
      return out
    }
    out.push({ tag: String(type), className: node.props && node.props.className })
    if (node.props && node.props.children !== undefined) walk(node.props.children, out)
    return out
  }
  return out
}

export function textOf(parts) {
  return parts
    .map((p) => (p.className ? `[${p.className}]` : p.text || ''))
    .join(' ')
}

export function classesOf(parts) {
  const set = new Set()
  for (const p of parts) {
    if (!p.className) continue
    for (const token of String(p.className).split(/\s+/)) if (token) set.add(token)
  }
  return set
}
