(function(){
  "use strict";

  function $(s, r){ return (r||document).querySelector(s); }
  function el(tag, cls){ const x=document.createElement(tag); if(cls) x.className=cls; return x; }

  function isClosed(r){
    const stato = (r && (r.stato||"")).toString().toLowerCase();
    if (stato.includes("complet")) return true;
    if (stato.includes("chius")) return true;
    if (r && r.dataFine) return true;
    if (typeof r.percentuale === "number" && r.percentuale >= 100) return true;
    return false;
  }

  function computeKPI(rows){
    const tot = rows.length;
    let attesa=0, lav=0, chiuse=0;
    rows.forEach(r=>{
      const s = ((r.stato||"")+"").toLowerCase();
      if (isClosed(r)) chiuse++;
      else if (s.includes("attesa")) attesa++;
      else if (s.includes("lavor")) lav++;
      else attesa++; // default
    });
    $("#kpiTot").textContent = String(tot);
    $("#kpiAttesa").textContent = String(attesa);
    $("#kpiLav").textContent = String(lav);
    $("#kpiChiuse").textContent = String(chiuse);
  }

  function renderList(rows){
    const root = $("#list");
    root.innerHTML = "";
    rows.forEach(r=>{
      const it = el("div","card-item");
      if (isClosed(r)){
        const b = el("div","badge-chiusa");
        b.textContent = "CHIUSA";
        it.appendChild(b);
      }
      const head = el("div","item-head");
      const title = el("div","item-title");
      title.textContent = (r.descrizione || r.modello || r.marca || "Senza descrizione");
      const sub = el("div","item-sub");
      const cliente = r.cliente ? String(r.cliente) : "";
      const tel = r.telefono ? String(r.telefono) : "";
      sub.textContent = [cliente, tel].filter(Boolean).join(" • ");
      head.appendChild(title);
      head.appendChild(sub);
      const body = el("div","item-body");
      const rowsInfo = [
        ["Modello", r.modello],
        ["Marca", r.marca],
        ["DDT", r.ddt],
        ["Batt. collettore", r.battcoll],
        ["Note", r.note || r.notes || r.notesk || r.descrizionegenerale || r.descrizione_generale]
      ];
      rowsInfo.forEach(([k,v])=>{
        if (v === undefined || v === null || v === "") return;
        const p = el("div","");
        p.textContent = k + ": " + String(v);
        body.appendChild(p);
      });
      it.appendChild(head);
      it.appendChild(body);
      root.appendChild(it);
    });
  }

  async function doSearch(){
    const q = $("#q").value || "";
    const exact = $("#chkExact").checked;
    const rows = await window.AppSupabase.fetchRecords({ q, exact });
    computeKPI(rows);
    renderList(rows);
  }

  async function doReset(){
    $("#q").value = "";
    $("#chkExact").checked = false;
    await doSearch();
  }

  function bind(){
    $("#btnSearch").addEventListener("click", ()=>{ doSearch().catch(console.error); });
    $("#btnReset").addEventListener("click", ()=>{ doReset().catch(console.error); });
    $("#q").addEventListener("keydown", (e)=>{
      if (e.key === "Enter") { doSearch().catch(console.error); }
    });
  }

  document.addEventListener("DOMContentLoaded", function(){
    bind();
    doSearch().catch(console.error);
  });
})();