// scroll progress bar + nav state
const progress = document.getElementById('progress');
const nav = document.querySelector('header.nav');
function onScroll() {
  const h = document.documentElement;
  const scrolled = h.scrollTop / (h.scrollHeight - h.clientHeight);
  progress.style.width = (scrolled * 100) + '%';
  nav.classList.toggle('scrolled', h.scrollTop > 10);
}
document.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// mobile nav
const toggle = document.querySelector('.nav-toggle');
const links = document.querySelector('.nav-links');
if (toggle) {
  toggle.addEventListener('click', () => links.classList.toggle('open'));
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
}

// reveal on scroll
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// animate benchmark bars when visible
const bio = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.querySelectorAll('.fill').forEach(f => { f.style.width = f.dataset.w + '%'; });
      bio.unobserve(e.target);
    }
  });
}, { threshold: 0.3 });
document.querySelectorAll('.bench').forEach(el => bio.observe(el));
