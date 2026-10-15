export default {
  async fetch(request, env, ctx) {
    const API_URL = "https://script.google.com/macros/s/AKfycbyehPQFeTD0JvFGaHgOfA62NYEI42Rp31eLFHv_sRClRz2BuqyG2vHEzS1T3QGYw4-t0w/exec";
    const url = new URL(request.url);

    if (url.pathname.startsWith("/download")) {
      const id = url.searchParams.get("id");
      const nameParam = url.searchParams.get("name") || "document.pdf";
      if (!id) return new Response("Missing file ID", { status: 400 });
      try {
        const metaResp = await fetch(API_URL + "?action=driveurl&id=" + id + "&OpenCLOUD=" + (url.searchParams.get("OpenCLOUD") || "T"), { cf: { cacheTtl: 0 } });
        if (!metaResp.ok) return new Response("GAS error: " + metaResp.status, { status: 502 });
        const meta = await metaResp.json();
        if (!meta.success || !meta.url || !meta.token) return new Response("GAS error: " + (meta.error || "no URL"), { status: 502 });
        const safeName = nameParam.replace(/[^\w.\-\s]/g, "_");
        const driveResp = await fetch(meta.url, { headers: { "Authorization": "Bearer " + meta.token } });
        if (!driveResp.ok) return new Response("Drive error: " + driveResp.status, { status: 502 });
        const headers = new Headers({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safeName}"`, "Access-Control-Allow-Origin": "*", "Cache-Control": "private, max-age=3600" });
        const cl = driveResp.headers.get("Content-Length");
        if (cl) headers.set("Content-Length", cl);
        return new Response(driveResp.body, { status: 200, headers });
      } catch (err) { return new Response("Worker error: " + err.message, { status: 500 }); }
    }

    if (url.pathname.startsWith("/file")) {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Missing file ID", { status: 400 });
      try {
        const metaResp = await fetch(API_URL + "?action=driveurl&id=" + id + "&OpenCLOUD=" + (url.searchParams.get("OpenCLOUD") || "T"), { cf: { cacheTtl: 0 } });
        if (!metaResp.ok) return new Response("GAS error: " + metaResp.status, { status: 502 });
        const meta = await metaResp.json();
        if (!meta.success || !meta.url || !meta.token) return new Response("GAS error: " + (meta.error || "no URL"), { status: 502 });
        const safeName = (meta.name || "file").replace(/[^\w.\-\s]/g, "_");
        const driveResp = await fetch(meta.url, { headers: { "Authorization": "Bearer " + meta.token } });
        if (!driveResp.ok) { const t = await driveResp.text(); return new Response("Drive error " + driveResp.status + ": " + t, { status: 502 }); }
        const headers = new Headers({ "Content-Type": meta.mime || "application/pdf", "Content-Disposition": `inline; filename="${safeName}"`, "Access-Control-Allow-Origin": "*", "Cache-Control": "private, max-age=3600" });
        const cl = driveResp.headers.get("Content-Length");
        if (cl) headers.set("Content-Length", cl);
        return new Response(driveResp.body, { status: 200, headers });
      } catch (err) { return new Response("Worker error: " + err.message, { status: 500 }); }
    }

    if (url.pathname.startsWith("/preview")) {
      const id = url.searchParams.get("id");
      const name = url.searchParams.get("name") || "Document";
      const sizeHint = url.searchParams.get("size") || "";
      const ten = url.searchParams.get("OpenCLOUD") || "T";
      const CIRC = 226.2;
      const previewHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f0f4f8; color: #333; }
    .card { background: #fff; border-radius: 20px; box-shadow: 0 12px 40px rgba(0,0,0,0.12); padding: 40px 48px; text-align: center; min-width: 320px; max-width: 420px; width: 92%; }
    .phase-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; margin-bottom: 22px; transition: all 0.4s ease; }
    .phase-pill.phase1 { background: #fff3e0; color: #e65100; }
    .phase-pill.phase2 { background: #e3f2fd; color: #1565c0; }
    .phase-pill.done   { background: #e8f5e9; color: #2e7d32; }
    .phase-pill.fail   { background: #ffebee; color: #c62828; }
    .phase-pill .dot { width: 6px; height: 6px; border-radius: 50%; animation: blink 1s ease-in-out infinite; }
    .phase-pill.phase1 .dot { background: #e65100; }
    .phase-pill.phase2 .dot { background: #1565c0; }
    .phase-pill.done .dot, .phase-pill.fail .dot { animation: none; }
    .phase-pill.done .dot { background: #2e7d32; }
    .phase-pill.fail .dot { background: #c62828; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .ring-wrap { width: 80px; height: 80px; margin: 0 auto 20px; position: relative; display: flex; align-items: center; justify-content: center; }
    .spin-ring { position: absolute; inset: 0; border-radius: 50%; border: 4px solid #eef2f7; border-top-color: #e65100; animation: spin 1s linear infinite; transition: border-top-color 0.4s ease; }
    .spin-ring.phase2  { border-top-color: #1565c0; }
    .spin-ring.stopped { animation: none; border-top-color: #eef2f7; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .arc-svg { position: absolute; inset: 0; width: 80px; height: 80px; }
    .arc-track { fill: none; stroke: #f0f0f0; stroke-width: 4; }
    .arc-fill { fill: none; stroke: #e65100; stroke-width: 4; stroke-linecap: round; stroke-dasharray: ${CIRC}; stroke-dashoffset: 0; transform: rotate(-90deg); transform-origin: 50% 50%; transition: stroke-dashoffset 0.1s linear, stroke 0.4s ease; }
    .counter { font-size: 26px; font-weight: 900; color: #e65100; transition: color 0.4s ease; line-height: 1; }
    .counter.phase2 { color: #1565c0; }
    .filename { font-size: 13px; font-weight: 700; color: #111; margin-bottom: 4px; word-break: break-all; line-height: 1.4; }
    .file-size { font-size: 11px; color: #999; margin-bottom: 24px; font-weight: 600; }
    .bar-wrap { width: 100%; height: 10px; background: #eef2f7; border-radius: 10px; overflow: hidden; margin-bottom: 12px; }
    .bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg,#e65100,#ff8a50); border-radius: 10px; transition: width 0.25s ease, background 0.4s ease; }
    .bar-fill.phase2 { background: linear-gradient(90deg,#1565c0,#42a5f5); }
    .bar-fill.done   { background: linear-gradient(90deg,#2e7d32,#66bb6a); }
    .stats-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 700; margin-bottom: 10px; }
    .s-recv { color: #1565c0; }
    .s-pct  { font-size: 20px; font-weight: 900; color: #111; }
    .s-tot  { color: #999; }
    .status { font-size: 11px; color: #aaa; min-height: 16px; }
    .err    { color: #e53935; font-size: 13px; font-weight: 700; margin-top: 12px; }
  </style>
</head>
<body>
<div class="card">
  <div class="phase-pill phase1" id="pill"><span class="dot"></span><span id="pill-label">Secure Connect</span></div>
  <div class="ring-wrap">
    <div class="spin-ring" id="ring"></div>
    <svg class="arc-svg" viewBox="0 0 80 80">
      <circle class="arc-track" cx="40" cy="40" r="36"/>
      <circle class="arc-fill" id="arc" cx="40" cy="40" r="36"/>
    </svg>
    <span class="counter" id="counter"></span>
  </div>
  <div class="filename">${name}</div>
  <div class="file-size" id="fsz">${sizeHint || 'Calculating size\u2026'}</div>
  <div class="bar-wrap"><div class="bar-fill" id="bar"></div></div>
  <div class="stats-row">
    <span class="s-recv" id="recv">\u2014</span>
    <span class="s-pct"  id="pct">\u2014</span>
    <span class="s-tot"  id="tot">${sizeHint || '\u2014'}</span>
  </div>
  <div class="status" id="status">Establishing secure connection\u2026</div>
  <div class="err" id="err"></div>
</div>
<script>
  const CIRC   = ${CIRC};
  const arc    = document.getElementById('arc');
  const ring   = document.getElementById('ring');
  const pill   = document.getElementById('pill');
  const pillLb = document.getElementById('pill-label');
  const counter= document.getElementById('counter');
  const bar    = document.getElementById('bar');
  const recv   = document.getElementById('recv');
  const pct    = document.getElementById('pct');
  const totEl  = document.getElementById('tot');
  const status = document.getElementById('status');
  const errEl  = document.getElementById('err');

  function fmtBytes(b) {
    if (!b) return '0 B';
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + ['B','KB','MB','GB'][i];
  }

  const CYCLE_MS = 2200, P1_TICK = 40;
  let p1Elapsed = 0, phase1Done = false;
  const dotFrames = ['●○○','○●○','○○●','○●○'];
  let dotIdx = 0;
  counter.style.fontSize = '10px';
  counter.style.letterSpacing = '2px';
  counter.style.color = '#e65100';
  arc.style.strokeDashoffset = String(CIRC);

  const dotIntv = setInterval(() => {
    if (phase1Done) return;
    counter.textContent = dotFrames[dotIdx++ % dotFrames.length];
  }, 380);

  const p1Intv = setInterval(() => {
    if (phase1Done) return;
    p1Elapsed += P1_TICK;
    if (p1Elapsed >= CYCLE_MS) {
      p1Elapsed = 0;
      arc.style.transition = 'none';
      arc.style.strokeDashoffset = String(CIRC);
      requestAnimationFrame(() => { arc.style.transition = 'stroke-dashoffset 0.04s linear'; });
      return;
    }
    arc.style.strokeDashoffset = String(CIRC * (1 - p1Elapsed / CYCLE_MS));
    status.textContent = 'Securing connection to server\u2026';
  }, P1_TICK);

  async function run() {
    try {
      const res = await fetch('/file?id=${id}&OpenCLOUD=${ten}');
      if (!res.ok) { const t = await res.text(); throw new Error('Server ' + res.status + ': ' + t.slice(0,120)); }
      phase1Done = true;
      clearInterval(p1Intv); clearInterval(dotIntv);
      arc.style.transition = 'stroke-dashoffset 0.3s ease';
      arc.style.strokeDashoffset = '0';
      pill.className = 'phase-pill phase2'; pillLb.textContent = 'Downloading';
      ring.className = 'spin-ring phase2';
      bar.className  = 'bar-fill phase2';
      counter.style.fontSize      = '20px';
      counter.style.letterSpacing = 'normal';
      counter.style.color         = '#1565c0';
      counter.textContent         = '0%';
      status.textContent = 'Transferring file\u2026';
      pct.textContent = '0%'; recv.textContent = '0 B';
      const cl = res.headers.get('Content-Length');
      const totalBytes = cl ? parseInt(cl, 10) : null;
      if (totalBytes) { totEl.textContent = fmtBytes(totalBytes); document.getElementById('fsz').textContent = fmtBytes(totalBytes); }
      const reader = res.body.getReader();
      const chunks = []; let received = 0;
      let lastBytes = 0, lastTime = Date.now();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); received += value.length;
        const now = Date.now(), dt = (now - lastTime) / 1000;
        if (dt >= 0.4) { lastBytes = received; lastTime = now; }
        recv.textContent = fmtBytes(received);
        if (totalBytes) {
          const p = Math.min((received / totalBytes) * 100, 99);
          bar.style.width     = p + '%';
          pct.textContent     = Math.floor(p) + '%';
          counter.textContent = Math.floor(p) + '%';
        } else {
          const fake = Math.min(received / (received + 8e6), 0.92);
          bar.style.width     = (fake * 100) + '%';
          pct.textContent     = fmtBytes(received);
          counter.textContent = fmtBytes(received);
        }
      }
      arc.style.stroke = '#2e7d32';
      bar.style.width = '100%'; bar.className = 'bar-fill done';
      pct.textContent = '100%'; counter.textContent = '100%';
      counter.style.color = '#2e7d32';
      recv.textContent = fmtBytes(received); totEl.textContent = fmtBytes(received);
      status.textContent = 'Opening file\u2026';
      pill.className = 'phase-pill done'; pillLb.textContent = 'Complete';
      ring.className = 'spin-ring stopped';
      const blob = new Blob(chunks, { type: 'application/pdf' });
      const objUrl = URL.createObjectURL(blob);
      setTimeout(() => {
        document.body.innerHTML = '<embed src="' + objUrl + '" type="application/pdf" width="100%" height="100%" style="border:none;position:fixed;inset:0;">';
        document.body.style.cssText = 'margin:0;padding:0;background:#fff;';
      }, 350);
    } catch(e) {
      phase1Done = true;
      clearInterval(p1Intv); clearInterval(dotIntv);
      arc.style.stroke = '#e53935';
      bar.style.background = '#e53935'; bar.style.width = '100%';
      errEl.textContent = 'Error: ' + e.message; status.textContent = '';
      pill.className = 'phase-pill fail'; pillLb.textContent = 'Failed';
      ring.className = 'spin-ring stopped';
    }
  }
  run();
<\/script>
</body>
</html>`;
      return new Response(previewHtml, { headers: { "Content-Type": "text/html" } });
    }

    if (url.pathname.startsWith("/api")) {
      const isRebuild = url.searchParams.get("rebuild") === "true";
      const googleResp = await fetch(API_URL + url.search, {
        cf: isRebuild ? { cacheTtl: 0, cacheEverything: false } : {}
      });
      const cacheHeader = isRebuild
        ? "no-store"          // Never cache rebuild responses
        : "public, max-age=300"; // Normal 5 min cache for tree reads
      return new Response(await googleResp.text(), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": cacheHeader
        }
      });
    }

    // ── / — Portal HTML ──
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>OpenCLOUD Portal</title>
  <style>
    :root { --primary: #075ba6; --bg: #f4f7f9; --card-bg: #ffffff; }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); margin: 0; padding: 0; color: #333; overflow-x: hidden; }
    .container { max-width: 1150px; margin: 10px auto 100px auto; background: var(--card-bg); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); min-height: 85vh; display: flex; flex-direction: column; position: relative; }
    .header { padding: 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f0f0f0; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo { height: 35px; width: auto; }
    .stats-pill { background: #eef2f7; padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; color: var(--primary); text-align: center; line-height: 1.6; }
    .controls { padding: 10px 20px; background: #fafafa; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px; }
    .breadcrumb { font-size: 13px; flex-grow: 1; overflow-x: auto; white-space: nowrap; scrollbar-width: none; }
    .breadcrumb span { color: var(--primary); cursor: pointer; font-weight: 600; padding: 2px 4px; }
    .breadcrumb .sep { color: #999; cursor: default; font-weight: 400; }
    .view-toggle { display: flex; gap: 4px; flex-shrink: 0; }
    .view-btn { width: 32px; height: 32px; border: 1px solid #dde3ec; border-radius: 8px; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; color: #888; }
    .view-btn:hover { border-color: var(--primary); color: var(--primary); }
    .view-btn.active { background: var(--primary); border-color: var(--primary); color: #fff; }
    .view-btn svg { width: 16px; height: 16px; fill: currentColor; }
    #content-area { padding: 15px; flex: 1; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
    .item { border: 1px solid #eef2f7; border-radius: 12px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 160px; padding: 10px; text-align: center; background: #fff; transition: all 0.1s ease; }
    .item:hover { border-color: var(--primary); transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
    .item:active { transform: scale(0.96); }
    .icon { width: 50px; height: 50px; margin-bottom: 8px; background-size: contain; background-repeat: no-repeat; background-position: center; flex-shrink: 0; }
    .folder-icon { background-image: url('https://upload.wikimedia.org/wikipedia/commons/5/59/OneDrive_Folder_Icon.svg'); }
    .folder-locked-icon { background-image: url('https://cdn-icons-png.flaticon.com/512/2580/2580558.png'); }
    .icon-pdf    { background-image: url('https://upload.wikimedia.org/wikipedia/commons/8/87/PDF_file_icon.svg'); }
    .icon-sheet  { background-image: url('https://upload.wikimedia.org/wikipedia/commons/3/30/Google_Sheets_logo_%282014-2020%29.svg'); }
    .icon-word   { background-image: url('https://upload.wikimedia.org/wikipedia/commons/f/fb/Microsoft_Office_Word_%282013%E2%80%932019%29.svg'); }
    .name { font-size: 11px; font-weight: 700; color: #222; text-transform: uppercase; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .file-size { font-size: 10px; font-weight: 600; color: #999; margin-top: 4px; }
    .list { display: flex; flex-direction: column; gap: 4px; }
    .list-item { border: 1px solid #eef2f7; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #fff; transition: all 0.1s ease; }
    .list-item:hover { border-color: var(--primary); background: #f5f8ff; }
    .list-item:active { transform: scale(0.99); }
    .list-item .icon { width: 32px; height: 32px; margin-bottom: 0; flex-shrink: 0; }
    .list-item .name { font-size: 13px; font-weight: 600; text-transform: none; color: #222; flex-grow: 1; text-align: left; -webkit-line-clamp: 1; }
    .list-item .size-badge { font-size: 11px; color: #999; flex-shrink: 0; white-space: nowrap; font-weight: 600; }
    .list-item .arrow { color: #ccc; font-size: 16px; flex-shrink: 0; }
    #progress-bar { position: absolute; top: 0; left: 0; height: 3px; background: var(--primary); width: 0%; transition: width 0.3s; z-index: 100; border-radius: 3px; }
    .sync-overlay { background: var(--card-bg); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; gap: 18px; }
    .sync-icon-wrap { width: 80px; height: 80px; position: relative; display: flex; align-items: center; justify-content: center; }
    .sync-ring { position: absolute; inset: 0; border-radius: 50%; border: 4px solid #eef2f7; border-top-color: var(--primary); animation: spin 0.9s linear infinite; }
    .sync-arc-svg { position: absolute; inset: 0; width: 80px; height: 80px; }
    .sync-arc-track { fill: none; stroke: #f0f0f0; stroke-width: 4; }
    .sync-arc-fill  { fill: none; stroke: var(--primary); stroke-width: 4; stroke-linecap: round; stroke-dasharray: 226.2; stroke-dashoffset: 226.2; transform: rotate(-90deg); transform-origin: 50% 50%; transition: stroke-dashoffset 0.1s linear; }
    .sync-num { font-size: 26px; font-weight: 900; color: var(--primary); line-height: 1; }
    .sync-label { font-size: 15px; font-weight: 700; color: #333; }
    .sync-sub   { font-size: 12px; color: #999; margin-top: -6px; }
    /* Force-sync full-page overlay */
    .force-sync-overlay { position: fixed; inset: 0; z-index: 500; background: rgba(255,255,255,0.92); backdrop-filter: blur(8px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; animation: fadeIn 0.3s ease; }
    .fs-ring-wrap { width: 110px; height: 110px; position: relative; display: flex; align-items: center; justify-content: center; }
    .fs-ring { position: absolute; inset: 0; border-radius: 50%; border: 5px solid #eef2f7; border-top-color: var(--primary); animation: spin 0.9s linear infinite; }
    .fs-num { font-size: 28px; font-weight: 900; color: var(--primary); line-height: 1; }
    .fs-label { font-size: 17px; font-weight: 800; color: #333; }
    .fs-sub { font-size: 13px; color: #999; font-weight: 500; }
    @keyframes spin   { to { transform: rotate(360deg); } }
    @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(4px)} }
    @keyframes pulse  { 0%{opacity:1} 50%{opacity:0.5} 100%{opacity:1} }
    .footer { padding: 18px 20px 22px; border-top: 1px solid #f0f0f0; font-size: 11px; color: #bbb; font-weight: 600; letter-spacing: 0.03em; display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; }
    .footer a { color: #bbb; text-decoration: none; }
    .footer a:hover { color: #999; }
    .footer .sep { color: #ddd; }
    /* ── Viewer panel ── */
    #viewer-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 300; }
    #viewer-backdrop.open { display: block; animation: fadeIn 0.2s ease; }
    @keyframes fadeIn { from{opacity:0} to{opacity:1} }
    #viewer-panel { position: fixed; left: 0; right: 0; bottom: 0; height: 92dvh; background: #fff; border-radius: 22px 22px 0 0; box-shadow: 0 -8px 48px rgba(0,0,0,0.22); z-index: 301; display: flex; flex-direction: column; transform: translateY(100%); transition: transform 0.36s cubic-bezier(0.32,1,0.38,1); overflow: hidden; }
    #viewer-panel.open { transform: translateY(0); }
    #viewer-handle-bar { width: 40px; height: 4px; background: #dde3ec; border-radius: 4px; margin: 12px auto 0; flex-shrink: 0; cursor: pointer; }
    #viewer-topbar { display: flex; align-items: center; gap: 10px; padding: 10px 16px 12px; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; }
    #viewer-file-icon { font-size: 24px; flex-shrink: 0; }
    #viewer-file-name { font-size: 13px; font-weight: 700; color: #111; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    #viewer-file-size { font-size: 11px; color: #999; font-weight: 600; flex-shrink: 0; }
    #viewer-close-btn { width: 32px; height: 32px; border-radius: 50%; background: #f0f0f0; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #555; flex-shrink: 0; transition: background 0.15s; }
    #viewer-close-btn:hover { background: #e0e0e0; }
    /* ── Progress phase ── */
    #viewer-progress-phase { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 28px 28px 20px; gap: 0; }
    .vp-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 12px; border-radius: 20px; margin-bottom: 20px; transition: background 0.4s ease, color 0.4s ease; }
    .vp-pill.phase1 { background: #fff3e0; color: #e65100; }
    .vp-pill.phase2 { background: #e3f2fd; color: #1565c0; }
    .vp-pill.done   { background: #e8f5e9; color: #2e7d32; }
    .vp-pill.fail   { background: #ffebee; color: #c62828; }
    .vp-pill .dot { width: 6px; height: 6px; border-radius: 50%; animation: blink 1s ease-in-out infinite; }
    .vp-pill.phase1 .dot { background: #e65100; }
    .vp-pill.phase2 .dot { background: #1565c0; }
    .vp-pill.done .dot, .vp-pill.fail .dot { animation: none; }
    .vp-pill.done .dot { background: #2e7d32; }
    .vp-pill.fail .dot { background: #c62828; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    /* Single ring — used for both phases, colour swaps */
    .vp-ring-wrap { width: 120px; height: 120px; position: relative; display: flex; align-items: center; justify-content: center; margin-bottom: 18px; }
    .vp-ring-svg { position: absolute; inset: 0; width: 120px; height: 120px; }
    .vp-ring-track { fill: none; stroke: #eef2f7; stroke-width: 5; }
    .vp-ring-fill  {
      fill: none; stroke: #e65100; stroke-width: 5; stroke-linecap: round;
      stroke-dasharray: 301.6;   /* 2π × 48 */
      stroke-dashoffset: 301.6;
      transform: rotate(-90deg); transform-origin: 50% 50%;
      transition: stroke-dashoffset 0.15s linear, stroke 0.4s ease;
    }
    /* Center label */
    .vp-center { display: flex; flex-direction: column; align-items: center; line-height: 1; gap: 3px; z-index: 1; }
    .vp-pct-big  { font-size: 22px; font-weight: 900; color: #e65100; transition: color 0.4s; letter-spacing: -0.5px; }
    .vp-pct-unit { font-size: 9px; font-weight: 700; color: #aaa; letter-spacing: 0.03em; text-transform: uppercase; max-width: 80px; text-align: center; line-height: 1.3; word-break: break-all; }
    /* Stats row */
    .vp-stats-row { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; margin-bottom: 6px; flex-wrap: wrap; justify-content: center; }
    .vp-recv      { color: #1565c0; }
    .vp-sep       { color: #ddd; }
    .vp-speed     { color: #e65100; font-size: 11px; }
    .vp-total-lbl { color: #bbb; font-size: 11px; }
    .vp-status { font-size: 11px; color: #aaa; min-height: 16px; margin-bottom: 4px; }
    .vp-err    { color: #e53935; font-size: 13px; font-weight: 700; margin-top: 6px; }
    /* Save row */
    #viewer-save-row { flex-shrink: 0; padding: 0 16px 16px; display: none; }
    #viewer-save-row.visible { display: block; }
    #save-trigger-btn { width: 100%; display: flex; align-items: center; gap: 14px; padding: 14px 18px; background: #e8f5e9; color: #2e7d32; border: none; border-radius: 16px; cursor: pointer; font-size: 14px; font-weight: 700; transition: opacity 0.1s; }
    #save-trigger-btn:active { opacity: 0.75; }
    #save-trigger-btn .btn-icon { font-size: 22px; flex-shrink: 0; }
    #save-trigger-btn .btn-label { flex: 1; text-align: left; }
    #save-trigger-btn .btn-title { display: block; font-size: 14px; font-weight: 700; }
    #save-trigger-btn .btn-sub   { display: block; font-size: 11px; font-weight: 500; opacity: 0.7; margin-top: 1px; }
    /* Embed phase */
    #viewer-embed-phase { flex: 1; display: none; flex-direction: column; }
    #viewer-embed-phase.visible { display: flex; }
    #viewer-embed-phase embed, #viewer-embed-phase iframe { flex: 1; width: 100%; border: none; }
    /* ── Password Gate Modal ── */
    #password-gate { display: none; position: fixed; inset: 0; z-index: 9999; background: linear-gradient(135deg, #0a1628 0%, #1a2a4a 50%, #0d1f3c 100%); align-items: center; justify-content: center; }
    #password-gate.active { display: flex; }
    .pw-card { background: rgba(255,255,255,0.06); backdrop-filter: blur(24px); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 48px 40px; max-width: 400px; width: 92%; text-align: center; box-shadow: 0 24px 80px rgba(0,0,0,0.4); animation: pw-slide-in 0.5s cubic-bezier(0.32,1,0.38,1); }
    @keyframes pw-slide-in { from { opacity: 0; transform: translateY(30px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .pw-lock-icon { font-size: 56px; margin-bottom: 16px; animation: pw-float 3s ease-in-out infinite; }
    @keyframes pw-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    .pw-title { font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 6px; letter-spacing: -0.3px; }
    .pw-subtitle { font-size: 13px; color: rgba(255,255,255,0.5); margin-bottom: 28px; font-weight: 500; }
    .pw-input-wrap { position: relative; margin-bottom: 16px; }
    .pw-input-wrap input { width: 100%; padding: 14px 48px 14px 18px; border: 2px solid rgba(255,255,255,0.12); border-radius: 14px; background: rgba(255,255,255,0.07); color: #fff; font-size: 16px; font-weight: 600; letter-spacing: 3px; text-align: center; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
    .pw-input-wrap input::placeholder { color: rgba(255,255,255,0.25); letter-spacing: 1px; font-weight: 500; }
    .pw-input-wrap input:focus { border-color: rgba(255,255,255,0.35); box-shadow: 0 0 0 4px rgba(255,255,255,0.06); }
    .pw-input-wrap .pw-toggle-vis { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); background: none; border: none; color: rgba(255,255,255,0.4); font-size: 18px; cursor: pointer; padding: 4px; }
    .pw-input-wrap .pw-toggle-vis:hover { color: rgba(255,255,255,0.7); }
    .pw-submit { width: 100%; padding: 14px; background: linear-gradient(135deg, #1a7a3a, #22a548); color: #fff; font-size: 15px; font-weight: 700; border: none; border-radius: 14px; cursor: pointer; transition: transform 0.1s, box-shadow 0.2s; letter-spacing: 0.3px; }
    .pw-submit:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(26,122,58,0.4); }
    .pw-submit:active { transform: scale(0.97); }
    .pw-error { color: #ff6b6b; font-size: 12px; font-weight: 600; margin-top: 12px; min-height: 18px; transition: opacity 0.2s; }
    .pw-error.shake { animation: pw-shake 0.4s ease; }
    @keyframes pw-shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-8px); } 40%,80% { transform: translateX(8px); } }
    .pw-attempts { font-size: 11px; color: rgba(255,255,255,0.25); margin-top: 8px; }
  </style>
</head>
<body>
<div class="container">
  <div id="progress-bar"></div>
  <div class="header">
    <div class="brand">
      <img id="logo" class="logo" />
      <div class="title-area"><h1 style="font-size:18px;margin:0;">OpenCLOUD <span id="tenant-name"></span></h1></div>
    </div>
    <div id="stats-summary" class="stats-pill">Syncing...</div>
  </div>
  <div class="controls">
    <div id="breadcrumbs" class="breadcrumb"></div>
    <div class="view-toggle">
      <button class="view-btn" id="btn-sync" title="Sync with Google Drive" onclick="forceSync()">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      </button>
      <button class="view-btn active" id="btn-grid" title="Grid view" onclick="setView('grid')">
        <svg viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
      </button>
      <button class="view-btn" id="btn-list" title="List view" onclick="setView('list')">
        <svg viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/></svg>
      </button>
    </div>
  </div>
  <div id="content-area"><div id="file-list" class="grid"></div></div>
  <div class="footer">
    <img src="https://www.energy-stock.com/vr2.png" style="height:18px;width:auto;opacity:0.55;vertical-align:middle;">
    <span>OPENCLOUD &mdash; DOCUMENT ACCESS PORTAL</span>
    <span class="sep">&bull;</span>
    <span>&copy; 2026 <a href="mailto:bop@vr2.in">bop@vr2.in</a></span>
    <span class="sep">&bull;</span>
    <span>v1.5</span>
  </div>
</div>

<!-- ════ INLINE VIEWER PANEL ════ -->
<div id="viewer-backdrop" onclick="closeViewer()"></div>
<div id="viewer-panel">
  <div id="viewer-handle-bar" onclick="closeViewer()"></div>
  <div id="viewer-topbar">
    <div id="viewer-file-icon">📄</div>
    <div id="viewer-file-name">Loading…</div>
    <div id="viewer-file-size"></div>
    <button id="viewer-close-btn" onclick="closeViewer()">✕</button>
  </div>

  <div id="viewer-progress-phase">
    <div class="vp-pill phase1" id="vp-pill">
      <span class="dot"></span>
      <span id="vp-pill-label">Secure Connect</span>
    </div>
    <div class="vp-ring-wrap">
      <svg class="vp-ring-svg" viewBox="0 0 120 120">
        <circle class="vp-ring-track" cx="60" cy="60" r="48"/>
        <circle class="vp-ring-fill"  id="vp-ring-fill" cx="60" cy="60" r="48"/>
      </svg>
      <div class="vp-center">
        <span class="vp-pct-big"  id="vp-pct-big">···</span>
        <span class="vp-pct-unit" id="vp-pct-unit">connecting</span>
      </div>
    </div>
    <div class="vp-stats-row">
      <span class="vp-recv"      id="vp-recv"></span>
      <span class="vp-sep"       id="vp-sep1" style="display:none">·</span>
      <span class="vp-speed"     id="vp-speed"></span>
      <span class="vp-sep"       id="vp-sep2" style="display:none">·</span>
      <span class="vp-total-lbl" id="vp-total"></span>
    </div>
    <div class="vp-status" id="vp-status">Connecting…</div>
    <div class="vp-err"    id="vp-err"></div>
  </div>

  <div id="viewer-embed-phase"></div>

  <div id="viewer-save-row">
    <button id="save-trigger-btn" onclick="startViewerSave()">
      <span class="btn-icon">⬇︎</span>
      <span class="btn-label">
        <span class="btn-title" id="save-btn-title">Save to Files</span>
        <span class="btn-sub"   id="save-btn-sub">Download to your device</span>
      </span>
    </button>
  </div>
</div>

<!-- ════ FOLDER PASSWORD POPUP ════ -->
<div id="password-gate">
  <div class="pw-card">
    <div class="pw-lock-icon">🔐</div>
    <div class="pw-title">Protected Folder</div>
    <div class="pw-subtitle" id="pw-folder-name">Enter the access password to continue</div>
    <div class="pw-input-wrap">
      <input type="password" id="pw-input" placeholder="Enter password" autocomplete="off" />
      <button class="pw-toggle-vis" id="pw-toggle" onclick="togglePwVis()">👁</button>
    </div>
    <button class="pw-submit" id="pw-submit" onclick="submitPassword()">Unlock Access</button>
    <div class="pw-error" id="pw-error"></div>
    <div class="pw-attempts" id="pw-attempts"></div>
    <button onclick="closePwGate()" style="margin-top:14px;background:none;border:none;color:rgba(255,255,255,0.35);font-size:12px;cursor:pointer;font-weight:600;">Cancel</button>
  </div>
</div>

<script>
  let memoryCache = {};
  let TREE = null, TREE_BRAND = null, currentView;
  let _currentFolderId = null; // tracks the folder the user is currently viewing
  let _viewerFileId = null, _viewerTenant = null,
      _viewerName = '', _viewerSize = '', _viewerBlobUrl = null;
  let _saveInProgress = false;

  const params = new URLSearchParams(window.location.search);
  const tenant = params.get("OpenCLOUD") || "T";

  /* ── Per-folder password tracking ── */
  const _unlockedFolders = new Set();
  let _pendingFolderId = null;
  let _pwAttempts = 0;
  const MAX_PW_ATTEMPTS = 5;

  const storage = {
    get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch(e) { return memoryCache[k] || null; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) { memoryCache[k] = v; } },
  };

  function fmtBytes(b) {
    if (!b) return '0 B';
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + ['B','KB','MB','GB'][i];
  }

  function parseSizeHint(s) {
    if (!s) return null;
    const m = s.match(/([\d.]+)\s*(B|KB|MB|GB)/i);
    if (!m) return null;
    return Math.round(parseFloat(m[1]) * ({ B:1, KB:1024, MB:1048576, GB:1073741824 }[m[2].toUpperCase()] || 1));
  }

  function getIcon(mime, name) {
    if (mime) {
      if (mime.includes('pdf')) return 'icon-pdf';
      if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return 'icon-sheet';
      if (mime.includes('document') || mime.includes('word')) return 'icon-word';
    }
    const n = (name || '').toLowerCase();
    if (n.endsWith('.pdf')) return 'icon-pdf';
    if (n.endsWith('.xls') || n.endsWith('.xlsx') || n.endsWith('.csv')) return 'icon-sheet';
    if (n.endsWith('.doc') || n.endsWith('.docx')) return 'icon-word';
    return 'icon-pdf';
  }

  function findNode(node, id) {
    if (node.id === id) return node;
    for (const child of node.folders) { const f = findNode(child, id); if (f) return f; }
    return null;
  }

  function buildPath(node, id, trail) {
    trail = trail || [];
    trail.push({ id: node.id, name: node.name });
    if (node.id === id) return trail;
    for (const child of node.folders) { const r = buildPath(child, id, [...trail]); if (r) return r; }
    return null;
  }

  function countRecursive(node) {
    let folders = 0, files = node.files.length;
    for (const child of node.folders) { folders++; const s = countRecursive(child); folders += s.folders; files += s.files; }
    return { folders, files };
  }

  /* ── Ring constants ── */
  const RING_CIRC = 301.6; // 2π × 48

  /* ── Reset viewer UI ── */
  function resetViewerProgress() {
    const fill = document.getElementById('vp-ring-fill');
    fill.style.transition       = 'none';
    fill.style.stroke           = '#e65100';
    fill.style.strokeDashoffset = String(RING_CIRC); // empty

    document.getElementById('vp-pill').className         = 'vp-pill phase1';
    document.getElementById('vp-pill-label').textContent = 'Secure Connect';

    const pctBig  = document.getElementById('vp-pct-big');
    const pctUnit = document.getElementById('vp-pct-unit');
    pctBig.style.color    = '#e65100';
    pctBig.style.fontSize = '18px';
    pctBig.textContent    = '···';
    pctUnit.textContent   = 'connecting';

    document.getElementById('vp-recv').textContent  = '';
    document.getElementById('vp-speed').textContent = '';
    document.getElementById('vp-total').textContent = _viewerSize || '';
    document.getElementById('vp-sep1').style.display = 'none';
    document.getElementById('vp-sep2').style.display = 'none';
    document.getElementById('vp-status').textContent = 'Connecting…';
    document.getElementById('vp-err').textContent    = '';
    document.getElementById('viewer-progress-phase').style.display = 'flex';

    requestAnimationFrame(() => { fill.style.transition = 'stroke-dashoffset 0.15s linear, stroke 0.4s ease'; });
  }

  /* ── Open / close ── */
  function openViewer(id, name, size, ten) {
    _viewerFileId   = id;
    _viewerTenant   = ten;
    _viewerName     = name;
    _viewerSize     = size || '';
    _viewerBlobUrl  = null;
    _saveInProgress = false;

    document.getElementById('viewer-file-name').textContent = name;
    document.getElementById('viewer-file-size').textContent = size || '';
    resetViewerProgress();
    const ep = document.getElementById('viewer-embed-phase');
    ep.classList.remove('visible'); ep.innerHTML = '';
    document.getElementById('viewer-save-row').classList.remove('visible');
    resetSaveBtn();

    document.getElementById('viewer-backdrop').classList.add('open');
    document.getElementById('viewer-panel').classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('viewer-save-row').classList.add('visible');

    runViewerStream(id, ten, size);
  }

  function closeViewer() {
    document.getElementById('viewer-panel').classList.remove('open');
    document.getElementById('viewer-backdrop').classList.remove('open');
    document.body.style.overflow = '';
    if (_viewerBlobUrl) { URL.revokeObjectURL(_viewerBlobUrl); _viewerBlobUrl = null; }
    _saveInProgress = false;
  }

  /* ══════════════════════════════════════════════
     SINGLE-RING STREAMING
     Phase 1 (orange, looping dots): server fetch
     Phase 2 (blue, real %): byte download
     Centre always shows real % during phase 2
  ══════════════════════════════════════════════ */
  async function runViewerStream(id, ten, sizeHint) {
    const fill    = document.getElementById('vp-ring-fill');
    const pill    = document.getElementById('vp-pill');
    const pillLb  = document.getElementById('vp-pill-label');
    const pctBig  = document.getElementById('vp-pct-big');
    const pctUnit = document.getElementById('vp-pct-unit');
    const recvEl  = document.getElementById('vp-recv');
    const speedEl = document.getElementById('vp-speed');
    const totalEl = document.getElementById('vp-total');
    const sep1    = document.getElementById('vp-sep1');
    const sep2    = document.getElementById('vp-sep2');
    const statusEl= document.getElementById('vp-status');
    const errEl   = document.getElementById('vp-err');

    // ── Phase 1: looping orange ring + dot animation ──
    const CYCLE_MS = 2000, P1_TICK = 40;
    let p1Elapsed = 0, phase1Done = false;
    const dots = ['·  ','·· ','···','· ·'];
    let dotIdx  = 0;

    const dotIntv = setInterval(() => {
      if (phase1Done) return;
      pctBig.textContent = dots[dotIdx++ % dots.length];
    }, 300);

    const p1Intv = setInterval(() => {
      if (phase1Done) return;
      p1Elapsed += P1_TICK;
      if (p1Elapsed >= CYCLE_MS) {
        p1Elapsed = 0;
        fill.style.transition       = 'none';
        fill.style.strokeDashoffset = String(RING_CIRC);
        requestAnimationFrame(() => { fill.style.transition = 'stroke-dashoffset 0.15s linear'; });
        return;
      }
      fill.style.strokeDashoffset = String(RING_CIRC * (1 - p1Elapsed / CYCLE_MS));
    }, P1_TICK);

    try {
      // ── Fetch fires immediately ──
      const res = await fetch('/file?id=' + id + '&OpenCLOUD=' + ten);
      if (!res.ok) { const t = await res.text(); throw new Error('Server ' + res.status + ': ' + t.slice(0, 150)); }

      // ── Phase 1 complete ──
      phase1Done = true;
      clearInterval(p1Intv);
      clearInterval(dotIntv);

      // Ring: freeze at full orange briefly then swap to blue, reset to empty
      fill.style.transition       = 'stroke-dashoffset 0.2s ease';
      fill.style.strokeDashoffset = '0'; // fill orange to 100%
      await new Promise(r => setTimeout(r, 250));
      fill.style.transition       = 'none';
      fill.style.stroke           = '#1565c0';
      fill.style.strokeDashoffset = String(RING_CIRC); // reset to empty, now blue
      requestAnimationFrame(() => { fill.style.transition = 'stroke-dashoffset 0.15s linear, stroke 0.4s ease'; });

      // Pill + centre switch to phase 2
      pill.className     = 'vp-pill phase2';
      pillLb.textContent = 'Downloading';
      pctBig.style.fontSize = '22px';
      pctBig.style.color    = '#1565c0';
      pctBig.textContent    = '0%';
      pctUnit.textContent   = 'of total';
      statusEl.textContent  = 'Transferring file…';

      // Drive API Content-Length is unreliable (returns compressed/partial size).
      // Use the tree-cache size hint as the authoritative total.
      // Fall back to CL only when no hint is available at all.
      const cl         = res.headers.get('Content-Length');
      const clBytes    = cl ? parseInt(cl, 10) : 0;
      const hintBytes  = parseSizeHint(sizeHint) || parseSizeHint(_viewerSize) || 0;
      // Prefer hint; only use CL if hint is absent AND CL > hint (hint=0 case)
      const totalBytes = hintBytes > 0 ? hintBytes : (clBytes || null);
      if (totalBytes) {
        const fmt = fmtBytes(totalBytes);
        totalEl.textContent = fmt;
        document.getElementById('viewer-file-size').textContent = fmt;
        sep2.style.display = 'inline';
      }

      const reader  = res.body.getReader();
      const chunks  = [];
      let received  = 0;
      let speedBytesWindow = 0, speedTimeStart = Date.now();
      let lastSpeedUpdate  = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received       += value.length;
        speedBytesWindow += value.length;

        // Update speed every 600ms using sliding window
        const now = Date.now();
        const dt  = (now - lastSpeedUpdate) / 1000;
        if (dt >= 0.6) {
          const spd = speedBytesWindow / dt;
          speedEl.textContent  = fmtBytes(spd) + '/s';
          sep1.style.display   = 'inline';
          speedBytesWindow = 0;
          lastSpeedUpdate  = now;

          // Show ETA in status line
          if (totalBytes && spd > 0) {
            const remaining = totalBytes - received;
            const etaSec    = Math.round(remaining / spd);
            statusEl.textContent = etaSec > 0
              ? 'About ' + (etaSec < 60 ? etaSec + 's left…' : Math.ceil(etaSec/60) + 'min left…')
              : 'Almost done…';
          }
        }
        recvEl.textContent = fmtBytes(received);

        if (totalBytes) {
          // Real %: received / best-known total
          const pct = Math.min(received / totalBytes, 0.99);
          fill.style.strokeDashoffset = String(RING_CIRC * (1 - pct));
          pctBig.textContent  = Math.floor(pct * 100) + '%';
          pctUnit.textContent = fmtBytes(received);
        } else {
          // No total known: asymptotic ring, show rough % estimate
          const fake = Math.min(received / (received + 20e6), 0.90);
          fill.style.strokeDashoffset = String(RING_CIRC * (1 - fake));
          pctBig.textContent  = Math.floor(fake * 100) + '%';
          pctUnit.textContent = fmtBytes(received) + ' received';
        }
      }

      // ── Done ──
      fill.style.stroke           = '#2e7d32';
      fill.style.strokeDashoffset = '0';
      pctBig.style.color    = '#2e7d32';
      pctBig.textContent    = '100%';
      pctUnit.textContent   = 'complete';
      recvEl.textContent    = fmtBytes(received);
      totalEl.textContent   = fmtBytes(received);
      speedEl.textContent   = '';
      sep1.style.display    = 'none';
      statusEl.textContent  = 'Opening file…';
      pill.className        = 'vp-pill done';
      pillLb.textContent    = 'Complete';
      document.getElementById('save-btn-sub').textContent = 'Download ready';

      const blob = new Blob(chunks, { type: 'application/pdf' });
      _viewerBlobUrl = URL.createObjectURL(blob);
      await new Promise(r => setTimeout(r, 380));

      document.getElementById('viewer-progress-phase').style.display = 'none';
      const embedPhase = document.getElementById('viewer-embed-phase');
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

      if (isIOS) {
        embedPhase.innerHTML =
          '<div style="flex:1;display:flex;flex-direction:column;align-items:center;' +
          'justify-content:center;gap:16px;padding:32px;">' +
            '<div style="font-size:56px;">📄</div>' +
            '<div style="font-size:14px;font-weight:700;color:#111;text-align:center;">' + _viewerName + '</div>' +
            '<div style="font-size:12px;color:#999;">' + fmtBytes(received) + ' · Ready to open</div>' +
            '<a href="/preview?id=' + _viewerFileId + '&OpenCLOUD=' + _viewerTenant +
               '&name=' + encodeURIComponent(_viewerName) +
               (_viewerSize ? '&size=' + encodeURIComponent(_viewerSize) : '') +
               '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;' +
               'gap:10px;padding:14px 28px;background:#e3f2fd;color:#1565c0;border-radius:14px;' +
               'font-size:14px;font-weight:700;text-decoration:none;">👁 Open PDF</a>' +
          '</div>';
      } else {
        embedPhase.innerHTML =
          '<embed src="' + _viewerBlobUrl + '" type="application/pdf" width="100%" height="100%">';
      }
      embedPhase.classList.add('visible');

    } catch(e) {
      phase1Done = true;
      clearInterval(p1Intv); clearInterval(dotIntv);
      fill.style.stroke           = '#e53935';
      fill.style.strokeDashoffset = '0';
      errEl.textContent     = 'Error: ' + e.message;
      statusEl.textContent  = '';
      pill.className        = 'vp-pill fail';
      pillLb.textContent    = 'Failed';
      pctBig.textContent    = '✕';
      pctBig.style.color    = '#e53935';
      pctUnit.textContent   = 'error';
    }
  }

  /* ── Save button ── */
  function resetSaveBtn() {
    _saveInProgress = false;
    document.getElementById('save-btn-title').textContent = 'Save to Files';
    document.getElementById('save-btn-sub').textContent   = 'Download to your device';
    document.querySelector('#save-trigger-btn .btn-icon').textContent = '⬇︎';
  }

  function startViewerSave() {
    if (_saveInProgress) return;
    _saveInProgress = true;
    const iconEl  = document.querySelector('#save-trigger-btn .btn-icon');
    const titleEl = document.getElementById('save-btn-title');
    const subEl   = document.getElementById('save-btn-sub');
    iconEl.textContent  = '⏳';
    titleEl.textContent = 'Starting download…';
    subEl.textContent   = 'Check your Files app shortly';
    const a = document.createElement('a');
    if (_viewerBlobUrl) { a.href = _viewerBlobUrl; a.download = _viewerName || 'document.pdf'; }
    else { a.href = '/download?id=' + _viewerFileId + '&OpenCLOUD=' + _viewerTenant + '&name=' + encodeURIComponent(_viewerName); }
    a.style.display = 'none';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    iconEl.textContent  = '✓';
    titleEl.textContent = 'Download started';
    subEl.textContent   = 'Check your Files app';
    setTimeout(resetSaveBtn, 3000);
  }

  /* ── Portal render ── */
  currentView = storage.get('view_pref') || 'grid';
  setView(currentView, true);

  function setView(v, silent) {
    currentView = v;
    if (!silent) storage.set('view_pref', v);
    document.getElementById('btn-grid').classList.toggle('active', v === 'grid');
    document.getElementById('btn-list').classList.toggle('active', v === 'list');
    if (!silent && TREE) {
      const fid = new URLSearchParams(window.location.search).get('folderId') || TREE.id;
      const node = findNode(TREE, fid) || TREE;
      const path = buildPath(TREE, node.id) || [{ id: TREE.id, name: TREE.name }];
      renderNode(node, path);
    }
  }

  function renderNode(node, path) {
    /* Determine icon per folder based on its own protected flag */
    if (!TREE_BRAND) return;
    document.getElementById("logo").src = TREE_BRAND.logo;
    document.getElementById("tenant-name").innerText = tenant;
    document.body.style.setProperty('--primary', TREE_BRAND.color);
    const totals = countRecursive(node);
    document.getElementById("stats-summary").innerHTML = '📁 ' + totals.folders + '&nbsp;&nbsp;📄 ' + totals.files;
    document.getElementById("breadcrumbs").innerHTML = path.map((p, i) =>
      i < path.length - 1
        ? '<span onclick="navigate(\\'' + p.id + '\\')">' + p.name + '</span><span class="sep"> / </span>'
        : '<span style="color:#333;cursor:default;">' + p.name + '</span>'
    ).join('');
    const fl = document.getElementById("file-list");
    if (currentView === 'list') {
      fl.className = 'list';
      let html = "";
      node.folders.forEach(f => { html += '<div class="list-item" onclick="navigate(\\'' + f.id + '\\')">' + '<div class="icon ' + (f.protected ? 'folder-locked-icon' : 'folder-icon') + '"></div><div class="name">' + f.name + '</div><span class="arrow">&#8250;</span></div>'; });
      node.files.forEach(f => { html += '<div class="list-item" onclick="openViewer(\\'' + f.id + '\\',\\'' + f.name.replace(/'/g,"\\'") + '\\',\\'' + (f.size||'') + '\\',\\'' + tenant + '\\')">' + '<div class="icon ' + getIcon(f.mime, f.name) + '"></div><div class="name">' + f.name + '</div><span class="size-badge">' + (f.size || '') + '</span><span class="arrow">&#8250;</span></div>'; });
      fl.innerHTML = html || '<div style="text-align:center;padding:40px;color:#999;">Empty folder</div>';
    } else {
      fl.className = 'grid';
      let html = "";
      node.folders.forEach(f => { html += '<div class="item" onclick="navigate(\\'' + f.id + '\\')">' + '<div class="icon ' + (f.protected ? 'folder-locked-icon' : 'folder-icon') + '"></div><div class="name">' + f.name + '</div></div>'; });
      node.files.forEach(f => { html += '<div class="item" onclick="openViewer(\\'' + f.id + '\\',\\'' + f.name.replace(/'/g,"\\'") + '\\',\\'' + (f.size||'') + '\\',\\'' + tenant + '\\')">' + '<div class="icon ' + getIcon(f.mime, f.name) + '"></div><div class="name">' + f.name + '</div><div class="file-size">' + (f.size || '') + '</div></div>'; });
      fl.innerHTML = html || '<div style="text-align:center;padding:40px;color:#999;">Empty folder</div>';
    }
  }

  function navigate(folderId) {
    if (!TREE) return;
    const node = findNode(TREE, folderId);
    if (!node) return;

    /* ── Check if this folder is protected and not yet unlocked ── */
    if (node.protected && !_unlockedFolders.has(folderId)) {
      _pendingFolderId = folderId;
      _pwAttempts = 0;
      const gate = document.getElementById('password-gate');
      document.getElementById('pw-folder-name').textContent = '\ud83d\udcc1 ' + node.name;
      document.getElementById('pw-input').value = '';
      document.getElementById('pw-error').textContent = '';
      document.getElementById('pw-attempts').textContent = '';
      document.getElementById('pw-submit').disabled = false;
      document.getElementById('pw-submit').style.opacity = '1';
      document.getElementById('pw-input').disabled = false;
      gate.classList.add('active');
      setTimeout(() => document.getElementById('pw-input').focus(), 100);
      return;
    }

    _currentFolderId = folderId;
    const path = buildPath(TREE, folderId) || [{ id: TREE.id, name: TREE.name }];
    window.history.pushState({ fid: folderId }, "", '?OpenCLOUD=' + tenant + '&folderId=' + folderId);
    renderNode(node, path);
  }

  window.onpopstate = (e) => { if (e.state && e.state.fid && TREE) navigate(e.state.fid); };

  function showSyncOverlay() {
    const TOTAL = 5, CIRCUMFERENCE = 226.2;
    const overlay = document.createElement('div');
    overlay.className = 'sync-overlay'; overlay.id = 'sync-overlay';
    overlay.innerHTML = '<div class="sync-icon-wrap"><div class="sync-ring"></div><svg class="sync-arc-svg" viewBox="0 0 80 80"><circle class="sync-arc-track" cx="40" cy="40" r="36"/><circle class="sync-arc-fill" id="sync-arc" cx="40" cy="40" r="36"/></svg><span class="sync-num" id="sync-num">' + TOTAL + '</span></div><div class="sync-label">Synchronising\u2026</div><div class="sync-sub" id="sync-sub">Fetching file index from server</div>';
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = ''; contentArea.appendChild(overlay);
    const arcEl = document.getElementById('sync-arc'), numEl = document.getElementById('sync-num'), subEl = document.getElementById('sync-sub');
    let elapsed = 0, done = false;
    const intv = setInterval(() => {
      if (done) return;
      elapsed += 50;
      arcEl.style.strokeDashoffset = CIRCUMFERENCE * (1 - Math.min(elapsed / (TOTAL * 1000), 1));
      const secs = Math.max(0, TOTAL - Math.floor(elapsed / 1000));
      numEl.textContent = secs;
      if (secs <= 1) subEl.textContent = 'Almost ready\u2026';
    }, 50);
    return {
      finish: (cb) => {
        done = true; clearInterval(intv);
        arcEl.style.strokeDashoffset = 0; numEl.textContent = '\u2713'; numEl.style.fontSize = '28px';
        setTimeout(() => {
          const o = document.getElementById('sync-overlay');
          if (o) { o.style.transition = 'opacity 0.3s'; o.style.opacity = '0'; setTimeout(() => { o.remove(); const ca = document.getElementById('content-area'); ca.innerHTML = ''; const fl = document.createElement('div'); fl.id = 'file-list'; fl.className = 'grid'; ca.appendChild(fl); if (cb) cb(); }, 320); }
          else { if (cb) cb(); }
        }, 300);
      }
    };
  }

  async function boot() {
    const treeCacheKey = 'tree_' + tenant, treeTsKey = 'tree_ts_' + tenant;
    const TREE_TTL = 4 * 60 * 60 * 1000; // 4 hours

    // ── STALE-WHILE-REVALIDATE: show cache INSTANTLY, sync in background ──
    const cached = storage.get(treeCacheKey);
    if (cached && cached.tree) {
      TREE = cached.tree;
      TREE_BRAND = cached.brand;
      const startFolderId = params.get("folderId") || TREE.id;
      const node = findNode(TREE, startFolderId) || TREE;
      const path = buildPath(TREE, node.id) || [{ id: TREE.id, name: TREE.name }];
      renderNode(node, path);

      // Background sync only if cache is expired
      const ts = storage.get(treeTsKey);
      if (!ts || (Date.now() - ts) > TREE_TTL) {
        refreshTree(treeCacheKey, treeTsKey).then(() => {
          if (TREE) {
            const f = params.get("folderId") || TREE.id;
            const n = findNode(TREE, f) || TREE;
            const p = buildPath(TREE, f) || [{ id: TREE.id, name: TREE.name }];
            renderNode(n, p);
          }
        });
      }
      return; // UI shown instantly — done!
    }

    // ── FIRST TIME: show overlay, wait for network ──
    const overlay = showSyncOverlay();
    await refreshTree(treeCacheKey, treeTsKey);
    overlay.finish(() => {
      if (TREE) {
        const startFolderId = params.get("folderId") || TREE.id;
        const node = findNode(TREE, startFolderId) || TREE;
        const path = buildPath(TREE, node.id) || [{ id: TREE.id, name: TREE.name }];
        renderNode(node, path);
      }
    });
  }

  async function refreshTree(cacheKey, tsKey) {
    try {
      const res = await fetch('/api?action=tree&OpenCLOUD=' + tenant + '&v=2');
      const data = await res.json();
      if (data && data.success && data.tree) {
        TREE = data.tree; TREE_BRAND = data.brand;
        storage.set(cacheKey, data); storage.set(tsKey, Date.now());
        if (data.timestamp && (Date.now() - data.timestamp) > 4 * 60 * 60 * 1000) fetch('/api?action=tree&OpenCLOUD=' + tenant + '&rebuild=true');
      }
    } catch(e) {}
  }

  async function forceSync() {
    const btn = document.getElementById('btn-sync');
    const syncSvg = btn ? btn.querySelector('svg') : null;
    if (btn) { btn.style.opacity = '0.4'; btn.style.pointerEvents = 'none'; }
    if (syncSvg) syncSvg.style.animation = 'spin 0.8s linear infinite';

    const treeCacheKey = 'tree_' + tenant, treeTsKey = 'tree_ts_' + tenant;

    /* ── Show full-page blurred sync overlay ── */
    const fsOverlay = document.createElement('div');
    fsOverlay.className = 'force-sync-overlay'; fsOverlay.id = 'fs-overlay';
    let fsSecs = 210;
    fsOverlay.innerHTML = '<div class="fs-ring-wrap"><div class="fs-ring"></div><span class="fs-num" id="fs-num">' + fsSecs + '</span></div><div class="fs-label">Syncing with Google Drive\u2026</div><div class="fs-sub" id="fs-sub">Rebuilding file index from server</div>';
    document.body.appendChild(fsOverlay);
    document.querySelector('.container').style.filter = 'blur(6px)';
    document.querySelector('.container').style.pointerEvents = 'none';

    const fsIntv = setInterval(() => {
      fsSecs--;
      const el = document.getElementById('fs-num');
      const sub = document.getElementById('fs-sub');
      if (el) el.textContent = fsSecs > 0 ? fsSecs : '...';
      if (sub && fsSecs <= 10) sub.textContent = 'Almost done\u2026';
      else if (sub && fsSecs <= 60) sub.textContent = 'Building file tree\u2026';
      if (fsSecs <= 0) clearInterval(fsIntv);
    }, 1000);

    function removeFsOverlay() {
      clearInterval(fsIntv);
      const o = document.getElementById('fs-overlay');
      if (o) {
        const numEl = document.getElementById('fs-num');
        if (numEl) { numEl.textContent = '\u2713'; numEl.style.color = '#2e7d32'; }
        const subEl = document.getElementById('fs-sub');
        if (subEl) subEl.textContent = 'Sync complete!';
        setTimeout(() => {
          o.style.transition = 'opacity 0.4s ease';
          o.style.opacity = '0';
          setTimeout(() => {
            o.remove();
            document.querySelector('.container').style.filter = '';
            document.querySelector('.container').style.pointerEvents = '';
          }, 420);
        }, 500);
      } else {
        document.querySelector('.container').style.filter = '';
        document.querySelector('.container').style.pointerEvents = '';
      }
    }

    try {
      const startTime = Date.now();
      let newData = null;
      
      try {
        const res = await fetch('/api?action=tree&OpenCLOUD=' + tenant + '&rebuild=true');
        newData = await res.json();
      } catch (timeoutErr) {
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 6000));
          try {
            const checkRes = await fetch('/api?action=tree&OpenCLOUD=' + tenant + '&v=' + Date.now());
            const checkData = await checkRes.json();
            if (checkData && checkData.success && checkData.timestamp && checkData.timestamp > startTime) {
              newData = checkData;
              break;
            }
          } catch(e) {}
        }
      }

      if (newData && newData.success && newData.tree) {
        TREE = newData.tree; TREE_BRAND = newData.brand;
        storage.set(treeCacheKey, newData); storage.set(treeTsKey, Date.now());
        const f = _currentFolderId || TREE.id;
        const n = findNode(TREE, f) || TREE;
        const p = buildPath(TREE, f) || [{ id: TREE.id, name: TREE.name }];
        removeFsOverlay();
        setTimeout(() => renderNode(n, p), 500);
      } else {
        removeFsOverlay();
        setTimeout(() => alert('Sync timed out. Please try again later.'), 600);
      }
    } catch(e) {
      removeFsOverlay();
      setTimeout(() => alert('Network error during sync.'), 600);
    }

    if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
    if (syncSvg) syncSvg.style.animation = '';
  }

  /* ── Password popup logic ── */
  function togglePwVis() {
    const inp = document.getElementById('pw-input');
    const btn = document.getElementById('pw-toggle');
    if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '\ud83d\udd12'; }
    else { inp.type = 'password'; btn.textContent = '\ud83d\udc41'; }
  }

  function closePwGate() {
    _pendingFolderId = null;
    document.getElementById('password-gate').classList.remove('active');
  }

  function submitPassword() {
    const inp = document.getElementById('pw-input');
    const errEl = document.getElementById('pw-error');
    const attEl = document.getElementById('pw-attempts');
    const submitBtn = document.getElementById('pw-submit');
    const val = inp.value.trim();

    if (!val) { errEl.textContent = 'Please enter a password'; return; }
    if (!_pendingFolderId || !TREE) return;

    _pwAttempts++;
    if (_pwAttempts >= MAX_PW_ATTEMPTS) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.4';
      inp.disabled = true;
      errEl.textContent = 'Too many attempts. Close and try again.';
      return;
    }

    const node = findNode(TREE, _pendingFolderId);
    if (node && node.password && val === node.password) {
      _unlockedFolders.add(_pendingFolderId);
      errEl.textContent = '';
      const gate = document.getElementById('password-gate');
      gate.style.transition = 'opacity 0.35s ease';
      gate.style.opacity = '0';
      const fid = _pendingFolderId;
      _pendingFolderId = null;
      setTimeout(() => {
        gate.classList.remove('active');
        gate.style.opacity = '';
        gate.style.transition = '';
        navigate(fid);
      }, 380);
    } else {
      errEl.textContent = 'Incorrect password. Please try again.';
      errEl.classList.remove('shake');
      void errEl.offsetWidth;
      errEl.classList.add('shake');
      attEl.textContent = _pwAttempts + ' of ' + MAX_PW_ATTEMPTS + ' attempts used';
      inp.value = '';
      inp.focus();
    }
  }

  document.getElementById('pw-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') submitPassword();
  });

  boot();
</script>
</body>
</html>`;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
};