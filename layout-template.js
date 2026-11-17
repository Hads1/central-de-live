/* HTML estrutural: dados reais entram como nós/texto, nunca como código. */
(() => {
  const tags = new Set(
    'DIV SECTION ARTICLE HEADER FOOTER SPAN P STRONG EM SMALL B I H1 H2 H3 UL LI HR BR'.split(
      ' ',
    ),
  );
  window.kaiaTemplate = (html, slots) => {
    const parsed = new DOMParser().parseFromString(
      String(html).slice(0, 20000),
      'text/html',
    );
    const used = new Set();
    function copy(source, target) {
      for (const child of source.childNodes) {
        if (child.nodeType === 3) {
          target.append(document.createTextNode(child.textContent));
          continue;
        }
        if (!tags.has(child.tagName)) continue;
        const slot = child.getAttribute('data-slot');
        if (Object.hasOwn(slots, slot) && !used.has(slot)) {
          target.append(slots[slot]);
          used.add(slot);
          continue;
        }
        const node = document.createElement(child.tagName.toLowerCase());
        node.className = child.className;
        copy(child, node);
        target.append(node);
      }
    }
    const result = document.createDocumentFragment();
    copy(parsed.body, result);
    for (const [key, node] of Object.entries(slots))
      if (!used.has(key)) result.append(node);
    return result;
  };
})();
