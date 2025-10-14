// Foto
let full = [], thumbs = [];

// File dalla galleria (senza capture)
const fl1 = $('#photoInput').files;
if (fl1 && fl1.length) {
  for (const file of fl1) {
    const data = await f2url(file);
    full.push(data); thumbs.push(data);
  }
}

// File dalla fotocamera (input con capture)
const fl2 = $('#photoCapture').files;
if (fl2 && fl2.length) {
  for (const file of fl2) {
    const data = await f2url(file);
    full.push(data); thumbs.push(data);
  }
}

// Se non hai selezionato/scattato nulla, usa l’anteprima attuale
if (!full.length) {
  const prev = $('#photoPreview').getAttribute('src');
  if (prev) { full = [prev]; thumbs = [prev]; }
}

// Includi eventuali scatti bufferizzati (_captured)
if (Array.isArray(_captured) && _captured.length) {
  full   = _captured.concat(full);
  thumbs = _captured.concat(thumbs);
}

// DEDUPE nella stessa save
full   = Array.from(new Set(full));
thumbs = Array.from(new Set(thumbs));
