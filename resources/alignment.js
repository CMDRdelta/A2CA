'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  const allowedReturns=new Set(['upload_precomputed.html','upload_fasta.html','reference.html','analysis.html']);
  const returnPage=allowedReturns.has(params.get('return'))?params.get('return'):'analysis.html';
  let currentSession=null;

  function configureBackLink(){
    const back=$('alignmentBackBtn');
    if(!back)return;
    back.href=returnPage;
    back.textContent=returnPage==='analysis.html'?'Back to analysis':'Back';
  }

  function render(session){
    currentSession=session||null;
    if(!session||!session.alignmentText){
      $('missingData').hidden=false;
      return;
    }
    let alignment;
    try{alignment=A2CA.parseFasta(session.alignmentText);}
    catch(e){
      $('missingData').hidden=false;
      $('missingData').innerHTML=`<h2>Alignment could not be restored</h2><p>${A2CA.escapeHtml(e.message)}</p><a class="button-link" href="upload.html">Go to upload</a>`;
      return;
    }

    const names=Object.keys(alignment);
    const length=names.length?alignment[names[0]].length:0;
    $('alignmentApp').hidden=false;
    $('alignmentSummary').textContent=`${session.alignmentFileName||'Loaded alignment'} – ${names.length} sequences, ${length} alignment positions.`;

    const rows=names.map(name=>`<tr><td class="alignment-name">${A2CA.escapeHtml(name)}</td><td>${A2CA.escapeHtml(alignment[name])}</td></tr>`).join('');
    $('alignmentView').innerHTML=`<table class="alignment-table"><thead><tr><th>Sequence</th><th>Alignment</th></tr></thead><tbody>${rows}</tbody></table>`;
  }


  $('downloadAlignmentBtn').addEventListener('click',()=>{
    if(!currentSession||!currentSession.alignmentText)return;
    const source=String(currentSession.alignmentFileName||'alignment').replace(/\.[^.]+$/,'');
    const safe=source.replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'')||'alignment';
    A2CA.downloadText(`A2CA_${safe}.fasta`,'text/plain;charset=utf-8',currentSession.alignmentText);
  });

  configureBackLink();
  A2CA.session.request().then(render);
})();
