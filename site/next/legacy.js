// Old homepage links (#c=<concept>, #l=<layer>) now live at news/. Concepts that exist in both apps open here instead.
(function () {
  var h = location.hash.slice(1);
  if (!/^[cl]=/.test(h)) return;
  var shared = ['agent-loop', 'multi-agent', 'open-weights', 'quantization', 'rag'];
  var id = decodeURIComponent(h.slice(2));
  if (h[0] === 'c' && shared.indexOf(id) !== -1) location.replace('#/concept/' + encodeURIComponent(id));
  else location.replace('news/' + location.hash);
})();
