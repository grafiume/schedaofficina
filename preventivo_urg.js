
// gestione bottone URG nella pagina preventivo

document.addEventListener("DOMContentLoaded", ()=>{

const urgBtn=document.querySelector(".urg-btn");
const urgentField=document.querySelector("#urgentFlag");

if(!urgBtn || !urgentField) return;

function refreshUrg(){
 if(urgentField.checked){
   urgBtn.classList.add("active");
 }else{
   urgBtn.classList.remove("active");
 }
}

refreshUrg();

urgBtn.addEventListener("click",()=>{
 urgentField.checked=!urgentField.checked;
 refreshUrg();
});

});
