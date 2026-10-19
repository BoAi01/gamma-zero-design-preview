const videos = [...document.querySelectorAll('video')];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionPaused = reducedMotion.matches;
const visibleVideos = new Set();
const videoLoads = new WeakMap();
const videoSources = new WeakMap();
const videoPositions = new WeakMap();
const suspendTimers = new WeakMap();
let startingVideo;
let startupTimer;
let hdrSupport;

const loadVideo = (video) => {
  if (videoLoads.has(video)) return videoLoads.get(video);
  const loading = Promise.resolve().then(async () => {
    for (const source of video.querySelectorAll('source[data-src]')) {
      let hdr = false;
      if (source.dataset.hdrSrc && video.dataset.hdrFailed !== 'true') {
        hdrSupport ??= (async () => {
          if (!window.matchMedia('(video-dynamic-range: high), (dynamic-range: high)').matches ||
              !navigator.mediaCapabilities || !video.canPlayType('video/mp4; codecs="hvc1.2.4.L93.B0"')) return false;
          let timer;
          try {
            const capability = navigator.mediaCapabilities.decodingInfo({
              type: 'file',
              video: { contentType: 'video/mp4; codecs="hvc1.2.4.L93.B0"', width: 1280, height: 720,
                bitrate: 3000000, framerate: 30, colorGamut: 'rec2020', transferFunction: 'hlg' },
            }).then(info => info.supported && info.smooth && info.powerEfficient);
            return await Promise.race([capability, new Promise(resolve => { timer = setTimeout(() => resolve(false), 1000); })]);
          } catch {
            return false;
          } finally {
            clearTimeout(timer);
          }
        })();
        hdr = await hdrSupport;
      }
      if (videoLoads.get(video) !== loading) return;
      const compact = source.dataset.compactSrc && window.matchMedia('(max-width: 1024px)').matches;
      const remoteSrc = hdr ? source.dataset.hdrSrc : compact ? source.dataset.compactSrc : source.dataset.src;
      const localSrc = hdr ? source.dataset.localHdrSrc : compact ? source.dataset.localCompactSrc : source.dataset.localSrc;
      if (!videoSources.has(source)) videoSources.set(source,
        localSrc && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? localSrc : remoteSrc);
      source.src = videoSources.get(source);
      if (source.dataset.hdrSrc) {
        source.type = hdr ? 'video/mp4; codecs="hvc1.2.4.L93.B0"' : 'video/mp4';
        video.dataset.dynamicRange = hdr ? 'hdr' : 'sdr';
      }
      if (hdr) {
        const recoverSdr = () => {
          if (video.dataset.hdrFailed === 'true') return;
          video.dataset.hdrFailed = 'true';
          videoLoads.delete(video);
          videoSources.delete(source);
          video.dataset.loaded = 'false';
          if (visibleVideos.has(video) && document.visibilityState === 'visible' && !motionPaused) {
            loadVideo(video).then(syncVideos);
          }
        };
        source.addEventListener('error', recoverSdr, { once: true });
        video.addEventListener('error', recoverSdr, { once: true });
      }
    }
    video.dataset.loaded = 'true';
    video.load();
  });
  videoLoads.set(video, loading);
  return loading;
};

const releaseStartup = (video) => {
  if (startingVideo !== video) return;
  clearTimeout(startupTimer);
  startingVideo = undefined;
  syncVideos();
};

const suspendVideo = (video) => {
  clearTimeout(suspendTimers.get(video));
  suspendTimers.delete(video);
  videoLoads.delete(video);
  if (video.networkState === 2) {
    if (Number.isFinite(video.currentTime) && (video.currentTime > 0 || !videoPositions.has(video))) videoPositions.set(video, video.currentTime);
    for (const source of video.querySelectorAll('source[data-src]')) source.removeAttribute('src');
    video.dataset.loaded = 'false';
    video.load();
  }
  releaseStartup(video);
};

const syncVideos = () => {
  videos.forEach((video) => {
    if (visibleVideos.has(video) && document.visibilityState === 'visible' && !motionPaused) {
      clearTimeout(suspendTimers.get(video));
      suspendTimers.delete(video);
      if (video.dataset.loaded === 'true') video.play().catch(() => releaseStartup(video));
    } else {
      video.pause();
      if (video.dataset.loaded !== 'true' || document.visibilityState !== 'visible' || motionPaused) suspendVideo(video);
      else if (video.networkState === 2 && !suspendTimers.has(video)) suspendTimers.set(video, setTimeout(() => suspendVideo(video), 600));
    }
  });
  if (startingVideo || document.visibilityState !== 'visible' || motionPaused) return;
  const next = videos.find(video => visibleVideos.has(video) && video.dataset.loaded !== 'true' && !videoLoads.has(video));
  if (!next) return;
  startingVideo = next;
  startupTimer = setTimeout(() => releaseStartup(next), 2500);
  loadVideo(next).then(() => {
    if (visibleVideos.has(next) && document.visibilityState === 'visible' && !motionPaused && next.dataset.loaded === 'true') {
      next.play().then(() => releaseStartup(next), () => releaseStartup(next));
    } else releaseStartup(next);
  });
};

const videoPosterObserver = new IntersectionObserver((entries, observer) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.poster = entry.target.dataset.poster;
    observer.unobserve(entry.target);
  }
}, { rootMargin: '200px 0px' });

const videoPlaybackObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting && entry.intersectionRatio >= 0.2) visibleVideos.add(entry.target);
    else visibleVideos.delete(entry.target);
  });
  syncVideos();
}, { threshold: 0.2 });

videos.forEach((video) => {
  video.autoplay = false;
  if (video.dataset.poster) videoPosterObserver.observe(video);
  video.addEventListener('loadedmetadata', () => {
    const position = videoPositions.get(video);
    if (Number.isFinite(position) && position > 0 && position < video.duration) video.currentTime = position;
    videoPositions.delete(video);
  });
  video.addEventListener('playing', () => releaseStartup(video));
  video.addEventListener('error', () => releaseStartup(video));
  videoPlaybackObserver.observe(video);
});

document.addEventListener('visibilitychange', syncVideos);
const motionToggle = document.querySelector('#motion-toggle');
motionToggle.innerHTML = motionPaused ? 'Play motion <span aria-hidden="true">▷</span>' : 'Pause motion <span aria-hidden="true">Ⅱ</span>';
motionToggle.addEventListener('click', () => {
  motionPaused = !motionPaused;
  motionToggle.innerHTML = motionPaused ? 'Play motion <span aria-hidden="true">▷</span>' : 'Pause motion <span aria-hidden="true">Ⅱ</span>';
  syncVideos();
});
reducedMotion.addEventListener('change', () => {
  motionPaused = reducedMotion.matches;
  motionToggle.innerHTML = motionPaused ? 'Play motion <span aria-hidden="true">▷</span>' : 'Pause motion <span aria-hidden="true">Ⅱ</span>';
  syncVideos();
});

const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('#site-nav');
menuToggle.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.innerHTML = open ? 'Close <span aria-hidden="true">−</span>' : 'Menu <span aria-hidden="true">＋</span>';
  siteNav.classList.toggle('is-open', open);
});
siteNav.addEventListener('click', event => {
  if (event.target.closest('a') && menuToggle.getAttribute('aria-expanded') === 'true') menuToggle.click();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
    menuToggle.click();
    menuToggle.focus();
  }
});
