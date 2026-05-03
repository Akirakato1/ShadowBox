/**
 * Renderer-side storage. Uses Electron IPC (window.appAPI) when present;
 * falls back to localStorage so the app still runs as a static page in a browser.
 */
(function (global) {
  'use strict';

  const LS_PREFIX = 'shadowbox.design.';

  function lsKey(name) { return LS_PREFIX + name; }

  function lsList() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LS_PREFIX)) continue;
      const name = k.slice(LS_PREFIX.length);
      const raw = localStorage.getItem(k) || '';
      const meta = localStorage.getItem(k + '.meta');
      let mtimeMs = 0;
      if (meta) { try { mtimeMs = JSON.parse(meta).mtimeMs || 0; } catch (_) {} }
      out.push({ name, size: raw.length, mtimeMs });
    }
    out.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return out;
  }

  const Storage = (window.appAPI && window.appAPI.isDesktop)
    ? {
        isDesktop: true,
        async list()                 { return await window.appAPI.list(); },
        async read(name)             { return await window.appAPI.read(name); },
        async write(name, content)   { return await window.appAPI.write(name, content); },
        async remove(name)           { return await window.appAPI.remove(name); },
        async exists(name)           { return await window.appAPI.exists(name); },
        async dataDir()              { return await window.appAPI.dataDir(); },
        async reveal()               { return await window.appAPI.reveal(); },
      }
    : {
        isDesktop: false,
        async list()                 { return lsList(); },
        async read(name)             {
          const v = localStorage.getItem(lsKey(name));
          if (v == null) throw new Error('not found');
          return v;
        },
        async write(name, content)   {
          const safe = name.endsWith('.json') ? name : name + '.json';
          localStorage.setItem(lsKey(safe), content);
          localStorage.setItem(lsKey(safe) + '.meta', JSON.stringify({ mtimeMs: Date.now() }));
          return { name: safe };
        },
        async remove(name)           {
          localStorage.removeItem(lsKey(name));
          localStorage.removeItem(lsKey(name) + '.meta');
        },
        async exists(name)           {
          return localStorage.getItem(lsKey(name)) != null;
        },
        async dataDir()              { return 'browser localStorage'; },
        async reveal()               { /* no-op in browser */ },
      };

  global.DesignStorage = Storage;
})(window);
