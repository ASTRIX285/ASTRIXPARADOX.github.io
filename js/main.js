// ============================================================
// ASTRIX PARADOX — Main JavaScript
// ============================================================

const TWITCH_CHANNEL = 'astrix285x';
const FB_PAGE        = 'https://www.facebook.com/xASTRIX285x';

// ── NAV ACTIVE STATE ────────────────────────────────────────
function setActiveNav() {

  const path = window.location.pathname;

  document.querySelectorAll('.nav-links a').forEach(link => {

    link.classList.remove('active');

    const href = link.getAttribute('href');

    if (
      path.endsWith(href) ||
      (path === '/' && href === 'index.html') ||
      (path.endsWith('/') && href === 'index.html')
    ) {

      link.classList.add('active');

    }

  });

}

// ── SCROLL REVEAL ───────────────────────────────────────────
function setupReveal() {

  const observer = new IntersectionObserver((entries) => {

    entries.forEach(entry => {

      if (entry.isIntersecting) {

        entry.target.classList.add('visible');

      }

    });

  }, {
    threshold: 0.15
  });

  document.querySelectorAll('.reveal')
    .forEach(el => observer.observe(el));

}

// ── STREAM EMBED CINEMATIC EXPANSION ────────────────────────
function setupStreamExpansion() {

  const liveWrap =
    document.getElementById('streamLive');

  const embed = liveWrap
    ? liveWrap.querySelector('.stream-live-embed')
    : document.querySelector('.stream-live-embed');

  const header = liveWrap
    ? liveWrap.querySelector('.stream-live-header')
    : document.querySelector('.stream-live-header');

  const nav =
    document.querySelector('.nav');

  const navLinks =
    document.querySelectorAll('.nav-links a');

  const accent =
    document.querySelector('.nav-logo .accent');

  if (!embed) return;

  let ticking = false;

  function resetNavStyles() {

    if (!nav) return;

    nav.style.opacity = '1';
    nav.style.background = '';
    nav.style.borderBottomColor = '';
    nav.style.backdropFilter = '';
    nav.style.pointerEvents = '';

    navLinks.forEach(link => {

      link.style.color = '';
      link.style.textShadow = '';

    });

    if (accent) {

      accent.style.color = '';

    }

  }

  function setUnlocked() {

    document.body.classList.remove(
      'stream-locked'
    );

    embed.classList.remove(
      'expanded'
    );

    resetNavStyles();

  }

  function setImmersiveNav() {

    if (!nav) return;

    nav.style.opacity = '1';

    nav.style.background =
      'transparent';

    nav.style.borderBottomColor =
      'transparent';

    nav.style.backdropFilter =
      'none';

    nav.style.pointerEvents =
      'auto';

    navLinks.forEach(link => {

      link.style.color =
        '#b22222';

      link.style.textShadow =
        '0 0 12px rgba(178,34,34,0.7)';

    });

    if (accent) {

      accent.style.color =
        '#ff1a1a';

    }

  }

  function update() {

    const rect =
      embed.getBoundingClientRect();

    const winH =
      window.innerHeight ||
      document.documentElement.clientHeight;

    const embedCenter =
      rect.top + rect.height / 2;

    const viewportCenter =
      winH / 2;

    const distance =
      Math.abs(embedCenter - viewportCenter);

    const maxDistance =
      (winH / 2) + (rect.height / 2);

    let progress =
      1 - (distance / (maxDistance * 0.72));

    progress =
      Math.max(0, Math.min(1, progress));

    const topBottom =
      30 - (30 * progress);

    const leftRight =
      35 - (35 * progress);

    embed.style.clipPath =
      `inset(${topBottom}% ${leftRight}% ${topBottom}% ${leftRight}%)`;

    // HEADER FADE

    if (header) {

      header.style.opacity =
        String(
          Math.max(
            0,
            1 - progress * 2.8
          )
        );

    }

    // NAV TRANSITION

    if (nav && progress < 0.985) {

      nav.style.opacity = '1';

      nav.style.background =
        `rgba(6,6,6,${Math.max(0, 0.95 - progress)})`;

      nav.style.borderBottomColor =
        `rgba(139,0,0,${Math.max(0, 0.3 - progress * 0.3)})`;

    }

    // FULL IMMERSION

    if (progress >= 0.985) {

      embed.classList.add(
        'expanded'
      );

      embed.style.clipPath =
        'inset(0% 0% 0% 0%)';

      document.body.classList.add(
        'stream-locked'
      );

      setImmersiveNav();

    } else {

      setUnlocked();

    }

    ticking = false;

  }

  function onScroll() {

    if (!ticking) {

      window.requestAnimationFrame(update);

      ticking = true;

    }

  }

  window.addEventListener(
    'scroll',
    onScroll,
    { passive: true }
  );

  window.addEventListener(
    'resize',
    update
  );

  update();

}

// ── RESET STREAM IMMERSIVE STATE ────────────────────────────
function resetStreamImmersiveState() {

  const embed =
    document.querySelector('.stream-live-embed');

  const nav =
    document.querySelector('.nav');

  const header =
    document.querySelector('.stream-live-header');

  document.body.classList.remove(
    'stream-locked'
  );

  if (embed) {

    embed.classList.remove(
      'expanded'
    );

    embed.style.clipPath =
      '';

  }

  if (header) {

    header.style.opacity =
      '';

  }

  if (nav) {

    nav.style.opacity =
      '';

    nav.style.background =
      '';

    nav.style.borderBottomColor =
      '';

    nav.style.backdropFilter =
      '';

    nav.style.pointerEvents =
      '';

  }

  document
    .querySelectorAll('.nav-links a')
    .forEach(link => {

      link.style.color =
        '';

      link.style.textShadow =
        '';

    });

  const accent =
    document.querySelector(
      '.nav-logo .accent'
    );

  if (accent) {

    accent.style.color =
      '';

  }

}

// ── SET OFFLINE VOD STATE ────────────────────────────────────
function setOfflineVod(data) {

  const vodEmbed =
    document.getElementById('vodEmbed');

  const vodTitle =
    document.getElementById('vodTitle');

  const vodFbLink =
    document.getElementById('vodFbLink');

  const vodTwLink =
    document.getElementById('vodTwLink');

  const vodSection =
    document.getElementById('vodSection');

  const vodFallback =
    document.getElementById('vodFallback');

  if (data.vod_id && vodEmbed) {

    vodEmbed.src =
      `https://player.twitch.tv/?video=${data.vod_id}&parent=astrixparadox.com&parent=www.astrixparadox.com&autoplay=false&muted=true`;

    const offlineFull =
      document.getElementById('streamOffline');

    if (offlineFull) {

      offlineFull.classList.add(
        'has-vod'
      );

    }

    if (vodTitle) {

      vodTitle.textContent =
        data.vod_title || 'Latest Stream';

    }

    if (vodTwLink) {

      vodTwLink.href =
        data.vod_url ||
        `https://twitch.tv/${TWITCH_CHANNEL}`;

    }

    if (vodFbLink) {

      const fbShareUrl =
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(data.vod_url || '')}`;

      vodFbLink.href =
        fbShareUrl;

    }

    if (vodSection) {

      vodSection.style.display =
        'block';

    }

    if (vodFallback) {

      vodFallback.style.display =
        'none';

    }

  } else {

    if (vodSection) {

      vodSection.style.display =
        'none';

    }

    if (vodFallback) {

      vodFallback.style.display =
        'block';

    }

  }

}

// ── TWITCH LIVE CHECK ───────────────────────────────────────
async function checkTwitchLive() {

  const navDot =
    document.querySelector('.nav-live-dot');

  const navText =
    document.querySelector('.nav-live-text');

  const offlineEl =
    document.getElementById('streamOffline');

  const liveEl =
    document.getElementById('streamLive');

  try {

    const res =
      await fetch(
        '/twitch-status.json?t=' + Date.now()
      );

    if (!res.ok) {

      throw new Error(
        'Status file not found'
      );

    }

    const data =
      await res.json();

    // LIVE STATE

    if (data.live) {

      if (navDot) {

        navDot.classList.add(
          'live'
        );

      }

      if (navText) {

        navText.textContent =
          '🔴 LIVE NOW';

      }

      if (liveEl) {

        liveEl.style.display =
          'block';

      }

      if (offlineEl) {

        offlineEl.style.display =
          'none';

      }

      document.title =
        `🔴 LIVE — ${data.game || 'Gaming'} | ASTRIX PARADOX`;

      setupStreamExpansion();

    }

    // OFFLINE STATE

    else {

      resetStreamImmersiveState();

      if (navDot) {

        navDot.classList.remove(
          'live'
        );

      }

      if (navText) {

        navText.textContent =
          'OFFLINE';

      }

      if (offlineEl) {

        offlineEl.style.display =
          'flex';

      }

      if (liveEl) {

        liveEl.style.display =
          'none';

      }

      setOfflineVod(data);

    }

  } catch (e) {

    resetStreamImmersiveState();

    if (navDot) {

      navDot.classList.remove(
        'live'
      );

    }

    if (navText) {

      navText.textContent =
        'OFFLINE';

    }

    if (offlineEl) {

      offlineEl.style.display =
        'flex';

    }

    if (liveEl) {

      liveEl.style.display =
        'none';

    }

    const vodFallback =
      document.getElementById('vodFallback');

    if (vodFallback) {

      vodFallback.style.display =
        'block';

    }

  }

}

// ── MOBILE NAV ──────────────────────────────────────────────
function setupMobileNav() {

  const toggle =
    document.querySelector('.nav-toggle');

  const links =
    document.querySelector('.nav-links');

  if (!toggle || !links) return;

  const menuId =
    links.id || 'site-navigation';

  links.id = menuId;
  toggle.type = 'button';
  toggle.setAttribute(
    'aria-controls',
    menuId
  );

  function setMenuOpen(open) {

    links.classList.toggle(
      'open',
      open
    );

    toggle.classList.toggle(
      'open',
      open
    );

    toggle.setAttribute(
      'aria-expanded',
      String(open)
    );

    toggle.setAttribute(
      'aria-label',
      open
        ? 'Close navigation menu'
        : 'Open navigation menu'
    );

  }

  setMenuOpen(false);

  toggle.addEventListener(
    'click',
    () => {

      setMenuOpen(
        toggle.getAttribute('aria-expanded') !== 'true'
      );

    }
  );

  links.querySelectorAll('a')
    .forEach(a => {

      a.addEventListener(
        'click',
        () => {

          setMenuOpen(false);

        }
      );

    });

  document.addEventListener(
    'click',
    (e) => {

      if (
        !toggle.contains(e.target) &&
        !links.contains(e.target)
      ) {

        setMenuOpen(false);

      }

    }
  );

  document.addEventListener(
    'keydown',
    (event) => {

      if (
        event.key === 'Escape' &&
        toggle.getAttribute('aria-expanded') === 'true'
      ) {

        setMenuOpen(false);
        toggle.focus();

      }

    }
  );

  window.addEventListener(
    'resize',
    () => {

      if (window.innerWidth > 768) {
        setMenuOpen(false);
      }

    },
    { passive: true }
  );

}

// ── HERO VIDEO SPEED + SEAMLESS LOOP FADE ────────────────────
function setupHeroVideo() {

  const video =
    document.getElementById('heroBg');

  if (!video) return;

  const FADE_MS = 400; // tweak this to adjust loop transition speed
  const BASE_OPACITY = '0.55'; // matches .hero-bg-video video CSS opacity

  function armLoopFade() {

    if (!video.duration) return;

    const fadeStart =
      video.duration - (FADE_MS / 1000);

    function onTime() {

      if (video.currentTime >= fadeStart) {

        video.style.opacity = '0';

        video.removeEventListener(
          'timeupdate',
          onTime
        );

      }

    }

    video.addEventListener(
      'timeupdate',
      onTime
    );

  }

  video.addEventListener(
    'loadedmetadata',
    () => {

      video.playbackRate = 0.5;
      armLoopFade();

    }
  );

  video.addEventListener(
    'ended',
    () => {

      video.currentTime = 0;
      video.play();

      requestAnimationFrame(() => {

        video.style.opacity =
          BASE_OPACITY;

        armLoopFade();

      });

    }
  );

  if (video.readyState >= 1) {

    video.playbackRate = 0.5;
    armLoopFade();

  }

}

// ── INIT ────────────────────────────────────────────────────
document.addEventListener(
  'DOMContentLoaded',
  () => {

    setActiveNav();
    setupReveal();
    setupMobileNav();
    setupHeroVideo();
    checkTwitchLive();

    // Re-check Twitch live status every 10 minutes
    // so the nav indicator and stream section update
    // for anyone who keeps the page open
    setInterval(checkTwitchLive, 10 * 60 * 1000);

  }
);
