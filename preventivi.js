
// --- FIX POSIZIONE BADGE URGENTE ---
// Sposta il badge URGENTE accanto allo stato e NON vicino al cliente

function renderStatoBadge(q){
  const stato = `<span class="badge badge-${q.status}">${q.status}</span>`;
  const urgente = q.is_urgent ? '<span class="badge-urgent">URGENTE</span>' : '';
  return stato + " " + urgente;
}

/*
USO:

PRIMA (cliente):
<td class="cliente">
  ${q.is_urgent ? '<span class="badge-urgent">URGENTE</span>' : ''}
  ${q.cliente}
</td>

DOPO:
<td class="cliente">
  ${q.cliente}
</td>

E nella colonna stato:

<td class="stato">
  ${renderStatoBadge(q)}
</td>
*/
