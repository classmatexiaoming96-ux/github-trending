// scroll progress bar + nav state
const progress = document.getElementById('progress');
const nav = document.querySelector('header.nav');
function onScroll() {
  const h = document.documentElement;
  const max = h.scrollHeight - h.clientHeight;
  progress.style.width = (max > 0 ? (h.scrollTop / max * 100) : 0) + '%';
  nav.classList.toggle('scrolled', h.scrollTop > 10);
  const totop = document.querySelector('.totop');
  if (totop) totop.classList.toggle('show', h.scrollTop > 600);
}
document.addEventListener('scroll', onScroll, { passive: true });

// mobile nav menu (legacy hamburger, still hooked up if present)
const toggle = document.querySelector('.nav-toggle');
const links  = document.querySelector('.nav-links');
if (toggle && links) {
  toggle.addEventListener('click', () => links.classList.toggle('open'));
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
}

// ============ TAB SWITCHER ============
const VALID = ['cg', 'ua', 'cp', 'oh', 'kc', 'oc', 'od', 'og', 'mc'];
const TITLES = {
  cg: 'CodeGraph 源码深度解析 · Agent Infrastructure Teardown',
  ua: 'Understand-Anything 源码深度解析 · Agent Infrastructure Teardown',
  cp: 'Claude Plugins Official 源码深度解析 · Agent Infrastructure Teardown',
  oh: 'OpenHuman Memory Tree 源码深度解析 · 一棵会自己长大的私人 AI 记忆',
  kc: 'Kimi Code 源码深度解析 · Moonshot AI 多 Agent 引擎',
  oc: 'OpenClaw 源码深度解析 · 全渠道个人 AI 助手',
  od: 'Odysseus 源码深度解析 · 自托管的个人 AI 工作台',
  og: 'Ongrid 源码深度解析 · Ops AI + 根因分析 + 远程执行',
  mc: 'Multica 源码深度解析 · 把编程 Agent 变成真实队友',
};

function setActiveTab(name, opts) {
  if (!VALID.includes(name)) name = 'oh';
  opts = opts || {};
  document.querySelectorAll('.tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
    b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('active', p.dataset.tab === name);
  });
  if (TITLES[name]) document.title = TITLES[name];
  if (opts.scroll !== false) window.scrollTo({ top: 0, behavior: opts.smooth ? 'smooth' : 'auto' });
  // re-run reveal observer for newly visible elements
  setupReveal();
  setupBench();
  // re-run scroll position once to recalc progress
  onScroll();
}

function tabFromHash() {
  const h = (location.hash || '').replace(/^#/, '').toLowerCase();
  return VALID.includes(h) ? h : null;
}

document.querySelectorAll('.tabs button').forEach(b => {
  b.addEventListener('click', () => {
    const name = b.dataset.tab;
    history.pushState(null, '', '#' + name);
    setActiveTab(name, { scroll: true, smooth: true });
  });
});
window.addEventListener('hashchange', () => {
  const t = tabFromHash();
  if (t) setActiveTab(t, { scroll: true });
});

// back-to-top button
document.querySelector('.totop')?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ============ REVEAL ON SCROLL ============
let revealObserver;
function setupReveal() {
  if (revealObserver) revealObserver.disconnect();
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  // only observe reveal elements inside the active panel
  const panel = document.querySelector('.tab-panel.active');
  if (panel) panel.querySelectorAll('.reveal:not(.in)').forEach(el => revealObserver.observe(el));
}

// ============ ANIMATE BENCHMARK BARS ============
let benchObserver;
function setupBench() {
  if (benchObserver) benchObserver.disconnect();
  benchObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.querySelectorAll('.fill').forEach(f => { f.style.width = f.dataset.w + '%'; });
        benchObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.3 });
  const panel = document.querySelector('.tab-panel.active');
  if (panel) panel.querySelectorAll('.bench').forEach(el => benchObserver.observe(el));
}

// init on load
const initialTab = tabFromHash() || 'oh';
setActiveTab(initialTab, { scroll: false });
onScroll();
