'use strict';
(function(){
  const $=id=>document.getElementById(id);
  let currentFasta='';

  function render(session){
    currentFasta=String(session?.blastClusterFastaText||session?.blastFastaText||'').trim();
    if(!currentFasta){
      $('missingData').hidden=false;
      return;
    }
    let records;
    try{records=A2CA.parseFastaRaw(currentFasta);}
    catch(e){
      $('missingData').hidden=false;
      $('missingData').innerHTML=`<h2>BLAST sequences could not be restored</h2><p>${A2CA.escapeHtml(e.message)}</p><a class="button-link" href="upload_single.html">Back to BLAST</a>`;
      return;
    }
    const names=Object.keys(records);
    $('sequenceApp').hidden=false;
    const rid=session?.blastMeta?.rid?` NCBI RID: ${session.blastMeta.rid}.`:'';
    $('sequenceSummary').textContent=`${names.length} retrieved cluster-representative protein sequences.${rid}`;
    const rows=names.map(name=>`<tr><td class="alignment-name">${A2CA.escapeHtml(name)}</td><td>${A2CA.escapeHtml(records[name])}</td></tr>`).join('');
    $('sequenceView').innerHTML=`<table class="alignment-table"><thead><tr><th>Sequence</th><th>Protein sequence</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  ['sequenceBackBtn','sequenceInputNav','sequenceMissingBackBtn'].forEach(id=>{const el=$(id);if(el)el.href=A2CA.localPageUrl('upload_single.html');});

  $('downloadSequencesBtn').addEventListener('click',()=>{
    if(!currentFasta)return;
    A2CA.downloadText('A2CA_NCBI_BLAST_FASTA_cluster.txt','text/plain;charset=utf-8',currentFasta+'\n');
  });

  A2CA.session.request().then(render);
})();
