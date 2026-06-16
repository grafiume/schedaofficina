(function patchPreventivoPhoneInPdf(){
  'use strict';

  var phonePattern = /080\s*887\s*675(?!6)/g;
  var fixedPhone = '080 887 6756';

  function fixText(value){
    if (typeof value === 'string') return value.replace(phonePattern, fixedPhone);
    if (Array.isArray(value)) return value.map(fixText);
    return value;
  }

  function patchJsPdf(){
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF || !jsPDF.API || typeof jsPDF.API.text !== 'function') return false;
    if (jsPDF.API.text.__elipPhonePatched) return true;

    var originalText = jsPDF.API.text;
    var patchedText = function(){
      var args = Array.prototype.slice.call(arguments);
      args[0] = fixText(args[0]);
      return originalText.apply(this, args);
    };

    Object.defineProperty(patchedText, '__elipPhonePatched', { value: true });
    jsPDF.API.text = patchedText;
    return true;
  }

  if (!patchJsPdf()) {
    document.addEventListener('DOMContentLoaded', patchJsPdf, { once: true });
  }
})();
