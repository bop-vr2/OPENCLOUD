export default {
  async fetch(request, env, ctx) {
    const API_URL = "https://script.google.com/macros/s/AKfycby0DDFUZ_s8nn75hBcEACIIlTFdt2WXrRcdDak6PEj6oa4ait7tO5ikxpi4sJgPrx90/exec";
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();

    // Auto-detect tenant based on the subdomain
    let currentTenant = "10"; // Default (DEYE)
    if (hostname.includes("sieger")) currentTenant = "11";
    else if (hostname.includes("foxess")) currentTenant = "12";
    else if (hostname.includes("feston")) currentTenant = "13";

    // Allow URL parameter to override, otherwise use the auto-detected tenant
    const reqTenant = url.searchParams.get("OpenCLOUD") || currentTenant;

    // ── /download — attachment mode ──
    if (url.pathname.startsWith("/download")) {
      const id = url.searchParams.get("id");
      const nameParam = url.searchParams.get("name") || "document.pdf";
      if (!id) return new Response("Missing file ID", { status: 400 });
      try {
        const metaResp = await fetch(
          API_URL + "?action=driveurl&id=" + id +
          "&OpenCLOUD=" + reqTenant,
          { cf: { cacheTtl: 0 } }
        );
        if (!metaResp.ok) return new Response("GAS error: " + metaResp.status, { status: 502 });
        const meta = await metaResp.json();
        if (!meta.success || !meta.url || !meta.token)
          return new Response("GAS error: " + (meta.error || "no URL"), { status: 502 });

        const safeName = nameParam.replace(/[^\w.\-\s]/g, "_");
        const driveResp = await fetch(meta.url, {
          headers: { "Authorization": "Bearer " + meta.token }
        });
        if (!driveResp.ok) return new Response("Drive error: " + driveResp.status, { status: 502 });

        const headers = new Headers({
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeName}"`,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "private, max-age=3600"
        });
        const cl = driveResp.headers.get("Content-Length");
        if (cl) headers.set("Content-Length", cl);
        return new Response(driveResp.body, { status: 200, headers });
      } catch (err) {
        return new Response("Worker error: " + err.message, { status: 500 });
      }
    }

    // ── /file — Stream directly from Drive API ──
    if (url.pathname.startsWith("/file")) {
      const id = url.searchParams.get("id");
      if (!id) return new Response("Missing file ID", { status: 400 });
      try {
        const metaResp = await fetch(
          API_URL + "?action=driveurl&id=" + id +
          "&OpenCLOUD=" + reqTenant,
          { cf: { cacheTtl: 0 } }
        );
        if (!metaResp.ok) return new Response("GAS error: " + metaResp.status, { status: 502 });
        const meta = await metaResp.json();
        if (!meta.success || !meta.url || !meta.token)
          return new Response("GAS error: " + (meta.error || "no URL"), { status: 502 });

        const safeName = (meta.name || "file").replace(/[^\w.\-\s]/g, "_");
        const driveResp = await fetch(meta.url, {
          headers: { "Authorization": "Bearer " + meta.token }
        });
        if (!driveResp.ok) {
          const t = await driveResp.text();
          return new Response("Drive error " + driveResp.status + ": " + t, { status: 502 });
        }
        const headers = new Headers({
          "Content-Type": meta.mime || "application/pdf",
          "Content-Disposition": `inline; filename="${safeName}"`,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "private, max-age=3600"
        });
        const cl = driveResp.headers.get("Content-Length");
        if (cl) headers.set("Content-Length", cl);
        return new Response(driveResp.body, { status: 200, headers });
      } catch (err) {
        return new Response("Worker error: " + err.message, { status: 500 });
      }
    }

    // ── /preview — Loading screen for iOS new-tab PDF open ──
    if (url.pathname.startsWith("/preview")) {
      const id = url.searchParams.get("id");
      const name = url.searchParams.get("name") || "Document";
      const sizeHint = url.searchParams.get("size") || "";
      const ten = reqTenant;
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
    .arc-fill  { fill: none; stroke: #e65100; stroke-width: 4; stroke-linecap: round; stroke-dasharray: ${CIRC}; stroke-dashoffset: 0; transform: rotate(-90deg); transform-origin: 50% 50%; transition: stroke-dashoffset 0.1s linear, stroke 0.4s ease; }
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
      <circle class="arc-fill"  id="arc"  cx="40" cy="40" r="36"/>
    </svg>
    <span class="counter" id="counter">7</span>
  </div>
  <div class="filename">${name}</div>
  <div class="file-size">${sizeHint || 'Calculating size\u2026'}</div>
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
  const CIRC = ${CIRC};
  const arc     = document.getElementById('arc');
  const ring    = document.getElementById('ring');
  const pill    = document.getElementById('pill');
  const pillLb  = document.getElementById('pill-label');
  const counter = document.getElementById('counter');
  const bar     = document.getElementById('bar');
  const recv    = document.getElementById('recv');
  const pct     = document.getElementById('pct');
  const status  = document.getElementById('status');
  const errEl   = document.getElementById('err');

  function fmtBytes(b) {
    if (!b) return '0 B';
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + ['B','KB','MB','GB'][i];
  }

  function countdown() {
    return new Promise(resolve => {
      let elapsed = 0;
      const totalMs = 7000, tick = 50;
      arc.style.strokeDashoffset = 0;
      const intv = setInterval(() => {
        elapsed += tick;
        arc.style.strokeDashoffset = CIRC * (elapsed / totalMs);
        const rem = Math.max(0, 7 - Math.floor(elapsed / 1000));
        counter.textContent = rem || '';
        status.textContent  = rem > 0 ? 'Establishing secure connection\u2026 (' + rem + 's)' : 'Connecting\u2026';
        if (elapsed >= totalMs) { clearInterval(intv); resolve(); }
      }, tick);
    });
  }

  function switchPhase2(sz) {
    pill.className = 'phase-pill phase2'; pillLb.textContent = 'Streaming';
    ring.className = 'spin-ring phase2';
    arc.style.stroke = '#1565c0'; arc.style.strokeDashoffset = CIRC;
    counter.className = 'counter phase2'; counter.textContent = '';
    bar.className = 'bar-fill phase2';
    status.textContent = 'Streaming file\u2026';
    pct.textContent = '0%'; recv.textContent = '0 B';
    if (sz) document.getElementById('tot').textContent = sz;
  }

  async function run() {
    try {
      await countdown();
      const res = await fetch('/file?id=${id}&OpenCLOUD=${ten}');
      if (!res.ok) { const t = await res.text(); throw new Error('Server ' + res.status + ': ' + t.slice(0,120)); }
      const cl = res.headers.get('Content-Length');
      const totalBytes = cl ? parseInt(cl, 10) : null;
      switchPhase2(totalBytes ? fmtBytes(totalBytes) : '${sizeHint}');
      const reader = res.body.getReader();
      const chunks = []; let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); received += value.length;
        if (totalBytes) { const p = Math.min((received/totalBytes)*100,99); bar.style.width=p+'%'; pct.textContent=Math.floor(p)+'%'; }
        else { const f=Math.min((received/(received+5e6))*90,90); bar.style.width=f+'%'; pct.textContent=Math.floor(f)+'%'; }
        recv.textContent = fmtBytes(received);
      }
      bar.style.width='100%'; bar.className='bar-fill done';
      pct.textContent='100%'; recv.textContent=fmtBytes(received);
      document.getElementById('tot').textContent=fmtBytes(received);
      status.textContent='Opening file\u2026';
      pill.className='phase-pill done'; pillLb.textContent='Complete';
      ring.className='spin-ring stopped'; arc.style.strokeDashoffset=CIRC;
      const blob = new Blob(chunks, { type: 'application/pdf' });
      const objUrl = URL.createObjectURL(blob);
      setTimeout(() => {
        document.body.innerHTML = '<embed src="' + objUrl + '" type="application/pdf" width="100%" height="100%" style="border:none;position:fixed;inset:0;">';
        document.body.style.cssText = 'margin:0;padding:0;background:#fff;';
      }, 350);
    } catch(e) {
      bar.style.background='#e53935'; bar.style.width='100%';
      errEl.textContent='Error: '+e.message; status.textContent='';
      pill.className='phase-pill fail'; pillLb.textContent='Failed';
      ring.className='spin-ring stopped';
    }
  }
  run();
<\/script>
</body>
</html>`;
      return new Response(previewHtml, { headers: { "Content-Type": "text/html" } });
    }

    // ── /api — Proxy to GAS ──
    if (url.pathname.startsWith("/api")) {
      const isRebuild = url.searchParams.get("rebuild") === "true";
      const googleResp = await fetch(API_URL + url.search, {
        cf: isRebuild ? { cacheTtl: 0, cacheEverything: false } : {}
      });
      const cacheHeader = isRebuild
        ? "no-store"
        : "public, max-age=300";
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
    .icon-pdf    { background-image: url('https://upload.wikimedia.org/wikipedia/commons/8/87/PDF_file_icon.svg'); }
    .icon-sheet  { background-image: url('https://upload.wikimedia.org/wikipedia/commons/3/30/Google_Sheets_logo_%282014-2020%29.svg'); }
    .icon-word   { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath fill='%232b579a' d='M11 6h17l10 10v26H11z'/%3E%3Cpath fill='%23fff' d='M23 30h-4l-3-8-3 8H9l4.5-12h4l2.5 7.5L22.5 18h4z'/%3E%3C/svg%3E"); }
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
    @keyframes spin   { to { transform: rotate(360deg); } }
    @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(4px)} }
    .skeleton-item { background: #f9f9f9; border-radius: 12px; height: 160px; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%{opacity:1} 50%{opacity:0.5} 100%{opacity:1} }
    .footer { padding: 18px 20px 22px; border-top: 1px solid #f0f0f0; font-size: 11px; color: #bbb; font-weight: 600; letter-spacing: 0.03em; display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; }
    .footer a { color: #bbb; text-decoration: none; }
    .footer a:hover { color: #999; }
    .footer .sep { color: #ddd; }

    /* ════════════════════════════════════════
       INLINE FILE VIEWER PANEL
       Slides up from bottom, covers ~90% of screen.
       Contains: progress phase → embedded PDF
    ════════════════════════════════════════ */
    #viewer-backdrop {
      display: none;
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 300;
      animation: fadeIn 0.2s ease;
    }
    #viewer-backdrop.open { display: block; }
    @keyframes fadeIn { from{opacity:0} to{opacity:1} }

    #viewer-panel {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      height: 92dvh;
      background: #fff;
      border-radius: 22px 22px 0 0;
      box-shadow: 0 -8px 48px rgba(0,0,0,0.22);
      z-index: 301;
      display: flex; flex-direction: column;
      transform: translateY(100%);
      transition: transform 0.36s cubic-bezier(0.32,1,0.38,1);
      overflow: hidden;
    }
    #viewer-panel.open { transform: translateY(0); }

    /* drag handle */
    #viewer-handle-bar {
      width: 40px; height: 4px;
      background: #dde3ec; border-radius: 4px;
      margin: 12px auto 0; flex-shrink: 0;
      cursor: pointer;
    }

    /* top bar inside panel */
    #viewer-topbar {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 16px 12px;
      border-bottom: 1px solid #f0f0f0;
      flex-shrink: 0;
    }
    #viewer-file-icon { font-size: 24px; flex-shrink: 0; }
    #viewer-file-name {
      font-size: 13px; font-weight: 700; color: #111;
      flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    }
    #viewer-file-size { font-size: 11px; color: #999; font-weight: 600; flex-shrink: 0; }
    #viewer-close-btn {
      width: 32px; height: 32px; border-radius: 50%;
      background: #f0f0f0; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; color: #555; flex-shrink: 0;
      transition: background 0.15s;
    }
    #viewer-close-btn:hover { background: #e0e0e0; }

    /* ── PROGRESS PHASE ── */
    #viewer-progress-phase {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 28px 28px 20px; gap: 0;
    }

    /* phase pill */
    .vp-pill {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 10px; font-weight: 800; letter-spacing: 0.08em;
      text-transform: uppercase; padding: 4px 12px;
      border-radius: 20px; margin-bottom: 20px;
      transition: background 0.4s ease, color 0.4s ease;
    }
    .vp-pill.phase1 { background: #fff3e0; color: #e65100; }
    .vp-pill.phase2 { background: #e3f2fd; color: #1565c0; }
    .vp-pill.done   { background: #e8f5e9; color: #2e7d32; }
    .vp-pill.fail   { background: #ffebee; color: #c62828; }
    .vp-pill .dot {
      width: 6px; height: 6px; border-radius: 50%;
      animation: blink 1s ease-in-out infinite;
    }
    .vp-pill.phase1 .dot { background: #e65100; }
    .vp-pill.phase2 .dot { background: #1565c0; }
    .vp-pill.done .dot, .vp-pill.fail .dot { animation: none; }
    .vp-pill.done .dot { background: #2e7d32; }
    .vp-pill.fail .dot { background: #c62828; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

    /* ── DUAL-RING: outer ring = phase1 (orange), inner arc = phase2 (blue) ── */
    .vp-ring-wrap {
      width: 110px; height: 110px;
      position: relative; display: flex; align-items: center; justify-content: center;
      margin-bottom: 18px;
    }
    /* Outer track (phase1 background) */
    .vp-outer-svg { position: absolute; inset: 0; width: 110px; height: 110px; }
    .vp-outer-track { fill: none; stroke: #f0e8e0; stroke-width: 7; }
    .vp-outer-fill  {
      fill: none; stroke: #e65100; stroke-width: 7; stroke-linecap: round;
      stroke-dasharray: 267; stroke-dashoffset: 267;
      transform: rotate(-90deg); transform-origin: 50% 50%;
      transition: stroke-dashoffset 0.12s linear;
    }
    /* Inner track (phase2 background) */
    .vp-inner-svg { position: absolute; inset: 0; width: 110px; height: 110px; }
    .vp-inner-track { fill: none; stroke: #ddeeff; stroke-width: 6; }
    .vp-inner-fill  {
      fill: none; stroke: #1565c0; stroke-width: 6; stroke-linecap: round;
      stroke-dasharray: 188; stroke-dashoffset: 188;
      transform: rotate(-90deg); transform-origin: 50% 50%;
      transition: stroke-dashoffset 0.12s linear;
    }
    /* Center pct label */
    .vp-center {
      display: flex; flex-direction: column; align-items: center;
      line-height: 1; gap: 2px; z-index: 1;
    }
    .vp-pct-big  { font-size: 22px; font-weight: 900; color: #111; transition: color 0.4s; }
    .vp-pct-unit { font-size: 10px; font-weight: 700; color: #aaa; letter-spacing: 0.05em; }

    /* stats below ring */
    .vp-stats-row {
      display: flex; align-items: center; gap: 10px;
      font-size: 12px; font-weight: 700;
      margin-bottom: 6px;
    }
    .vp-recv  { color: #1565c0; }
    .vp-sep   { color: #ddd; }
    .vp-speed { color: #e65100; font-size: 11px; }
    .vp-total-lbl { color: #bbb; font-size: 11px; }
    .vp-status { font-size: 11px; color: #aaa; min-height: 16px; margin-bottom: 4px; }
    .vp-err    { color: #e53935; font-size: 13px; font-weight: 700; margin-top: 6px; }

    /* Save button shown during / after load */
    #viewer-save-row {
      flex-shrink: 0;
      padding: 0 16px 16px;
      display: none;
    }
    #viewer-save-row.visible { display: block; }

    /* Save countdown button */
    #save-trigger-btn {
      width: 100%;
      display: flex; align-items: center; gap: 14px;
      padding: 14px 18px;
      background: #e8f5e9; color: #2e7d32;
      border: none; border-radius: 16px;
      cursor: pointer; font-size: 14px; font-weight: 700;
      transition: opacity 0.1s;
    }
    #save-trigger-btn:active { opacity: 0.75; }
    #save-trigger-btn .btn-icon { font-size: 22px; flex-shrink: 0; }
    #save-trigger-btn .btn-label { flex: 1; text-align: left; }
    #save-trigger-btn .btn-title { display: block; font-size: 14px; font-weight: 700; }
    #save-trigger-btn .btn-sub   { display: block; font-size: 11px; font-weight: 500; opacity: 0.7; margin-top: 1px; }
    #save-cnt-wrap {
      display: none; align-items: center; justify-content: center;
      width: 40px; height: 40px; position: relative; flex-shrink: 0;
    }
    #save-cnt-wrap svg { position: absolute; inset: 0; width: 40px; height: 40px; }
    #save-cnt-num { font-size: 14px; font-weight: 900; color: #2e7d32; position: relative; z-index: 1; }

    /* ── PDF embed (shown after stream) ── */
    #viewer-embed-phase {
      flex: 1; display: none; flex-direction: column;
    }
    #viewer-embed-phase.visible { display: flex; }
    #viewer-embed-phase embed,
    #viewer-embed-phase iframe {
      flex: 1; width: 100%; border: none;
    }
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
    <span>v1.2</span>
  </div>
</div>

<!-- ════ INLINE VIEWER PANEL ════ -->
<div id="viewer-backdrop" onclick="closeViewer()"></div>
<div id="viewer-panel">
  <div id="viewer-handle-bar" onclick="closeViewer()"></div>

  <!-- Top bar -->
  <div id="viewer-topbar">
    <div id="viewer-file-icon">📄</div>
    <div id="viewer-file-name">Loading…</div>
    <div id="viewer-file-size"></div>
    <button id="viewer-close-btn" onclick="closeViewer()">✕</button>
  </div>

  <!-- Progress phase: dual-ring, starts immediately -->
  <div id="viewer-progress-phase">
    <div class="vp-pill phase1" id="vp-pill">
      <span class="dot"></span>
      <span id="vp-pill-label">Secure Connect</span>
    </div>

    <div class="vp-ring-wrap">
      <!-- Outer ring: phase1 progress (server fetch, orange) r=38 → circ≈238.8 -->
      <svg class="vp-outer-svg" viewBox="0 0 110 110">
        <circle class="vp-outer-track" cx="55" cy="55" r="43"/>
        <circle class="vp-outer-fill"  id="vp-outer" cx="55" cy="55" r="43"/>
      </svg>
      <!-- Inner ring: phase2 progress (download bytes, blue) r=30 → circ≈188.5 -->
      <svg class="vp-inner-svg" viewBox="0 0 110 110">
        <circle class="vp-inner-track" cx="55" cy="55" r="30"/>
        <circle class="vp-inner-fill"  id="vp-inner" cx="55" cy="55" r="30"/>
      </svg>
      <!-- Centre label -->
      <div class="vp-center">
        <span class="vp-pct-big"  id="vp-pct-big">—</span>
        <span class="vp-pct-unit" id="vp-pct-unit">loading</span>
      </div>
    </div>

    <div class="vp-stats-row">
      <span class="vp-recv"      id="vp-recv">—</span>
      <span class="vp-sep">·</span>
      <span class="vp-speed"     id="vp-speed">—</span>
      <span class="vp-sep">·</span>
      <span class="vp-total-lbl" id="vp-total">—</span>
    </div>
    <div class="vp-status" id="vp-status">Connecting…</div>
    <div class="vp-err"    id="vp-err"></div>
  </div>

  <!-- Phase 3: embedded PDF -->
  <div id="viewer-embed-phase">
    <!-- embed injected here by JS -->
  </div>

  <!-- Save row (shown once panel opens) -->
  <div id="viewer-save-row">
    <button id="save-trigger-btn" onclick="startViewerSave()">
      <span class="btn-icon">⬇︎</span>
      <span class="btn-label">
        <span class="btn-title" id="save-btn-title">Save to Files</span>
        <span class="btn-sub"   id="save-btn-sub">Download to your device</span>
      </span>
      <span id="save-cnt-wrap">
        <svg viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(46,125,50,0.2)" stroke-width="3"/>
          <circle id="save-arc" cx="20" cy="20" r="16" fill="none" stroke="#2e7d32"
            stroke-width="3" stroke-linecap="round"
            stroke-dasharray="100.5" stroke-dashoffset="100.5"
            transform="rotate(-90 20 20)"
            style="transition:stroke-dashoffset 0.1s linear;"/>
        </svg>
        <span id="save-cnt-num">7</span>
      </span>
    </button>
  </div>
</div>

<script>
  /* ── Shared state ── */
  let memoryCache = {};
  let TREE = null, TREE_BRAND = null;
  let currentView;
  let _currentFolderId = null;
  let _viewerFileId = null, _viewerTenant = null,
      _viewerName = '', _viewerSize = '', _viewerBlobUrl = null;
  let _saveInProgress = false;

  const params = new URLSearchParams(window.location.search);
  const tenant = params.get("OpenCLOUD") || "${reqTenant}";

  /* ── Storage helper ── */
  const storage = {
    get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch(e) { return memoryCache[k] || null; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) { memoryCache[k] = v; } },
  };

  /* ── Helpers ── */
  function fmtBytes(b) {
    if (!b) return '0 B';
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + ['B','KB','MB','GB'][i];
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
    for (const child of node.folders) {
      folders++;
      const s = countRecursive(child);
      folders += s.folders; files += s.files;
    }
    return { folders, files };
  }

  /* ════════════════════════════════════════
     INLINE VIEWER — open / close
  ════════════════════════════════════════ */
  function openViewer(id, name, size, ten) {
    _viewerFileId  = id;
    _viewerTenant  = ten;
    _viewerName    = name;
    _viewerSize    = size || '';
    _viewerBlobUrl = null;
    _saveInProgress = false;

    // Reset UI
    document.getElementById('viewer-file-name').textContent = name;
    document.getElementById('viewer-file-size').textContent = size || '';
    resetViewerProgress();
    document.getElementById('viewer-embed-phase').classList.remove('visible');
    document.getElementById('viewer-embed-phase').innerHTML = '';
    document.getElementById('viewer-save-row').classList.remove('visible');
    resetSaveBtn();

    // Show backdrop + panel
    document.getElementById('viewer-backdrop').classList.add('open');
    document.getElementById('viewer-panel').classList.add('open');
    document.body.style.overflow = 'hidden';

    // Show save row immediately so user knows it's there
    document.getElementById('viewer-save-row').classList.add('visible');

    // Start streaming
    runViewerStream(id, ten, size);
  }

  function closeViewer() {
    document.getElementById('viewer-panel').classList.remove('open');
    document.getElementById('viewer-backdrop').classList.remove('open');
    document.body.style.overflow = '';
    // Revoke blob URL to free memory
    if (_viewerBlobUrl) { URL.revokeObjectURL(_viewerBlobUrl); _viewerBlobUrl = null; }
    _saveInProgress = false;
  }

  /* ════════════════════════════════════════
     VIEWER — dual-ring real-time progress
     Outer ring (orange) = phase1: server fetch  (0→50% of total)
     Inner ring (blue)   = phase2: byte download (50→100% of total)
     No fake countdowns — fetch starts immediately.
  ════════════════════════════════════════ */
  const OUTER_CIRC = 270.2; // 2π×43
  const INNER_CIRC = 188.5; // 2π×30

  // Parse size string like "36.7 MB" → bytes, or null
  function parseSizeHint(s) {
    if (!s) return null;
    const m = s.match(/([\d.]+)\s*(B|KB|MB|GB)/i);
    if (!m) return null;
    const n = parseFloat(m[1]);
    const u = m[2].toUpperCase();
    return Math.round(n * ({ B:1, KB:1024, MB:1048576, GB:1073741824 }[u] || 1));
  }

  function resetViewerProgress() {
    document.getElementById('vp-pill').className = 'vp-pill phase1';
    document.getElementById('vp-pill-label').textContent = 'Secure Connect';
    document.getElementById('vp-outer').style.strokeDashoffset = String(OUTER_CIRC);
    document.getElementById('vp-inner').style.strokeDashoffset = String(INNER_CIRC);
    document.getElementById('vp-pct-big').textContent  = '...';
    document.getElementById('vp-pct-unit').textContent = 'connecting'; 
    document.getElementById('vp-recv').textContent  = '—';
    document.getElementById('vp-speed').textContent = '—';
    document.getElementById('vp-total').textContent = _viewerSize || '—';
    document.getElementById('vp-status').textContent = 'Connecting…';
    document.getElementById('vp-err').textContent = '';
    document.getElementById('viewer-progress-phase').style.display = 'flex';
  }

async function runViewerStream(id, ten, sizeHint) {
    const outerEl  = document.getElementById('vp-outer');
    const innerEl  = document.getElementById('vp-inner');
    const pill     = document.getElementById('vp-pill');
    const pillLb   = document.getElementById('vp-pill-label');
    const pctBig   = document.getElementById('vp-pct-big');
    const pctUnit  = document.getElementById('vp-pct-unit');
    const recvEl   = document.getElementById('vp-recv');
    const speedEl  = document.getElementById('vp-speed');
    const totalEl  = document.getElementById('vp-total');
    const statusEl = document.getElementById('vp-status');
    const errEl    = document.getElementById('vp-err');

    function parseSizeHint(s) {
      if (!s) return null;
      const m = s.match(/([\d.]+)\s*(B|KB|MB|GB)/i);
      if (!m) return null;
      const n = parseFloat(m[1]);
      const u = m[2].toUpperCase();
      return Math.round(n * ({ B:1, KB:1024, MB:1048576, GB:1073741824 }[u] || 1));
    }

    const knownBytes = parseSizeHint(sizeHint);

    // ── Phase 1: orange outer ring loops indefinitely, no number shown ──
    const CYCLE_MS  = 2200;
    const P1_TICK   = 40;
    let   p1Elapsed = 0;
    let   phase1Done = false;

    // Center shows animated dots only — no jumping numbers
// With this:
pctBig.style.fontSize   = '9px';
pctBig.style.letterSpacing = '2px';
pctBig.textContent      = '';
pctUnit.textContent     = '';

const dotFrames = ['●○○', '○●○', '○○●', '○●○'];
let dotIdx = 0;
const dotIntv = setInterval(() => {
  if (phase1Done) return;
  pctBig.textContent = dotFrames[dotIdx % dotFrames.length];
  dotIdx++;
}, 380);

    const phase1Intv = setInterval(() => {
      if (phase1Done) return;
      p1Elapsed += P1_TICK;

      if (p1Elapsed >= CYCLE_MS) {
        p1Elapsed = 0;
        outerEl.style.transition = 'none';
        outerEl.style.strokeDashoffset = String(OUTER_CIRC);
        requestAnimationFrame(() => {
          outerEl.style.transition = 'stroke-dashoffset 0.04s linear';
        });
        return;
      }

      const progress = p1Elapsed / CYCLE_MS;
      outerEl.style.strokeDashoffset = String(OUTER_CIRC * (1 - progress));
      statusEl.textContent = 'Securing connection to server…';
    }, P1_TICK);

    try {
      const res = await fetch('/file?id=' + id + '&OpenCLOUD=' + ten);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error('Server error ' + res.status + ': ' + txt.substring(0, 150));
      }

      // ── Phase 1 COMPLETE ──
      phase1Done = true;
      clearInterval(phase1Intv);
      clearInterval(dotIntv);

      outerEl.style.transition = 'stroke-dashoffset 0.3s ease';
      outerEl.style.strokeDashoffset = '0';   // freeze orange at 100%

      // Reset center for blue phase — now show real % numbers
      pctBig.style.fontSize  = '22px';
      pctBig.textContent     = '0%';
      pctUnit.textContent    = 'downloading';

      pill.className     = 'vp-pill phase2';
      pillLb.textContent = 'Downloading';

      const cl         = res.headers.get('Content-Length');
      const totalBytes = cl ? parseInt(cl, 10) : knownBytes;
      if (totalBytes) {
        totalEl.textContent = fmtBytes(totalBytes);
        document.getElementById('viewer-file-size').textContent = fmtBytes(totalBytes);
      }
      statusEl.textContent = 'Transferring file…';

      // ── Phase 2: blue inner ring fills linearly with real bytes ──
      innerEl.style.strokeDashoffset = String(INNER_CIRC);

      const reader  = res.body.getReader();
      const chunks  = [];
      let received  = 0;
      let lastBytes = 0, lastTime = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;

        const now = Date.now();
        const dt  = (now - lastTime) / 1000;
        if (dt >= 0.4) {
          speedEl.textContent = fmtBytes((received - lastBytes) / dt) + '/s';
          lastBytes = received; lastTime = now;
        }
        recvEl.textContent = fmtBytes(received);

        if (totalBytes) {
          const dlPct = Math.min(received / totalBytes, 1);
          innerEl.style.strokeDashoffset = String(INNER_CIRC * (1 - dlPct));
          // Linear 0→99% while downloading
          pctBig.textContent  = Math.min(Math.floor(dlPct * 100), 99) + '%';
          pctUnit.textContent = 'downloading';
        } else {
          const fake = knownBytes
            ? Math.min(received / knownBytes, 0.95)
            : Math.min(received / (received + 8e6), 0.92);
          innerEl.style.strokeDashoffset = String(INNER_CIRC * (1 - fake));
          pctBig.textContent  = Math.floor(fake * 100) + '%';
          pctUnit.textContent = 'downloading';
        }
      }

      // ── Done: both rings green ──
      outerEl.style.stroke           = '#2e7d32';
      innerEl.style.strokeDashoffset = '0';
      innerEl.style.stroke           = '#2e7d32';
      pctBig.textContent             = '100%';
      pctUnit.textContent            = 'complete';
      recvEl.textContent             = fmtBytes(received);
      totalEl.textContent            = fmtBytes(received);
      speedEl.textContent            = '';
      statusEl.textContent           = 'Opening file…';
      pill.className                 = 'vp-pill done';
      pillLb.textContent             = 'Complete';

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
            '<a href="/download?id=' + _viewerFileId +
               '&OpenCLOUD=' + _viewerTenant +
               '&name=' + encodeURIComponent(_viewerName) + '" target="_blank" rel="noopener" ' +
               'style="display:inline-flex;align-items:center;gap:10px;padding:14px 28px;' +
               'background:#e3f2fd;color:#1565c0;border-radius:14px;font-size:14px;' +
               'font-weight:700;text-decoration:none;">👁 Open PDF</a>' +
          '</div>';
      } else {
        embedPhase.innerHTML =
          '<embed src="' + _viewerBlobUrl + '" type="application/pdf" width="100%" height="100%">';
      }
      embedPhase.classList.add('visible');
      document.getElementById('save-btn-sub').textContent = 'Download ready';

    } catch(e) {
      phase1Done = true;
      clearInterval(phase1Intv);
      clearInterval(dotIntv);
      outerEl.style.stroke   = '#e53935';
      innerEl.style.stroke   = '#e53935';
      errEl.textContent      = 'Error: ' + e.message;
      statusEl.textContent   = '';
      pill.className         = 'vp-pill fail';
      pillLb.textContent     = 'Failed';
      pctBig.textContent     = '!';
      pctUnit.textContent    = 'error';
    }
  }

  /* ════════════════════════════════════════
     VIEWER — Save: immediate download, brief feedback
  ════════════════════════════════════════ */
  function resetSaveBtn() {
    _saveInProgress = false;
    document.getElementById('save-btn-title').textContent = 'Save to Files';
    document.getElementById('save-btn-sub').textContent   = 'Download to your device';
    document.getElementById('save-cnt-wrap').style.display = 'none';
    document.querySelector('#save-trigger-btn .btn-icon').textContent = '⬇︎';
  }

  function startViewerSave() {
    if (_saveInProgress) return;
    _saveInProgress = true;

    const titleEl  = document.getElementById('save-btn-title');
    const subEl    = document.getElementById('save-btn-sub');
    const iconEl   = document.querySelector('#save-trigger-btn .btn-icon');

    iconEl.textContent  = '⏳';
    titleEl.textContent = 'Starting download…';
    subEl.textContent   = 'Check your Files app shortly';

    // Fire download immediately
    if (_viewerBlobUrl) {
      const a = document.createElement('a');
      a.href     = _viewerBlobUrl;
      a.download = _viewerName || 'document.pdf';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      // Stream not done yet — use /download endpoint
      const a = document.createElement('a');
      a.href = '/download?id=' + _viewerFileId +
               '&OpenCLOUD=' + _viewerTenant +
               '&name=' + encodeURIComponent(_viewerName);
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    iconEl.textContent  = '✓';
    titleEl.textContent = 'Download started';
    subEl.textContent   = 'Check your Files app';
    setTimeout(resetSaveBtn, 3000);
  }

  /* ════════════════════════════════════════
     PORTAL — view / render
  ════════════════════════════════════════ */
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
      node.folders.forEach(f => {
        html += '<div class="list-item" onclick="navigate(\\'' + f.id + '\\')">' +
          '<div class="icon folder-icon"></div>' +
          '<div class="name">' + f.name + '</div>' +
          '<span class="arrow">&#8250;</span></div>';
      });
      node.files.forEach(f => {
        html += '<div class="list-item" onclick="openViewer(\\'' + f.id + '\\',\\'' +
          f.name.replace(/'/g,"\\'") + '\\',\\'' + (f.size||'') + '\\',\\'' + tenant + '\\')">' +
          '<div class="icon ' + getIcon(f.mime, f.name) + '"></div>' +
          '<div class="name">' + f.name + '</div>' +
          '<span class="size-badge">' + (f.size || '') + '</span>' +
          '<span class="arrow">&#8250;</span></div>';
      });
      fl.innerHTML = html || '<div style="text-align:center;padding:40px;color:#999;">Empty folder</div>';
    } else {
      fl.className = 'grid';
      let html = "";
      node.folders.forEach(f => {
        html += '<div class="item" onclick="navigate(\\'' + f.id + '\\')">' +
          '<div class="icon folder-icon"></div>' +
          '<div class="name">' + f.name + '</div></div>';
      });
      node.files.forEach(f => {
        html += '<div class="item" onclick="openViewer(\\'' + f.id + '\\',\\'' +
          f.name.replace(/'/g,"\\'") + '\\',\\'' + (f.size||'') + '\\',\\'' + tenant + '\\')">' +
          '<div class="icon ' + getIcon(f.mime, f.name) + '"></div>' +
          '<div class="name">' + f.name + '</div>' +
          '<div class="file-size">' + (f.size || '') + '</div></div>';
      });
      fl.innerHTML = html || '<div style="text-align:center;padding:40px;color:#999;">Empty folder</div>';
    }
  }

  function navigate(folderId) {
    if (!TREE) return;
    const node = findNode(TREE, folderId);
    if (!node) return;
    _currentFolderId = folderId;
    const path = buildPath(TREE, folderId) || [{ id: TREE.id, name: TREE.name }];
    window.history.pushState({ fid: folderId }, "", '?OpenCLOUD=' + tenant + '&folderId=' + folderId);
    renderNode(node, path);
  }

  window.onpopstate = (e) => { if (e.state && e.state.fid && TREE) navigate(e.state.fid); };

  /* ── Boot + sync overlay ── */
  function showSyncOverlay() {
    const TOTAL = 5, CIRCUMFERENCE = 226.2;
    const overlay = document.createElement('div');
    overlay.className = 'sync-overlay';
    overlay.id = 'sync-overlay';
    overlay.innerHTML =
      '<div class="sync-icon-wrap">' +
        '<div class="sync-ring"></div>' +
        '<svg class="sync-arc-svg" viewBox="0 0 80 80">' +
          '<circle class="sync-arc-track" cx="40" cy="40" r="36"/>' +
          '<circle class="sync-arc-fill" id="sync-arc" cx="40" cy="40" r="36"/>' +
        '</svg>' +
        '<span class="sync-num" id="sync-num">' + TOTAL + '</span>' +
      '</div>' +
      '<div class="sync-label">Synchronising\u2026</div>' +
      '<div class="sync-sub" id="sync-sub">Fetching file index from server</div>';
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '';
    contentArea.appendChild(overlay);

    const arcEl = document.getElementById('sync-arc');
    const numEl = document.getElementById('sync-num');
    const subEl = document.getElementById('sync-sub');
    const tick  = 50; let elapsed = 0; let done = false;

    const intv = setInterval(() => {
      if (done) return;
      elapsed += tick;
      const progress = Math.min(elapsed / (TOTAL * 1000), 1);
      arcEl.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
      const secs = Math.max(0, TOTAL - Math.floor(elapsed / 1000));
      numEl.textContent = secs;
      if (secs <= 1) subEl.textContent = 'Almost ready\u2026';
    }, tick);

    return {
      finish: (cb) => {
        done = true; clearInterval(intv);
        arcEl.style.strokeDashoffset = 0;
        numEl.textContent = '\u2713';
        numEl.style.fontSize = '28px';
        setTimeout(() => {
          const o = document.getElementById('sync-overlay');
          if (o) {
            o.style.transition = 'opacity 0.3s'; o.style.opacity = '0';
            setTimeout(() => {
              o.remove();
              const ca = document.getElementById('content-area');
              ca.innerHTML = '';
              const fl = document.createElement('div');
              fl.id = 'file-list'; fl.className = 'grid';
              ca.appendChild(fl);
              if (cb) cb();
            }, 320);
          } else { if (cb) cb(); }
        }, 300);
      }
    };
  }

  async function boot() {
    const TREE_TTL = 4 * 60 * 60 * 1000;
    const treeCacheKey = 'tree_' + tenant;
    const treeTsKey    = 'tree_ts_' + tenant;

    const cached = storage.get(treeCacheKey);
    if (cached && cached.tree) {
      TREE = cached.tree;
      TREE_BRAND = cached.brand;
      const startFolderId = params.get("folderId") || TREE.id;
      const node = findNode(TREE, startFolderId) || TREE;
      const path = buildPath(TREE, node.id) || [{ id: TREE.id, name: TREE.name }];
      renderNode(node, path);

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
      return;
    }

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
    const statsEl = document.getElementById('stats-summary');
    const origStats = statsEl ? statsEl.innerHTML : '';
    if (statsEl) statsEl.innerHTML = 'Syncing... <span id="sync-secs">90</span>s';

    let s = 90;
    const intv = setInterval(() => {
      s--;
      const el = document.getElementById('sync-secs');
      if (el) el.innerText = s > 0 ? s : 'Wait..';
      else clearInterval(intv);
    }, 1000);

    try {
      const startTime = Date.now();
      let newData = null;
      
      try {
        const res = await fetch('/api?action=tree&OpenCLOUD=' + tenant + '&rebuild=true');
        newData = await res.json();
      } catch (timeoutErr) {
        for (let i = 0; i < 15; i++) {
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

      clearInterval(intv);
      if (newData && newData.success && newData.tree) {
        TREE = newData.tree; TREE_BRAND = newData.brand;
        storage.set(treeCacheKey, newData); storage.set(treeTsKey, Date.now());
        const f = _currentFolderId || TREE.id;
        const n = findNode(TREE, f) || TREE;
        const p = buildPath(TREE, f) || [{ id: TREE.id, name: TREE.name }];
        renderNode(n, p);
      } else {
        if (statsEl) statsEl.innerHTML = origStats;
        alert('Sync timed out. Tenant has too many files. Please rely on the 4-hour background cron job instead.');
      }
    } catch(e) {
      clearInterval(intv);
      if (statsEl) statsEl.innerHTML = origStats;
      alert('Network error during sync.');
    }

    if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
    if (syncSvg) syncSvg.style.animation = '';
  }

  boot();
</script>
</body>
</html>`;
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
};