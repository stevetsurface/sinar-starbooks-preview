/* dc-lite: a tiny standalone renderer for the Sinar Starbooks design pages.
   Supports {{path}} holes, <sc-for>, <sc-if>, on* handlers and setState. */
(function () {
  'use strict';

  var LANG_KEY = 'ssb-lang';

  function lookup(scope, path) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  var WHOLE = /^\s*\{\{([^}]+)\}\}\s*$/;
  var HOLE = /\{\{([^}]+)\}\}/g;

  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) {
      var v = lookup(scope, p);
      return v == null ? '' : String(v);
    });
  }

  function renderNodes(nodes, scope, parent) {
    for (var i = 0; i < nodes.length; i++) renderNode(nodes[i], scope, parent);
  }

  function renderNode(node, scope, parent) {
    if (node.nodeType === 3) {
      parent.appendChild(document.createTextNode(interp(node.nodeValue, scope)));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.localName;

    if (tag === 'sc-for') {
      var list = lookup(scope, (node.getAttribute('list') || '').replace(/[{}]/g, '')) || [];
      var as = node.getAttribute('as') || 'item';
      for (var i = 0; i < list.length; i++) {
        var s = Object.create(scope);
        s[as] = list[i];
        s.$index = i;
        renderNodes(node.childNodes, s, parent);
      }
      return;
    }
    if (tag === 'sc-if') {
      var val = lookup(scope, (node.getAttribute('value') || '').replace(/[{}]/g, ''));
      if (val) renderNodes(node.childNodes, scope, parent);
      return;
    }

    var el = node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      ? document.createElementNS(node.namespaceURI, tag)
      : document.createElement(tag);

    for (var a = 0; a < node.attributes.length; a++) {
      var attr = node.attributes[a];
      var name = attr.name;
      if (name.indexOf('hint-') === 0) continue;
      var raw = attr.value;
      var whole = raw.match(WHOLE);
      if (/^on[A-Z]/.test(name) || /^on[a-z]+$/.test(name)) {
        var fn = whole ? lookup(scope, whole[1]) : null;
        if (typeof fn === 'function') el.addEventListener(name.slice(2).toLowerCase(), fn);
        continue;
      }
      if (whole) {
        var v = lookup(scope, whole[1]);
        if (v === false || v == null) continue;
        el.setAttribute(name, v === true ? '' : String(v));
      } else {
        el.setAttribute(name, raw.indexOf('{{') >= 0 ? interp(raw, scope) : raw);
      }
    }
    var kids = node.localName === 'template' ? node.content.childNodes : node.childNodes;
    renderNodes(kids, scope, el);
    parent.appendChild(el);
  }

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, next);
    if (next && next.lang) { try { localStorage.setItem(LANG_KEY, next.lang); } catch (e) {} }
    this.forceUpdate();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__render) this.__render(); };

  function boot() {
    var tpl = document.getElementById('dc-template');
    var script = document.querySelector('script[data-dc-script]');
    if (!tpl || !script) return;

    var spec = {};
    try { spec = JSON.parse(script.getAttribute('data-props') || '{}'); } catch (e) {}
    var props = {};
    Object.keys(spec).forEach(function (k) {
      if (k.charAt(0) !== '$' && spec[k] && 'default' in spec[k]) props[k] = spec[k]['default'];
    });
    try {
      var saved = localStorage.getItem(LANG_KEY);
      if (saved && 'startLanguage' in props) props.startLanguage = saved;
    } catch (e) {}

    var Component = new Function('DCLogic', script.textContent + '\n;return Component;')(DCLogic);
    var comp = new Component(props);
    if (!comp.state) comp.state = {};

    var root = document.getElementById('dc-root');
    comp.__render = function () {
      var vals = comp.renderVals ? comp.renderVals() : {};
      var frag = document.createDocumentFragment();
      renderNodes(tpl.content.childNodes, vals, frag);
      root.replaceChildren(frag);
      var lang = comp.state.lang || props.startLanguage;
      if (lang) document.documentElement.lang = lang;
    };
    comp.__render();
    if (comp.componentDidMount) comp.componentDidMount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

// Prototype analytics: log article events (production = GA4 gtag('event', name, params)).
document.addEventListener('click', function (e) {
  var el = e.target.closest && e.target.closest('[data-event]');
  if (!el) return;
  var payload = { event: el.getAttribute('data-event'), article_slug: el.getAttribute('data-article'), isbn: el.getAttribute('data-isbn'), page: location.pathname };
  try { var q = new URLSearchParams(location.search); if (q.get('utm_campaign')) payload.utm_campaign = q.get('utm_campaign'); } catch (err) {}
  console.log('[analytics]', JSON.stringify(payload));
});
