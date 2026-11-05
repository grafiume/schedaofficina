# Formattazione approvata – Ingresso Officina

Data approvazione: 5 novembre 2026.

**L'interfaccia di `ingresso3.html` e `ingresso4.html` è approvata e non deve essere modificata.**

Riferimento originale: file `ingresso3.html` nel commit storico `5e5585dd7cdd8a4241831d3452e9d0c19a729f42` (23 ottobre 2026).

Il contenuto di HTML/CSS da confrontare è ogni byte dall'inizio del file fino al primo `<script src=`. Su entrambi i file deve rimanere IDENTICO al riferimento approvato: tabelle, campi, etichette, date, spaziature, font, dimensioni, grassetti, layout mobile.

Gli interventi futuri per OCR si possono effettuare **solo nella logica JavaScript dopo i tag script e/o nelle Supabase Edge Functions**. Prima di pubblicare qualsiasi modifica verificare via confronto testuale che il prefisso HTML/CSS dei due file non sia cambiato.

Servizi OCR: `officina-vision` (riconoscimento principale) e `officina-ocr3` (trascrizione secondaria del DDT).

Casi di verifica concordati: DDT STEI n. 123 del 26/06/2026 (elettropompa Pulsar 40/80 M Dab); modulo interno ELIP manoscritto (MACO SRL, 080777090, INDOTTO CC).

Non dichiarare superato un collaudo fotografico finché non è stato provato sulla foto originale.
