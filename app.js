const APP_VERSION = '0.6.6';
const MAX_PHOTOS = 20;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const gallery = document.getElementById('gallery');
const settingsBtn = document.getElementById('settingsBtn');
const exposureInput = document.getElementById('exposure');
const contrastInput = document.getElementById('contrast');
const saturationInput = document.getElementById('saturation');
const warmthInput = document.getElementById('warmth');
const ringLightToggle = document.getElementById('ringLightToggle');
const ringLight = document.getElementById('ringLight');
const gridToggle = document.getElementById('gridToggle');
const gridOverlay = document.getElementById('gridOverlay');
const flashBtn = document.getElementById('flashBtn');
const settingsPage = document.getElementById('settingsPage');
const closeSettingsPageBtn = document.getElementById('closeSettingsPage');
const metaPage = document.getElementById('metaPage');
const closeMetaPageBtn = document.getElementById('closeMetaPage');
const openMetaLink = document.getElementById('openMetaLink');
const metaInput = document.getElementById('metaInput');
const dropZone = document.getElementById('dropZone');
const metaOutput = document.getElementById('metaOutput');
const labelTitle = document.getElementById('labelTitle');
const labelFstop = document.getElementById('labelFstop');
const labelShutter = document.getElementById('labelShutter');
const labelIso = document.getElementById('labelIso');
const labelLens = document.getElementById('labelLens');
const labelCamera = document.getElementById('labelCamera');
const labelNotes = document.getElementById('labelNotes');
const labelPreview = document.getElementById('labelPreview');
const resetLabelBtn = document.getElementById('resetLabel');
const exportLabelBtn = document.getElementById('exportLabel');
const accordionHeaders = document.querySelectorAll('.accordion-header');
const glassToggle = document.getElementById('glassToggle');
const versionEls = document.querySelectorAll('[data-version]');
const themeButtons = document.querySelectorAll('.theme-dot');
const splash = document.getElementById('splash');
const fisheyeToggle = document.getElementById('fisheyeToggle');
const splashLogo = document.getElementById('splashLogo');

let stream;
let dropdownOutsideHandler;
let flashOn = false;
let settings = {
    exposure: 0,
    contrast: 1,
    saturation: 1,
    temperature: 0
};
let currentMeta = {};
let fisheyeOn = false;
let previewRAF;
const offscreen = document.createElement('canvas');
const offCtx = offscreen.getContext('2d');

function buildFilter() {
    const warm = Math.max(0, Number(settings.temperature));
    const cool = Math.max(0, -Number(settings.temperature));
    const parts = [
        `brightness(${1 + Number(settings.exposure) * 0.5})`,
        `contrast(${settings.contrast})`,
        `saturate(${settings.saturation})`
    ];
    if (warm) {
        parts.push(`sepia(${0.3 * warm})`, `saturate(${1 + 0.5 * warm})`, `hue-rotate(${warm * 15}deg)`);
    }
    if (cool) {
        parts.push(`sepia(${0.15 * cool})`, `saturate(${1 - 0.2 * cool})`, `hue-rotate(${-cool * 15}deg)`);
    }
    return parts.join(' ');
}

function applySettings(ctx) {
    ctx.filter = buildFilter();
}

function applyVideoFilter() {
    video.style.filter = buildFilter();
}

function setRingLight(on) {
    if (!ringLight) return;
    ringLight.classList.toggle('on', Boolean(on));
}

function setGrid(on) {
    gridOverlay?.classList.toggle('on', Boolean(on));
}

function setGlassEnabled(on) {
    document.body.classList.toggle('no-glass', !on);
}

const THEMES = ['dark', 'light', 'benito', 'blue', 'red', 'creme'];

function applyTheme(theme) {
    const chosen = THEMES.includes(theme) ? theme : 'dark';
    THEMES.forEach(t => document.body.classList.toggle(`theme-${t}`, t === chosen));
    themeButtons.forEach(btn => {
        const isActive = btn.dataset.theme === chosen;
        btn.classList.toggle('active', isActive);
    });
    localStorage.setItem('theme', chosen);
    if (splashLogo) {
        splashLogo.src = chosen === 'light' || chosen === 'creme' ? 'icons/STYL Icon Glass.png' : 'icons/STYL Logo Glass Dark.png';
    }
}

function initTheme() {
    const stored = localStorage.getItem('theme');
    applyTheme(stored);
}

function updateLabelPreview() {
    const lines = [
        labelTitle?.value?.trim() || 'STYL Camera',
        [labelFstop?.value, labelShutter?.value, labelIso?.value].filter(Boolean).join(' · '),
        [labelLens?.value, labelCamera?.value].filter(Boolean).join(' · '),
        labelNotes?.value?.trim() || ''
    ].filter(Boolean);
    labelPreview.textContent = lines.join('\n');
}

function resetLabel() {
    [labelTitle, labelFstop, labelShutter, labelIso, labelLens, labelCamera, labelNotes].forEach(el => { if (el) el.value = ''; });
    updateLabelPreview();
}

function exportLabel() {
    const text = labelPreview.textContent || 'STYL Camera';
    const canvas = document.createElement('canvas');
    const padding = 20;
    const ctx = canvas.getContext('2d');
    ctx.font = '16px Menlo, monospace';
    const lines = text.split('\n');
    const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    canvas.width = Math.ceil(maxWidth + padding * 2);
    canvas.height = Math.ceil(lines.length * 22 + padding * 2);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '16px Menlo, monospace';
    lines.forEach((line, i) => {
        ctx.fillText(line, padding, padding + 18 + i * 22 - 6);
    });
    canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'label.png';
        a.click();
        URL.revokeObjectURL(a.href);
    }, 'image/png');
}

// Glassmorphism toast helper (kept global for reuse)
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = stream;
        applyVideoFilter();
        markFlashSupport();
    } catch (e) {
        showToast('No Camera Found!');
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;
    }
}

function savePhoto(dataUrl) {
    let photos = JSON.parse(localStorage.getItem('photos') || '[]');
    photos.push(dataUrl);
    if (photos.length > MAX_PHOTOS) {
        photos = photos.slice(-MAX_PHOTOS);
        showToast(`Kept latest ${MAX_PHOTOS} photos (storage capped).`);
    }
    try {
        localStorage.setItem('photos', JSON.stringify(photos));
    } catch (e) {
        showToast('Storage full - photo not saved.');
        return;
    }
    renderGallery();
}

function renderGallery() {
    let photos = JSON.parse(localStorage.getItem('photos') || '[]');
    gallery.innerHTML = '';
    if (photos.length > 0) {
        const lastSrc = photos[photos.length - 1];
        const img = document.createElement('img');
        img.src = lastSrc;
        img.alt = `Photo ${photos.length}`;
        gallery.appendChild(img);
    }
}

// Overlay logic
const galleryOverlay = document.getElementById('galleryOverlay');
const overlayGallery = document.getElementById('overlayGallery');
const closeOverlay = document.getElementById('closeOverlay');

gallery.addEventListener('click', () => {
    let photos = JSON.parse(localStorage.getItem('photos') || '[]');
    overlayGallery.innerHTML = '';
    photos.forEach((src, idx) => {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        // Image
        const img = document.createElement('img');
        img.src = src;
        img.alt = `Photo ${idx + 1}`;
        wrapper.appendChild(img);
        // Three-dot menu button
        const menuBtn = document.createElement('button');
        menuBtn.className = 'img-menu-btn glass';
        menuBtn.innerHTML = '&#x22EE;';
        menuBtn.type = 'button';
        menuBtn.setAttribute('aria-label', 'Photo options');
        wrapper.appendChild(menuBtn);
        // Dropdown menu
        const dropdown = document.createElement('div');
        dropdown.className = 'img-menu-dropdown';
        dropdown.style.display = 'none';
        // Download option
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = 'Download';
        downloadBtn.type = 'button';
        downloadBtn.setAttribute('aria-label', 'Download photo');
        downloadBtn.onclick = (e) => {
            e.stopPropagation();
            const a = document.createElement('a');
            a.href = src;
            a.download = `photo_${idx + 1}.png`;
            a.click();
            dropdown.style.display = 'none';
        };
        // Delete option
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.type = 'button';
        deleteBtn.setAttribute('aria-label', 'Delete photo');
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            let photos = JSON.parse(localStorage.getItem('photos') || '[]');
            photos.splice(idx, 1);
            localStorage.setItem('photos', JSON.stringify(photos));
            renderGallery();
            galleryOverlay.style.display = 'none';
            if (dropdownOutsideHandler) {
                document.removeEventListener('click', dropdownOutsideHandler, true);
                dropdownOutsideHandler = null;
            }
        };
        dropdown.appendChild(downloadBtn);
        dropdown.appendChild(deleteBtn);
        wrapper.appendChild(dropdown);
        // Menu button logic
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            // Hide all other dropdowns
            document.querySelectorAll('.img-menu-dropdown').forEach(el => el.style.display = 'none');
            dropdown.style.display = dropdown.style.display === 'flex' ? 'none' : 'flex';
            dropdown.style.flexDirection = 'column';
        };
        overlayGallery.appendChild(wrapper);
    });
    galleryOverlay.style.display = 'flex';
    if (dropdownOutsideHandler) {
        document.removeEventListener('click', dropdownOutsideHandler, true);
    }
    dropdownOutsideHandler = (event) => {
        if (!overlayGallery.contains(event.target)) {
            document.querySelectorAll('.img-menu-dropdown').forEach(el => el.style.display = 'none');
        }
    };
    document.addEventListener('click', dropdownOutsideHandler, true);
});

closeOverlay.addEventListener('click', () => {
    galleryOverlay.style.display = 'none';
    if (dropdownOutsideHandler) {
        document.removeEventListener('click', dropdownOutsideHandler, true);
        dropdownOutsideHandler = null;
    }
});

galleryOverlay.addEventListener('click', (e) => {
    if (e.target === galleryOverlay) {
        galleryOverlay.style.display = 'none';
        if (dropdownOutsideHandler) {
            document.removeEventListener('click', dropdownOutsideHandler, true);
            dropdownOutsideHandler = null;
        }
    }
});

captureBtn.addEventListener('click', () => {
    const srcWidth = video.videoWidth;
    const srcHeight = video.videoHeight;
    canvas.width = srcWidth;
    canvas.height = srcHeight;
    const ctx = canvas.getContext('2d');
    applySettings(ctx);
    if (fisheyeOn) {
        drawFisheye(ctx, srcWidth, srcHeight);
    } else {
        ctx.drawImage(video, 0, 0, srcWidth, srcHeight);
    }
    const dataUrl = canvas.toDataURL('image/png');
    savePhoto(dataUrl);
});

[exposureInput, contrastInput, saturationInput].forEach(input => {
    input.addEventListener('input', () => {
        settings.exposure = exposureInput.value;
        settings.contrast = contrastInput.value;
        settings.saturation = saturationInput.value;
        settings.temperature = warmthInput?.value ?? settings.temperature;
        applyVideoFilter();
    });
});

if (warmthInput) {
    warmthInput.addEventListener('input', () => {
        settings.temperature = warmthInput.value;
        applyVideoFilter();
    });
}

if (ringLightToggle) {
    ringLightToggle.addEventListener('change', (e) => {
        setRingLight(e.target.checked);
    });
}

if (gridToggle) {
    gridToggle.addEventListener('change', (e) => setGrid(e.target.checked));
}

if (glassToggle) {
    glassToggle.addEventListener('change', (e) => {
        setGlassEnabled(e.target.checked);
    });
}

themeButtons.forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

[labelTitle, labelFstop, labelShutter, labelIso, labelLens, labelCamera, labelNotes].forEach(el => {
    el?.addEventListener('input', updateLabelPreview);
});
resetLabelBtn?.addEventListener('click', resetLabel);
exportLabelBtn?.addEventListener('click', exportLabel);

function toggleAccordion(btn) {
    const targetId = btn.dataset.target;
    const body = document.getElementById(targetId);
    const chevron = btn.querySelector('.chevron');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.textContent = isOpen ? '▾' : '▴';
}

accordionHeaders.forEach(btn => {
    btn.addEventListener('click', () => toggleAccordion(btn));
});

function openSettingsPage() {
    if (settingsPage) {
        settingsPage.classList.add('active');
        settingsPage.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('settings-open');
}

function closeSettingsPage() {
    if (settingsPage) {
        settingsPage.classList.remove('active');
        settingsPage.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('settings-open');
}

settingsBtn.addEventListener('click', openSettingsPage);
if (closeSettingsPageBtn) {
    closeSettingsPageBtn.addEventListener('click', closeSettingsPage);
}

function openMetaPage() {
    if (metaPage) {
        metaPage.classList.add('active');
        metaPage.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('meta-open');
}

function closeMetaPage() {
    if (metaPage) {
        metaPage.classList.remove('active');
        metaPage.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('meta-open');
}

closeMetaPageBtn?.addEventListener('click', closeMetaPage);
openMetaLink?.addEventListener('click', openMetaPage);

function registerServiceWorker() {
    const isHttp = location.protocol === 'https:' || location.hostname === 'localhost';
    if ('serviceWorker' in navigator && isHttp) {
        navigator.serviceWorker.register('./service-worker.js').catch((err) => {
            console.warn('Service worker registration skipped:', err);
        });
    }
}

async function toggleFlash() {
    if (!stream || !flashBtn) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const caps = track.getCapabilities?.() || {};
    if (!caps.torch) {
        showToast('Flash not supported on this device.');
        flashBtn.classList.add('disabled');
        return;
    }
    flashOn = !flashOn;
    try {
        await track.applyConstraints({ advanced: [{ torch: flashOn }] });
        flashBtn.classList.toggle('active', flashOn);
    } catch (e) {
        flashOn = !flashOn;
        showToast('Unable to toggle flash.');
    }
}

function markFlashSupport() {
    if (!flashBtn) return;
    const track = stream?.getVideoTracks()?.[0];
    const caps = track?.getCapabilities?.();
    const supported = Boolean(caps && caps.torch);
    flashBtn.classList.toggle('disabled', !supported);
}

function drawFisheye(destCtx, w, h) {
    if (!offCtx || !video.videoWidth) return;
    const scaleDown = 0.6; // reduce workload for mobile
    const ow = Math.max(160, Math.floor(video.videoWidth * scaleDown));
    const oh = Math.max(120, Math.floor(video.videoHeight * scaleDown));
    offscreen.width = ow;
    offscreen.height = oh;
    offCtx.filter = buildFilter();
    offCtx.drawImage(video, 0, 0, ow, oh);
    const src = offCtx.getImageData(0, 0, ow, oh);
    const dst = destCtx.createImageData(w, h);
    const k = 0.45; // distortion strength
    const cx = w / 2, cy = h / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const dx = (x - cx);
            const dy = (y - cy);
            const r = Math.sqrt(dx * dx + dy * dy);
            const factor = 1 + k * (r / maxR) * (r / maxR);
            const sx = Math.floor(cx + dx / factor);
            const sy = Math.floor(cy + dy / factor);
            if (sx >= 0 && sx < ow && sy >= 0 && sy < oh) {
                const si = (sy * ow + sx) * 4;
                const di = (y * w + x) * 4;
                dst.data[di] = src.data[si];
                dst.data[di + 1] = src.data[si + 1];
                dst.data[di + 2] = src.data[si + 2];
                dst.data[di + 3] = src.data[si + 3];
            }
        }
    }
    destCtx.putImageData(dst, 0, 0);
}

function fisheyeLoop() {
    if (!fisheyeOn) return;
    if (!video.videoWidth || !video.videoHeight) {
        previewRAF = requestAnimationFrame(fisheyeLoop);
        return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.style.display = 'block';
    video.style.display = 'none';
    const ctx = canvas.getContext('2d');
    drawFisheye(ctx, canvas.width, canvas.height);
    previewRAF = requestAnimationFrame(fisheyeLoop);
}

function startFisheyePreview() {
    if (previewRAF) cancelAnimationFrame(previewRAF);
    previewRAF = requestAnimationFrame(fisheyeLoop);
}

function stopFisheyePreview() {
    if (previewRAF) cancelAnimationFrame(previewRAF);
    previewRAF = null;
    canvas.style.display = 'none';
    video.style.display = '';
}

function hideSplash() {
    if (splash) {
        splash.classList.add('hide');
        setTimeout(() => splash.remove(), 700);
    }
}

async function loadExif(file) {
    try {
        const { parse } = await import('https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js');
        const data = await parse(file, ['Model','Make','LensModel','FNumber','ExposureTime','ISOSpeedRatings','DateTimeOriginal','FocalLength']);
        return data || {};
    } catch (e) {
        showToast('Could not read metadata (offline?).');
        return {};
    }
}

function renderMeta(data) {
    currentMeta = data;
    if (!metaOutput) return;
    if (!Object.keys(data).length) {
        metaOutput.textContent = 'No metadata found.';
        return;
    }
    const lines = [];
    if (data.Make || data.Model) lines.push(`Camera: ${[data.Make, data.Model].filter(Boolean).join(' ')}`);
    if (data.LensModel) lines.push(`Lens: ${data.LensModel}`);
    if (data.FNumber) lines.push(`F-Stop: f/${data.FNumber}`);
    if (data.ExposureTime) lines.push(`Shutter: ${data.ExposureTime}s`);
    if (data.ISOSpeedRatings) lines.push(`ISO: ${data.ISOSpeedRatings}`);
    if (data.FocalLength) lines.push(`Focal: ${data.FocalLength}mm`);
    if (data.DateTimeOriginal) lines.push(`Taken: ${data.DateTimeOriginal}`);
    metaOutput.textContent = lines.join('\n') || 'No metadata found.';
    // prefill label fields
    if (data.FNumber) labelFstop.value = `f/${data.FNumber}`;
    if (data.ExposureTime) labelShutter.value = data.ExposureTime;
    if (data.ISOSpeedRatings) labelIso.value = data.ISOSpeedRatings;
    if (data.LensModel) labelLens.value = data.LensModel;
    if (data.Model) labelCamera.value = data.Model;
    updateLabelPreview();
}

async function handleMetaFile(file) {
    if (!file) return;
    if (metaOutput) {
        metaOutput.textContent = 'Loading metadata...';
        metaOutput.classList.add('loading');
    }
    const data = await loadExif(file);
    renderMeta(data);
    metaOutput?.classList.remove('loading');
}

window.addEventListener('DOMContentLoaded', () => {
    versionEls.forEach(el => el.textContent = `v${APP_VERSION}`);
    setRingLight(ringLightToggle?.checked);
    setGlassEnabled(glassToggle?.checked ?? true);
    setGrid(gridToggle?.checked ?? false);
    fisheyeOn = Boolean(fisheyeToggle?.checked);
    initTheme();
    // ensure splash logo matches theme on initial load
    if (splashLogo) {
        const stored = localStorage.getItem('theme');
        const theme = THEMES.includes(stored) ? stored : 'dark';
        splashLogo.src = theme === 'light' || theme === 'creme' ? 'icons/STYL Icon Glass.png' : 'icons/STYL Logo Glass Dark.png';
    }
    startCamera();
    renderGallery();
    registerServiceWorker();
    resetLabel();
    if (fisheyeOn) startFisheyePreview();
    // splash hides after first frame or timeout
    video.addEventListener('loadeddata', hideSplash, { once: true });
    setTimeout(hideSplash, 1200);
    // absolute fallback in case video errors
    setTimeout(hideSplash, 3000);
    // ensure core sections open by default, others collapsed
    accordionHeaders.forEach(btn => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const shouldOpen = !['panel-experiments','panel-about','panel-release'].includes(btn.dataset.target);
        target.style.display = shouldOpen ? 'block' : 'none';
        const chev = btn.querySelector('.chevron');
        if (chev) chev.textContent = shouldOpen ? '▴' : '▾';
    });
});

window.addEventListener('pagehide', stopCamera);
window.addEventListener('beforeunload', stopCamera);

if (flashBtn) {
    flashBtn.addEventListener('click', toggleFlash);
}

if (fisheyeToggle) {
    fisheyeToggle.addEventListener('change', (e) => {
        fisheyeOn = false; // disabled for now
        fisheyeToggle.checked = false;
        stopFisheyePreview();
        video.style.display = '';
        canvas.style.display = 'none';
        showToast('Fisheye disabled for now.');
    });
}

if (metaInput) {
    metaInput.addEventListener('change', (e) => handleMetaFile(e.target.files[0]));
}

if (dropZone) {
    dropZone.addEventListener('click', () => metaInput?.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag');
        const file = e.dataTransfer.files[0];
        handleMetaFile(file);
    });
}
