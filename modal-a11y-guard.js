// Evita warning "Blocked aria-hidden...": sfoca l'elemento focalizzato prima di nascondere la modale
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('detailModal');
  if(!el) return;
  el.addEventListener('hide.bs.modal', () => {
    if (el.contains(document.activeElement)) { try{ document.activeElement.blur(); }catch(_){ } }
  });
  console.log('[modal-a11y-guard] attivo');
});