
(() => {
  const MAX_SIDE = 4000;
  const HISTORY_LIMIT = 40;

  const app = document.getElementById('app');
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const fileInput = document.getElementById('fileInput');
  const dims = document.getElementById('dims');
  const modeLabel = document.getElementById('modeLabel');
  const toolHint = document.getElementById('toolHint');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const compareBtn = document.getElementById('compareBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const exportFormat = document.getElementById('exportFormat');
  const exportQuality = document.getElementById('exportQuality');
  const exportQualityLabel = document.getElementById('exportQualityLabel');
  const exportQualityValue = document.getElementById('exportQualityValue');
  exportFormat.addEventListener('change', () => {
    const show = exportFormat.value === 'jpeg' || exportFormat.value === 'webp';
    exportQuality.style.display = show ? '' : 'none';
    exportQualityLabel.style.display = show ? '' : 'none';
  });
  exportQuality.addEventListener('input', () => exportQualityValue.textContent = exportQuality.value + '%');
  const cropBtn = document.getElementById('cropBtn');
  const drawBtn = document.getElementById('drawBtn');
  const fillBtn = document.getElementById('fillBtn');
  const brushHint = document.getElementById('brushHint');
  const fillStatus = document.getElementById('fillStatus');
  const resetBtn = document.getElementById('resetBtn');
  const brushColor = document.getElementById('brushColor');
  const brushSize = document.getElementById('brushSize');
  const brushSizeOut = document.getElementById('brushSizeOut');

  const removeBgBtn = document.getElementById('removeBgBtn');
  const bgStatus = document.getElementById('bgStatus');
  const nextSessionBtn = document.getElementById('nextSessionBtn');
  const prevSessionBtn = document.getElementById('prevSessionBtn');
  const sessionHint = document.getElementById('sessionHint');
  let session = 0;
  let backgroundRemoved = false;
  let backgroundSelected = false;
  let exported = false;
  const sessionNames = ['Upload foto', 'Hapus background AI', 'Pilih background', 'Export foto'];
  function setSession(next) {
    session = Math.max(0, Math.min(3, next));
    document.querySelectorAll('[data-session]').forEach(el => el.classList.toggle('active', Number(el.dataset.session) === session));
    prevSessionBtn.disabled = session === 0 || removingBg;
    nextSessionBtn.disabled = !hasImage || removingBg;
    nextSessionBtn.textContent = session === 3 ? (exported ? 'Foto Berikutnya →' : 'Export Foto →') : 'Next Sesi →';
    sessionHint.textContent = session === 0 ? 'Upload foto untuk memulai.' :
      session === 1 ? (backgroundRemoved ? 'Background sudah dihapus. Lanjut pilih background.' : 'Klik Hapus background otomatis untuk melanjutkan.') :
      session === 2 ? (backgroundSelected ? 'Background sudah dipilih. Lanjut ke Export.' : 'Pilih background merah, biru tua, transparan, atau custom.') :
      (exported ? 'Foto berhasil diekspor. Klik Foto Berikutnya untuk mulai lagi.' : 'Periksa hasil foto, lalu klik Export Foto.');
  }
  function goToControl(el) {
    el.scrollIntoView({behavior:'smooth',block:'center'});
    if (el.focus) el.focus({preventScroll:true});
  }
  nextSessionBtn.addEventListener('click', () => {
    if (removingBg || !hasImage) return;
    if (session === 0) {
      setSession(1); goToControl(removeBgBtn);
    } else if (session === 1) {
      if (!backgroundRemoved) { goToControl(removeBgBtn); bgStatus.textContent = 'Hapus background dulu sebelum lanjut, ya sayangg 💙'; return; }
      setSession(2); goToControl(document.getElementById('bgOptions'));
    } else if (session === 2) {
      if (!backgroundSelected) { goToControl(document.getElementById('bgOptions')); sessionHint.textContent = 'Pilih salah satu background dulu, ya sayangg 💙'; return; }
      setSession(3); goToControl(downloadBtn);
    } else if (!exported) { exportImage(); }
    else { setSession(0); fileInput.click(); }
  });
  prevSessionBtn.addEventListener('click', () => { if (!removingBg) setSession(session-1); });
  let bgType = 'transparent', bgCustom = '#7dd3fc', bgImage = null, removingBg = false;
  let imageGeneration = 0;
  const base = document.createElement('canvas');
  const bctx = base.getContext('2d');

  const SLIDERS = [
    { key: 'brightness', label: 'Brightness', min: 0, max: 200, def: 100, unit: '%' },
    { key: 'contrast', label: 'Contrast', min: 0, max: 200, def: 100, unit: '%' },
    { key: 'saturate', label: 'Saturation', min: 0, max: 200, def: 100, unit: '%' },
    { key: 'hue', label: 'Hue', min: -180, max: 180, def: 0, unit: '°' },
    { key: 'blur', label: 'Blur', min: 0, max: 20, def: 0, unit: 'px' },
    { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, def: 0, unit: '%' },
    { key: 'sepia', label: 'Sepia', min: 0, max: 100, def: 0, unit: '%' },
    { key: 'invert', label: 'Invert', min: 0, max: 100, def: 0, unit: '%' },
  ];
  const DEFAULTS = Object.fromEntries(SLIDERS.map(s => [s.key, s.def]));

  const PRESETS = [
    { name: 'Original', f: {} },
    { name: 'Vivid', f: { contrast: 115, saturate: 150, brightness: 105 } },
    { name: 'Mono', f: { grayscale: 100, contrast: 120 } },
    { name: 'Vintage', f: { sepia: 55, contrast: 90, brightness: 108, saturate: 80 } },
    { name: 'Cool', f: { hue: -15, saturate: 110, brightness: 102, contrast: 105 } },
    { name: 'Noir', f: { grayscale: 100, contrast: 160, brightness: 85 } },
  ];

  let filters = { ...DEFAULTS };
  let hasImage = false;
  let mode = 'move';
  let comparing = false;
  let history = [];
  let hIndex = -1;
  let fileName = 'image';

  let drawing = false;
  let lastPt = null;
  let cropRect = null;
  let cropStart = null;

  const sliderEls = {};
  const slidersRoot = document.getElementById('sliders');
  SLIDERS.forEach(s => {
    const wrap = document.createElement('div');
    wrap.className = 'slider';
    const id = 'sl-' + s.key;
    wrap.innerHTML =
      `<div class="slider-head"><label for="${id}">${s.label}</label><output id="${id}-out"></output></div>` +
      `<input type="range" id="${id}" min="${s.min}" max="${s.max}" value="${s.def}" disabled />`;
    slidersRoot.appendChild(wrap);
    const input = wrap.querySelector('input');
    const out = wrap.querySelector('output');
    sliderEls[s.key] = { input, out, s };
    input.addEventListener('input', () => {
      filters[s.key] = Number(input.value);
      out.textContent = input.value + s.unit;
      render();
    });
    input.addEventListener('change', commit);
    input.addEventListener('dblclick', () => {
      filters[s.key] = s.def;
      syncSliders();
      render();
      commit();
    });
  });

  const presetsRoot = document.getElementById('presets');
  const presetThumbs = PRESETS.map(p => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset';
    btn.disabled = true;
    const thumb = document.createElement('canvas');
    thumb.width = thumb.height = 96;
    thumb.setAttribute('aria-hidden', 'true');
    btn.appendChild(thumb);
    btn.appendChild(document.createTextNode(p.name));
    btn.addEventListener('click', () => {
      filters = { ...DEFAULTS, ...p.f };
      syncSliders();
      render();
      commit();
    });
    presetsRoot.appendChild(btn);
    return { btn, thumb, p };
  });

  function filterString(f, blurScale = 1) {
    return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) ` +
      `hue-rotate(${f.hue}deg) blur(${(f.blur * blurScale).toFixed(2)}px) grayscale(${f.grayscale}%) ` +
      `sepia(${f.sepia}%) invert(${f.invert}%)`;
  }

  function blurScaleFor(width) {
    return Math.max(1, width / 1000);
  }

  function syncSliders() {
    SLIDERS.forEach(s => {
      const { input, out } = sliderEls[s.key];
      input.value = filters[s.key];
      out.textContent = filters[s.key] + s.unit;
    });
  }
  syncSliders();

  let rafPending = false;
  function render() {
    if (!hasImage || rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      draw();
    });
  }

  function paintBackground(target, w, h) {
    if (bgType === 'transparent') return;
    target.save();
    if (bgType === 'image' && bgImage) {
      const scale = Math.max(w / bgImage.width, h / bgImage.height);
      const dw = bgImage.width * scale, dh = bgImage.height * scale;
      target.drawImage(bgImage, (w-dw)/2, (h-dh)/2, dw, dh);
    } else {
      target.fillStyle = bgType === 'red' ? '#e53935' : bgType === 'birutua' ? '#0033CC' : bgCustom;
      target.fillRect(0, 0, w, h);
    }
    target.restore();
  }

  function syncBackground() {
    document.querySelectorAll('[data-bg]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.bg === bgType)));
  }
  function setBackground(type) {
    if (!hasImage) return;
    bgType = type;
    backgroundSelected = true;
    if (session === 2) setSession(2);
    syncBackground();
    commit();
    draw();
  }

  function draw() {
    if (canvas.width !== base.width || canvas.height !== base.height) {
      canvas.width = base.width;
      canvas.height = base.height;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    paintBackground(ctx, canvas.width, canvas.height);
    ctx.filter = comparing ? 'none' : filterString(filters, blurScaleFor(base.width));
    ctx.drawImage(base, 0, 0);
    ctx.filter = 'none';

    if (mode === 'crop' && cropRect && cropRect.w > 0 && cropRect.h > 0) {
      const { x, y, w, h } = cropRect;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(x, y, w, h);
      ctx.fill('evenodd');
      const lw = Math.max(1, displayScale() * 1.5);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = lw * 1.5;
      ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        ctx.moveTo(x + (w * i) / 3, y); ctx.lineTo(x + (w * i) / 3, y + h);
        ctx.moveTo(x, y + (h * i) / 3); ctx.lineTo(x + w, y + (h * i) / 3);
      }
      ctx.stroke();
      ctx.restore();
    }
    if ((mode === 'fill') && eraseBounds && eraseMask.width === base.width) {
      ctx.save(); ctx.globalAlpha = 0.55; ctx.drawImage(eraseMask,0,0); ctx.restore();
    }
  }

  function updateThumbs() {
    const size = 96;
    const s = Math.max(size / base.width, size / base.height);
    const w = base.width * s, h = base.height * s;
    presetThumbs.forEach(({ thumb, p, btn }) => {
      const tctx = thumb.getContext('2d');
      tctx.clearRect(0, 0, size, size);
      tctx.filter = filterString({ ...DEFAULTS, ...p.f }, 0.1);
      tctx.drawImage(base, (size - w) / 2, (size - h) / 2, w, h);
      tctx.filter = 'none';
      btn.disabled = !hasImage;
    });
  }

  function displayScale() {
    const r = canvas.getBoundingClientRect();
    return r.width ? base.width / r.width : 1;
  }

  function toImagePoint(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.min(base.width, Math.max(0, (e.clientX - r.left) * (base.width / r.width))),
      y: Math.min(base.height, Math.max(0, (e.clientY - r.top) * (base.height / r.height))),
    };
  }

  function cloneCanvas(src) {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  function commit() {
    if (!hasImage) return;
    history = history.slice(0, hIndex + 1);
    history.push({ c: cloneCanvas(base), f: { ...filters }, bgType, bgCustom, bgImage });
    if (history.length > HISTORY_LIMIT) history.shift();
    hIndex = history.length - 1;
    updateUI();
  }

  function restore(i) {
    const snap = history[i];
    if (!snap) return;
    hIndex = i;
    replaceBase(snap.c);
    filters = { ...snap.f };
    backgroundSelected = snap.bgType !== 'transparent';
    bgType = snap.bgType || 'transparent'; bgCustom = snap.bgCustom || '#7dd3fc'; bgImage = snap.bgImage || null;
    syncBackground();
    syncSliders();
    updateThumbs();
    updateUI();
    draw();
  }

  function replaceBase(src) {
    base.width = src.width;
    base.height = src.height;
    bctx.drawImage(src, 0, 0);
  }

  function updateUI() {
    app.classList.toggle('has-image', hasImage);
    app.classList.toggle('mode-draw', mode === 'draw');
    app.classList.toggle('mode-crop', mode === 'crop');
    app.classList.toggle('mode-fill', mode === 'fill');
    undoBtn.disabled = !hasImage || hIndex <= 0;
    redoBtn.disabled = !hasImage || hIndex >= history.length - 1;
    [compareBtn, downloadBtn, cropBtn, drawBtn, fillBtn, resetBtn].forEach(b => (b.disabled = !hasImage));
    document.querySelectorAll('[data-action]').forEach(b => (b.disabled = !hasImage));
    Object.values(sliderEls).forEach(({ input }) => (input.disabled = !hasImage));
    removeBgBtn.disabled = !hasImage || removingBg;
    prevSessionBtn.disabled = session === 0 || removingBg;
    nextSessionBtn.disabled = !hasImage || removingBg;
    document.querySelectorAll('.bg-options button, .bg-options input').forEach(el => el.disabled = !hasImage || removingBg);
    cropBtn.setAttribute('aria-pressed', String(mode === 'crop'));
    drawBtn.setAttribute('aria-pressed', String(mode === 'draw'));
    brushHint.textContent = (mode === 'fill') ? 'Coret objek dengan kuas, lalu klik Hapus Objek Terpilih. Area tidak menjadi transparan.' : 'Atur ukuran kuas untuk menggambar.';
    fillBtn.setAttribute('aria-pressed', String(mode === 'fill'));
    dims.textContent = hasImage ? `${base.width} × ${base.height}px` : 'No image';
    modeLabel.textContent = 'Mode: ' + (mode === 'draw' ? 'Draw' : mode === 'crop' ? 'Crop' : mode === 'fill' ? 'Hapus Objek' : 'Move');
    toolHint.textContent =
      mode === 'crop' ? 'Drag on the image to select the area to keep.' :
      mode === 'fill' ? 'Atur ukuran kuas, coret objek, kemudian klik Hapus Objek Terpilih.' :
      mode === 'draw' ? 'Draw directly on the photo. Strokes are added to history.' :
      'Rotate, flip, crop or draw on your photo.';
  }

  function setMode(next) {
    mode = mode === next ? 'move' : next;
    cropRect = null;
    if (eraseBounds) clearEraseSelection();
    updateUI();
    render();
  }

  function loadImageSource(img, name) {
    clearEraseSelection();
    backgroundRemoved = false; backgroundSelected = false; exported = false;
    imageGeneration++; bgType = 'transparent'; bgImage = null; syncBackground(); bgStatus.textContent = 'Siap menghapus background.';
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    const s = Math.min(1, MAX_SIDE / Math.max(w, h));
    w = Math.round(w * s);
    h = Math.round(h * s);
    base.width = w;
    base.height = h;
    bctx.drawImage(img, 0, 0, w, h);
    fileName = (name || 'image').replace(/\.[^.]+$/, '');
    hasImage = true;
    mode = 'move';
    cropRect = null;
    filters = { ...DEFAULTS };
    syncSliders();
    history = [];
    hIndex = -1;
    commit();
    updateThumbs();
    draw();
    setSession(1);
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      loadImageSource(img, file.name);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('That file could not be opened as an image.');
    };
    img.src = url;
  }

  function makeSample() {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 800;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 560);
    sky.addColorStop(0, '#1e3a8a');
    sky.addColorStop(0.55, '#f472b6');
    sky.addColorStop(1, '#fdba74');
    g.fillStyle = sky;
    g.fillRect(0, 0, 1200, 800);
    const sun = g.createRadialGradient(820, 420, 10, 820, 420, 160);
    sun.addColorStop(0, '#fff7ed');
    sun.addColorStop(0.4, '#fde68a');
    sun.addColorStop(1, 'rgba(253,230,138,0)');
    g.fillStyle = sun;
    g.beginPath(); g.arc(820, 420, 160, 0, Math.PI * 2); g.fill();
    const layers = [
      { color: '#7c3aed', base: 520, amp: 120, seed: 1 },
      { color: '#4c1d95', base: 600, amp: 90, seed: 2 },
      { color: '#1e1b4b', base: 680, amp: 60, seed: 3 },
    ];
    layers.forEach(({ color, base: by, amp, seed }) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, 800);
      for (let x = 0; x <= 1200; x += 20) {
        const y = by - Math.abs(Math.sin(x * 0.004 * seed + seed) * amp) - Math.sin(x * 0.02 + seed) * 12;
        g.lineTo(x, y);
      }
      g.lineTo(1200, 800);
      g.closePath();
      g.fill();
    });
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 60; i++) {
      const x = (i * 197) % 1200, y = (i * 83) % 260;
      g.fillRect(x, y, 2, 2);
    }
    loadImageSource(c, 'sample');
  }

  function rotate(dir) {
    const src = cloneCanvas(base);
    base.width = src.height;
    base.height = src.width;
    bctx.save();
    bctx.translate(base.width / 2, base.height / 2);
    bctx.rotate((dir * Math.PI) / 2);
    bctx.drawImage(src, -src.width / 2, -src.height / 2);
    bctx.restore();
    afterTransform();
  }

  function flip(horizontal) {
    const src = cloneCanvas(base);
    bctx.clearRect(0, 0, base.width, base.height);
    bctx.save();
    if (horizontal) { bctx.translate(base.width, 0); bctx.scale(-1, 1); }
    else { bctx.translate(0, base.height); bctx.scale(1, -1); }
    bctx.drawImage(src, 0, 0);
    bctx.restore();
    afterTransform();
  }

  function afterTransform() {
    cropRect = null;
    commit();
    updateThumbs();
    draw();
  }

  function applyCrop() {
    if (!cropRect || cropRect.w < 4 || cropRect.h < 4) return;
    const { x, y, w, h } = cropRect;
    const src = cloneCanvas(base);
    base.width = Math.round(w);
    base.height = Math.round(h);
    bctx.drawImage(src, Math.round(x), Math.round(y), base.width, base.height, 0, 0, base.width, base.height);
    mode = 'move';
    afterTransform();
    updateUI();
  }

  function applyContentAwareFill(maskCanvas = null) {
    if (!hasImage || !cropRect || cropRect.w < 3 || cropRect.h < 3) {
      fillStatus.textContent = 'Seleksi area yang ingin dihilangkan terlebih dahulu.'; return;
    }
    const W = base.width, H = base.height;
    const x = Math.max(0, Math.floor(cropRect.x)), y = Math.max(0, Math.floor(cropRect.y));
    const w = Math.min(W-x, Math.ceil(cropRect.w)), h = Math.min(H-y, Math.ceil(cropRect.h));
    if (w >= W * .85 || h >= H * .85) {
      fillStatus.textContent = 'Area terlalu besar. Pilih objek yang lebih kecil.'; return;
    }
    // Cari patch dari sekitar area yang paling cocok dengan warna tepinya.
    const src = bctx.getImageData(0, 0, W, H);
    const data = src.data;
    const maskPixels = maskCanvas ? maskCanvas.getContext('2d').getImageData(0,0,W,H).data : null;
    const at = (px, py) => (py*W+px)*4;
    const samples = [];
    const step = Math.max(1, Math.floor(Math.min(w,h)/10));
    for (let i=0; i<w; i+=step) {
      if(y>0) samples.push([i,0,x+i,y-1]);
      if(y+h<H) samples.push([i,h-1,x+i,y+h]);
    }
    for (let j=0; j<h; j+=step) {
      if(x>0) samples.push([0,j,x-1,y+j]);
      if(x+w<W) samples.push([w-1,j,x+w,y+j]);
    }
    if (!samples.length) { fillStatus.textContent='Tidak tersedia area referensi.'; return; }
    const candidates=[];
    const gap=Math.max(3,Math.round(Math.min(w,h)*.08));
    const positions=[
      [x-w-gap,y],[x+w+gap,y],[x,y-h-gap],[x,y+h+gap],
      [x-w-gap,y-h-gap],[x+w+gap,y-h-gap],
      [x-w-gap,y+h+gap],[x+w+gap,y+h+gap]
    ];
    for(const [sx,sy] of positions) {
      if(sx<0||sy<0||sx+w>W||sy+h>H) continue;
      let score=0;
      for(const [dx,dy,tx,ty] of samples) {
        const a=at(sx+dx,sy+dy), b=at(tx,ty);
        for(let k=0;k<3;k++) score+=(data[a+k]-data[b+k])**2;
      }
      candidates.push({sx,sy,score});
    }
    if (!candidates.length) { fillStatus.textContent='Tidak ada tekstur di sekitar seleksi. Kecilkan area.'; return; }
    candidates.sort((a,b)=>a.score-b.score);
    const best=candidates[0];
    const patch=bctx.getImageData(best.sx,best.sy,w,h);
    const feather=Math.max(2,Math.min(24,Math.round(Math.min(w,h)*.12)));
    for(let j=0;j<h;j++) for(let i=0;i<w;i++) {
      const dst=at(x+i,y+j), from=(j*w+i)*4;
      const edge=Math.min(i+1,j+1,w-i,h-j);
      const alpha=maskPixels ? maskPixels[dst+3]/255 : Math.min(1,edge/feather);
      for(let k=0;k<4;k++) data[dst+k]=Math.round(data[dst+k]*(1-alpha)+patch.data[from+k]*alpha);
    }
    bctx.putImageData(src,0,0);
    cropRect=null; if (!maskCanvas) mode='move';
    commit(); updateThumbs(); updateUI(); draw();
    fillStatus.textContent='Area telah diisi dari tekstur sekitar. Gunakan Undo jika hasil kurang cocok.';
  }

  function exportImage() {
    if (!hasImage) return;
    const format = exportFormat.value;
    const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[format];
    const quality = Number(exportQuality.value) / 100;
    const out = document.createElement('canvas');
    out.width = base.width;
    out.height = base.height;
    const o = out.getContext('2d');
    // JPEG tidak mendukung transparansi: gunakan latar putih jika transparan.
    if (format === 'jpeg' && bgType === 'transparent') {
      o.fillStyle = '#ffffff';
      o.fillRect(0, 0, out.width, out.height);
    } else {
      paintBackground(o, out.width, out.height);
    }
    o.filter = filterString(filters, blurScaleFor(base.width));
    o.drawImage(base, 0, 0);
    o.filter = 'none';
    if (format === 'svg') {
      // Foto dan filter tetap raster; SVG membungkus gambar PNG agar hasil persis sama.
      const pngData = out.toDataURL('image/png');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${out.width}" height="${out.height}" viewBox="0 0 ${out.width} ${out.height}"><image width="${out.width}" height="${out.height}" href="${pngData}"/></svg>`;
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}-edited.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      exported = true;
      setSession(3);
      return;
    }
    out.toBlob(blob => {
      if (!blob) { alert('Export gagal. Silakan coba lagi.'); return; }
      if (blob.type !== mime) {
        alert('Format ' + format.toUpperCase() + ' tidak didukung browser ini. Pilih format lain.');
        return;
      }
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `${fileName}-edited.${format === 'jpeg' ? 'jpg' : format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      exported = true;
      setSession(3);
    }, mime, format === 'png' ? undefined : quality);
  }

  document.querySelectorAll('[data-bg]').forEach(btn => btn.addEventListener('click', () => setBackground(btn.dataset.bg)));
  document.getElementById('applyCustomBg').addEventListener('click', () => {
    bgCustom = document.getElementById('customBgColor').value;
    setBackground('custom');
  });
  document.getElementById('bgImageInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { bgImage = img; setBackground('image'); URL.revokeObjectURL(url); };
    img.onerror = () => { bgStatus.textContent = 'Gagal membaca gambar background.'; URL.revokeObjectURL(url); };
    img.src = url;
    e.target.value = '';
  });
  removeBgBtn.addEventListener('click', async () => {
    if (!hasImage || removingBg) return;
    removingBg = true;
    const generation = imageGeneration;
    bgStatus.textContent = 'Memuat model AI dan memproses foto…';
    updateUI();
    try {
      const { removeBackground } = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm');
      const source = await new Promise((resolve, reject) => base.toBlob(b => b ? resolve(b) : reject(new Error('Gagal membaca foto')), 'image/png'));
      const result = await removeBackground(source, { progress: (key, current, total) => {
        if (generation === imageGeneration && total) bgStatus.textContent = `AI: ${Math.round(current / total * 100)}% (${key})`;
      }});
      if (generation !== imageGeneration) return;
      const bitmap = await createImageBitmap(result);
      if (generation !== imageGeneration) { bitmap.close(); return; }
      base.width = bitmap.width; base.height = bitmap.height;
      bctx.clearRect(0, 0, base.width, base.height);
      bctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      backgroundRemoved = true;
      setSession(2);
      bgStatus.textContent = 'Background berhasil dihapus. Pilih warna atau gambar pengganti.';
      commit(); updateThumbs(); draw();
    } catch (err) {
      console.error('Background removal failed:', err);
      bgStatus.textContent = 'Gagal menghapus background. Periksa koneksi internet dan coba lagi.';
    } finally { removingBg = false; updateUI(); setSession(session); }
  });

  const eraseMask = document.createElement('canvas');
  const eraseCtx = eraseMask.getContext('2d');
  let eraseBounds = null;
  function clearEraseSelection() {
    eraseBounds = null;
    eraseCtx.clearRect(0,0,eraseMask.width,eraseMask.height);
    document.getElementById('fillApply').disabled = true;
    if (hasImage) render();
  }
  function markErase(p, prev = null) {
    const r = Math.max(1, Number(brushSize.value)*displayScale()/2);
    eraseCtx.save(); eraseCtx.fillStyle='#fff'; eraseCtx.strokeStyle='#fff'; eraseCtx.lineWidth=2*r; eraseCtx.lineCap='round'; eraseCtx.lineJoin='round';
    if (prev) { eraseCtx.beginPath(); eraseCtx.moveTo(prev.x,prev.y); eraseCtx.lineTo(p.x,p.y); eraseCtx.stroke(); }
    else { eraseCtx.beginPath(); eraseCtx.arc(p.x,p.y,r,0,Math.PI*2); eraseCtx.fill(); }
    eraseCtx.restore();
    document.getElementById('fillApply').disabled = false;
    for(const pt of (prev ? [prev,p] : [p])) {
      const b={x:Math.max(0,pt.x-r),y:Math.max(0,pt.y-r),right:Math.min(base.width,pt.x+r),bottom:Math.min(base.height,pt.y+r)};
      eraseBounds=eraseBounds ? {x:Math.min(eraseBounds.x,b.x),y:Math.min(eraseBounds.y,b.y),right:Math.max(eraseBounds.right,b.right),bottom:Math.max(eraseBounds.bottom,b.bottom)} : b;
    }
  }
  canvas.addEventListener('pointerdown', e => {
    if (!hasImage || mode === 'move') return;
    canvas.setPointerCapture(e.pointerId);
    const p = toImagePoint(e);
    if (mode === 'draw' || mode === 'fill') {
      drawing = true;
      lastPt = p;
      if (mode === 'fill') { if (!eraseBounds || eraseMask.width !== base.width || eraseMask.height !== base.height) { eraseMask.width=base.width; eraseMask.height=base.height; } markErase(p); render(); return; }
      bctx.save();
      bctx.globalCompositeOperation = 'source-over';
      bctx.fillStyle = brushColor.value;
      bctx.beginPath();
      bctx.arc(p.x, p.y, (brushSize.value * displayScale()) / 2, 0, Math.PI * 2);
      bctx.fill();
      bctx.restore();
      render();
    } else if (mode === 'crop') {
      cropStart = p;
      cropRect = { x: p.x, y: p.y, w: 0, h: 0 };
    }
  });

  canvas.addEventListener('pointermove', e => {
    if ((mode === 'draw' || mode === 'fill') && drawing) {
      const p = toImagePoint(e);
      if (mode === 'fill') { markErase(p,lastPt); lastPt=p; render(); return; }
      bctx.save();
      bctx.globalCompositeOperation = 'source-over';
      bctx.strokeStyle = brushColor.value;
      bctx.lineWidth = brushSize.value * displayScale();
      bctx.lineCap = 'round';
      bctx.lineJoin = 'round';
      bctx.beginPath();
      bctx.moveTo(lastPt.x, lastPt.y);
      bctx.lineTo(p.x, p.y);
      bctx.stroke();
      bctx.restore();
      lastPt = p;
      render();
    } else if (mode === 'crop' && cropStart) {
      const p = toImagePoint(e);
      cropRect = {
        x: Math.min(cropStart.x, p.x),
        y: Math.min(cropStart.y, p.y),
        w: Math.abs(p.x - cropStart.x),
        h: Math.abs(p.y - cropStart.y),
      };
      render();
    }
  });

  function endPointer() {
    if (drawing) {
      drawing = false;
      lastPt = null;
      if (mode === 'fill') { fillStatus.textContent = 'Coretan ditandai. Tambahkan coretan bila perlu, lalu klik Hapus Objek Terpilih.'; draw(); }
      else { commit(); updateThumbs(); }
    }
    cropStart = null;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  document.getElementById('openBtn').addEventListener('click', () => fileInput.click());
  document.getElementById('emptyOpenBtn').addEventListener('click', () => fileInput.click());
  document.getElementById('sampleBtn').addEventListener('click', makeSample);
  fileInput.addEventListener('change', () => {
    loadFile(fileInput.files[0]);
    fileInput.value = '';
  });

  undoBtn.addEventListener('click', () => hIndex > 0 && restore(hIndex - 1));
  redoBtn.addEventListener('click', () => hIndex < history.length - 1 && restore(hIndex + 1));
  downloadBtn.addEventListener('click', exportImage);
  cropBtn.addEventListener('click', () => setMode('crop'));
  drawBtn.addEventListener('click', () => setMode('draw'));
  fillBtn.addEventListener('click', () => setMode('fill'));
  document.getElementById('fillApply').addEventListener('click', () => {
    if (!eraseBounds || !hasImage) return;
    const b = eraseBounds; cropRect = {x:Math.floor(b.x), y:Math.floor(b.y), w:Math.ceil(b.right-b.x), h:Math.ceil(b.bottom-b.y)};
    applyContentAwareFill(eraseMask);
    if (!cropRect) clearEraseSelection();
  });
  document.getElementById('fillCancel').addEventListener('click', () => {clearEraseSelection(); draw(); fillStatus.textContent='Coretan dibersihkan tanpa mengubah foto.';});
  document.getElementById('cropApply').addEventListener('click', applyCrop);
  document.getElementById('cropCancel').addEventListener('click', () => setMode('crop'));
  resetBtn.addEventListener('click', () => {
    if (history.length) {
      const first = history[0];
      replaceBase(first.c);
      filters = { ...DEFAULTS };
      bgType = 'transparent'; bgImage = null; syncBackground();
      syncSliders();
      mode = 'move';
      cropRect = null;
      commit();
      updateThumbs();
      draw();
    }
  });

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      if (a === 'rotL') rotate(-1);
      if (a === 'rotR') rotate(1);
      if (a === 'flipH') flip(true);
      if (a === 'flipV') flip(false);
    });
  });

  const startCompare = () => { if (hasImage) { comparing = true; render(); } };
  const endCompare = () => { if (comparing) { comparing = false; render(); } };
  compareBtn.addEventListener('pointerdown', startCompare);
  compareBtn.addEventListener('pointerup', endCompare);
  compareBtn.addEventListener('pointerleave', endCompare);
  compareBtn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); startCompare(); } });
  compareBtn.addEventListener('keyup', endCompare);

  brushSize.addEventListener('input', () => (brushSizeOut.textContent = brushSize.value + 'px'));

  ['dragenter', 'dragover'].forEach(ev =>
    stage.addEventListener(ev, e => { e.preventDefault(); stage.classList.add('dragging'); })
  );
  ['dragleave', 'drop'].forEach(ev =>
    stage.addEventListener(ev, e => {
      e.preventDefault();
      if (ev === 'dragleave' && stage.contains(e.relatedTarget)) return;
      stage.classList.remove('dragging');
    })
  );
  stage.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));

  window.addEventListener('paste', e => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) loadFile(item.getAsFile());
  });

  window.addEventListener('keydown', e => {
    if (e.target.matches('input')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redoBtn.click(); else undoBtn.click();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redoBtn.click();
    } else if (e.key === 'Escape' && mode !== 'move') {
      setMode(mode);
    } else if (e.key === 'Enter' && mode === 'crop') {
      applyCrop();
    }
  });

  updateUI();
  setSession(0);
})();
