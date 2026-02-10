
// assets/ps1/wasmpsx_worker_proxy.js
// A minimal wrapper around the original worker that adds a resize hook.

(function () {
  // 1) Handle resize messages from the main thread
  self.addEventListener('message', function (e) {
    var d = (e && e.data) || {};
    if (d.type === 'canvas-resize') {
      var w = Math.max(1, d.width | 0);
      var h = Math.max(1, d.height | 0);
      try {
        // Preferred: let Emscripten update framebuffer + viewport
        if (typeof Module !== 'undefined' && typeof Module.setCanvasSize === 'function') {
          Module.setCanvasSize(w, h);
          // If you ever want strict 4:3 handled by the runtime, you can also set:
          // Module.forcedAspectRatio = 4 / 3;
        } else if (self.GLctx && self.GLctx.viewport) {
          // Fallback: update GL viewport if exposed
          self.GLctx.viewport(0, 0, w, h);
        }
      } catch (err) {
        // optional: console.warn('worker resize failed', err);
      }
    }
  }, false);

  // 2) Load the original minified worker from the same folder
  try {
    var href = (self.location && self.location.href) || '';
    var base = href.slice(0, href.lastIndexOf('/') + 1);
    importScripts(base + 'wasmpsx_worker.js');
  } catch (err) {
    // optional: console.error('Failed to import original worker', err);
  }
})();