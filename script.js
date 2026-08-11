const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('nav');
toggle?.addEventListener('click', () => {
  const open = toggle.classList.toggle('active');
  toggle.setAttribute('aria-expanded', open);
});
nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  toggle?.classList.remove('active'); toggle?.setAttribute('aria-expanded', 'false');
}));
const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
}), { threshold: .15 });
document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
document.getElementById('year').textContent = new Date().getFullYear();
window.addEventListener('load', () => setTimeout(() => document.querySelector('.page-loader')?.classList.add('done'), 650));
document.getElementById('callbackForm')?.addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const subject = 'Callback request — Forego Exports';
  const body = `Name: ${form.get('name')}\nPhone / WhatsApp: ${form.get('phone')}\nRequirement: ${form.get('requirement') || 'Not specified'}`;
  window.location.href = `mailto:warehouse@foregoexports.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
