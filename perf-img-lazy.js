
/* Ensure all <img> without explicit loading get lazy-loaded */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('img:not([loading])').forEach(img => img.setAttribute('loading','lazy'));
});
