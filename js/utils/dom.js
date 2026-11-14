// h('button', { class: 'button', onclick: fn }, '文字', child)
// 屬性：on 開頭是事件；值為 false / null 時不設定；其他用 setAttribute。
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (name.startsWith('on')) {
      el.addEventListener(name.slice(2), value);
    } else if (value === true) {
      el.setAttribute(name, '');
    } else {
      el.setAttribute(name, value);
    }
  }
  el.append(...children.flat().filter((child) => child != null && child !== false));
  return el;
}
