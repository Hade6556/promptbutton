// Staging only: stands in for the Electron preload so the real panel renderer can be photographed in a
// browser. The state comes from the URL: ?state=<base64 JSON of PanelState>.
(() => {
  const params = new URLSearchParams(location.search);
  let state = { phase: 'hidden' };
  try { if (params.get('state')) state = JSON.parse(decodeURIComponent(escape(atob(params.get('state'))))); } catch (e) { console.error(e); }
  const listeners = [];
  window.pb = {
    getState: () => Promise.resolve(state),
    onState: (cb) => { listeners.push(cb); return () => {}; },
    onDictation: () => () => {},
    interpretVoice: () => Promise.resolve({ ok: false, error: 'staging' }),
    send: (a) => console.log('send', a),
    resize: (h) => { document.documentElement.style.height = h + 'px'; parent.postMessage({ type: 'pb-height', height: h }, '*'); },
    setMouseThrough: () => {},
  };
  window.addEventListener('message', (e) => { if (e.data && e.data.type === 'pb-state') { state = e.data.state; listeners.forEach((cb) => cb(state)); } });
})();
