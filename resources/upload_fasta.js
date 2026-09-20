'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const embedded=window.parent!==window;
  let validRecords=null;
  let pipelineComplete=false;
  let finalSession=null;
  let running=false;
  let upstreamSession=null;

  function preferredReferenceFromAlignment(alignment,source){
    const names=Object.keys(alignment||{});
    const preferred=source?.blastReferenceName||source?.analysisState?.selectedSequence||'';
    if(preferred&&Object.prototype.hasOwnProperty.call(alignment,preferred))return preferred;
    const target=String(source?.blastReferenceSequence||'').replace(/[-.\s]/g,'').toUpperCase();
    if(target){
      const exact=names.find(name=>String(alignment[name]||'').replace(/[-.]/g,'').toUpperCase()===target);
      if(exact)return exact;
    }
    return names[0]||'';
  }

  function continueTarget(data){return data?.inputWorkflow==='blast'&&data?.structureText?'analysis.html':'reference.html';}
  function configureContinueButton(data){
    if(!$('continueBtn'))return;
    $('continueBtn').textContent=continueTarget(data)==='analysis.html'?'Continue to analysis':'Continue to reference selection';
  }

  function requestSession(){
    if(!embedded)return Promise.resolve(A2CA.loadSession());
    return new Promise(resolve=>{
      let settled=false;
      const handler=event=>{
        if(!A2CA.isTrustedParentMessage(event,'A2CA_SESSION'))return;
        if(settled)return;
        settled=true;window.removeEventListener('message',handler);resolve(event.data.data||A2CA.loadSession());
      };
      window.addEventListener('message',handler);
      A2CA.postToParent('A2CA_REQUEST_SESSION');
      setTimeout(()=>{if(!settled){settled=true;window.removeEventListener('message',handler);resolve(A2CA.loadSession());}},500);
    });
  }

  function restoreCompletedSession(data){
    if(!data||!['fasta','blast'].includes(data.inputWorkflow)||!data.alignmentText||!data.treeText)return false;
    try{
      const alignment=A2CA.parseFasta(data.alignmentText);
      const tree=A2CA.parseNewick(data.treeText);
      A2CA.validateTreeAlignment(alignment,tree);
      finalSession=data;pipelineComplete=true;
      if(data.originalFastaText)$('fastaText').value=data.originalFastaText;
      if(data.originalFastaFileName)$('fastaFileStatus').textContent=`Previous input: ${data.originalFastaFileName}`;
      $('pipelineProgress').hidden=false;
      ['stepInput','stepMafft','stepFasttree','stepReady'].forEach(id=>stepState(id,'done'));
      setProgress(100,`Ready: ${Object.keys(alignment).length} aligned sequences and ${A2CA.leaves(tree).length} tree tips.`);
      $('pipelineStatus').className='status good';
      $('continueBtn').disabled=false;$('viewAlignmentBtn').disabled=false;$('viewTreeBtn').disabled=false;configureContinueButton(data);
      validRecords=data.originalFastaText?A2CA.parseFastaRaw(data.originalFastaText):null;
      return true;
    }catch(e){return false;}
  }

  function restoreBlastInput(data){
    if(!data||data.inputWorkflow!=='blast'||!data.blastFastaText||data.alignmentText||data.treeText)return false;
    try{
      configureContinueButton(data);
      const records=A2CA.parseFastaRaw(data.blastFastaText);
      upstreamSession=data;
      $('fastaText').value=data.blastFastaText;
      $('fastaFileStatus').className='status good';
      $('fastaFileStatus').textContent=`Imported from NCBI BLAST: ${Object.keys(records).length} sequences${data.blastMeta?.rid?` (RID ${data.blastMeta.rid})`:''}.`;
      const back=$('fastaBackBtn');
      if(back){back.removeAttribute('target');back.href=A2CA.localPageUrl('upload_single.html');back.textContent='Back to BLAST';}
      validateInput();
      $('sequenceValidation').className='status good';
      $('sequenceValidation').textContent=`BLAST homolog set ready: ${Object.keys(records).length} sequences. Click Run alignment to start MAFFT + FastTree.`;
      return true;
    }catch(e){return false;}
  }

  function publishSession(data){
    finalSession=data;
    A2CA.saveSession(data);
    if(embedded)A2CA.postToParent('A2CA_SAVE_SESSION',data);
  }

  function setProgress(pct,text){
    $('progressPercent').textContent=`${Math.round(pct)}%`;
    $('progressBar').style.width=`${Math.max(0,Math.min(100,pct))}%`;
    if(text)$('pipelineStatus').textContent=text;
  }
  function stepState(id,state){
    const el=$(id);el.classList.remove('active','done','failed');if(state)el.classList.add(state);
  }
  function resetProgress(){
    pipelineComplete=false;finalSession=null;$('continueBtn').disabled=true;$('viewAlignmentBtn').disabled=true;$('viewTreeBtn').disabled=true;
    ['stepInput','stepMafft','stepFasttree','stepReady'].forEach(id=>stepState(id,''));
    setProgress(0,'Waiting to start.');
  }


  function setInputsDisabled(disabled){
    $('fastaFile').disabled=disabled;
    $('fastaText').disabled=disabled;
  }

  function validateInput(){
    resetProgress();
    const text=$('fastaText').value.trim();
    if(!text){
      validRecords=null;$('sequenceValidation').className='status';
      $('sequenceValidation').textContent='Provide FASTA sequences by file upload or paste them into the text box.';
      $('runPipelineBtn').disabled=true;return;
    }
    try{
      const parsed=A2CA.parseFastaRaw(text);
      const names=Object.keys(parsed);
      if(names.length<3)throw new Error('MAFFT requires at least three sequences for this multiple-sequence alignment workflow.');
      if(names.length>500)throw new Error('The EMBL-EBI MAFFT service accepts at most 500 sequences per job.');
      const formatted=A2CA.formatFasta(parsed);
      if(new Blob([formatted]).size>1024*1024)throw new Error('The EMBL-EBI MAFFT service accepts at most 1 MB of sequence input per job.');
      validRecords=parsed;
      const lens=names.map(n=>parsed[n].length);
      $('sequenceValidation').className='status good';
      $('sequenceValidation').textContent=`Valid FASTA: ${names.length} sequences, ${Math.min(...lens)}–${Math.max(...lens)} residues.`;
      $('runPipelineBtn').disabled=running;
    }catch(e){
      validRecords=null;$('sequenceValidation').className='status bad';$('sequenceValidation').textContent='Error: '+e.message;$('runPipelineBtn').disabled=true;
    }
  }

  $('fastaFile').addEventListener('change',async()=>{
    try{
      const text=await A2CA.readFile($('fastaFile'));
      $('fastaText').value=text;
      $('fastaFileStatus').className='status good';$('fastaFileStatus').textContent=`Loaded: ${$('fastaFile').files[0]?.name||'FASTA file'}`;
      validateInput();
    }catch(e){$('fastaFileStatus').className='status bad';$('fastaFileStatus').textContent='Error: '+e.message;}
  });
  $('fastaText').addEventListener('input',validateInput);

  async function fetchText(url,options,timeoutMs=90000){
    const res=await A2CA.fetchWithTimeout(url,{cache:'no-store',...(options||{})},timeoutMs);
    const text=await res.text();
    if(!res.ok)throw new Error(text.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()||`HTTP ${res.status}`);
    return text.trim();
  }

  async function runMafft(fasta){
    const res=await A2CA.fetchWithTimeout('/api/mafft',{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=UTF-8','X-A2CA-Request':'web'},
      body:fasta,
      cache:'no-store'
    },330000);
    const text=await res.text();
    if(!res.ok)throw new Error(text.trim()||`MAFFT server returned HTTP ${res.status}`);
    if(!looksLikeAlignedFasta(text))throw new Error('The A2CA MAFFT server did not return a valid FASTA alignment.');
    return {alignmentText:text.trim()+'\n',resultType:'server-mafft-auto',resultTypes:['server-mafft-auto'],jobId:null};
  }

  async function runFastTree(alignmentText){
    if(typeof Aioli==='undefined')throw new Error('FastTree WebAssembly could not be loaded. Check the internet connection and reload the page.');
    const CLI=await new Aioli(['fasttree/2.1.11'],{printInterleaved:false});
    try{
      await CLI.mount([{name:'a2ca_alignment.fasta',data:alignmentText}]);
      const result=await CLI.exec('fasttree -quiet a2ca_alignment.fasta');
      const stdout=typeof result==='string'?result:(result?.stdout||'');
      const tree=String(stdout).trim();
      if(!tree.includes('(')||!tree.endsWith(';')){
        const stderr=typeof result==='object'?(result?.stderr||''):'';
        throw new Error(`FastTree did not return a valid Newick tree.${stderr?` ${String(stderr).trim().slice(0,400)}`:''}`);
      }
      return tree+'\n';
    }finally{
      try{if(CLI.close)await CLI.close();}catch(e){}
    }
  }

  $('runPipelineBtn').onclick=async()=>{
    validateInput();
    if(!validRecords||running)return;
    running=true;setInputsDisabled(true);$('runPipelineBtn').disabled=true;$('continueBtn').disabled=true;$('viewTreeBtn').disabled=true;$('pipelineProgress').hidden=false;
    const fasta=A2CA.formatFasta(validRecords);
    try{
      stepState('stepInput','done');stepState('stepMafft','active');setProgress(18,'Running MAFFT on the A2CA server…');
      const mafft=await runMafft(fasta);
      const alignment=A2CA.parseFasta(mafft.alignmentText);
      stepState('stepMafft','done');stepState('stepFasttree','active');setProgress(64,`MAFFT complete (${Object.keys(alignment).length} sequences). Initializing FastTree…`);
      const treeText=await runFastTree(mafft.alignmentText);
      const tree=A2CA.parseNewick(treeText);
      A2CA.validateTreeAlignment(alignment,tree);
      stepState('stepFasttree','done');stepState('stepReady','active');setProgress(92,'Validating generated analysis files…');
      const leafCount=A2CA.leaves(tree).length;
      if(leafCount<2)throw new Error('Generated tree contains fewer than two tips.');
      const isBlast=upstreamSession?.inputWorkflow==='blast';
      const preferredReference=isBlast?preferredReferenceFromAlignment(alignment,upstreamSession):'';
      const structureText=isBlast?(upstreamSession.structureText||''):'';
      const structureChains=isBlast?(upstreamSession.structureChains||null):null;
      const selectedStructureChain=isBlast?(upstreamSession.selectedStructureChain||''):'';
      let structureMatches=[];
      if(structureText&&structureChains&&selectedStructureChain&&structureChains[selectedStructureChain]){
        try{structureMatches=A2CA.matchPdbToAlignment({[selectedStructureChain]:structureChains[selectedStructureChain]},alignment);}catch(e){}
      }
      const session={
        alignmentText:mafft.alignmentText,
        treeText,
        alignmentFileName:'MAFFT alignment (generated)',
        treeFileName:'FastTree tree (generated)',
        originalFastaText:fasta,
        originalFastaFileName:isBlast?(upstreamSession.originalFastaFileName||'NCBI BLAST homologs'):($('fastaFile').files[0]?.name||'pasted sequences'),
        pipelineMeta:{mafftJobId:mafft.jobId,mafftResultType:mafft.resultType,mafftResultTypes:mafft.resultTypes,treeMethod:'FastTree 2.1.11',...(isBlast?{blastRid:upstreamSession.blastMeta?.rid||null}: {})},
        blastFastaText:isBlast?upstreamSession.blastFastaText:undefined,
        blastEmail:isBlast?upstreamSession.blastEmail:undefined,
        blastQuery:isBlast?upstreamSession.blastQuery:undefined,
        blastMeta:isBlast?upstreamSession.blastMeta:undefined,
        blastReferenceName:isBlast?upstreamSession.blastReferenceName:undefined,
        blastReferenceSequence:isBlast?upstreamSession.blastReferenceSequence:undefined,
        structureText,structureFileName:isBlast?(upstreamSession.structureFileName||''):'',structureFormat:isBlast?(upstreamSession.structureFormat||''):'',
        structureChains,structureMatches,selectedStructureChain,
        analysisState:isBlast?{...(upstreamSession.analysisState||{}),selectedSequence:preferredReference,selectedPositions:upstreamSession.analysisState?.selectedPositions||[]}:null,
        inputWorkflow:isBlast?'blast':'fasta'
      };
      publishSession(session);
      stepState('stepReady','done');setProgress(100,`Ready: ${Object.keys(alignment).length} aligned sequences and ${leafCount} tree tips.`);
      $('pipelineStatus').className='status good';$('continueBtn').disabled=false;$('viewAlignmentBtn').disabled=false;$('viewTreeBtn').disabled=false;configureContinueButton(session);pipelineComplete=true;
    }catch(e){
      const active=['stepMafft','stepFasttree','stepReady'].find(id=>$(id).classList.contains('active'));
      if(active)stepState(active,'failed');
      $('pipelineStatus').className='status bad';$('pipelineStatus').textContent='Error: '+e.message;
      pipelineComplete=false;$('continueBtn').disabled=true;$('viewAlignmentBtn').disabled=true;$('viewTreeBtn').disabled=true;
    }finally{
      running=false;setInputsDisabled(false);
      $('runPipelineBtn').disabled=!validRecords;
      if(pipelineComplete){$('continueBtn').disabled=false;$('viewAlignmentBtn').disabled=false;$('viewTreeBtn').disabled=false;}
    }
  };

  $('viewAlignmentBtn').onclick=()=>{
    if(!(pipelineComplete&&finalSession))return;
    publishSession(finalSession);
    location.href=A2CA.localPageUrl('alignment.html?return=upload_fasta.html');
  };
  $('viewTreeBtn').onclick=()=>{if(pipelineComplete&&finalSession){publishSession(finalSession);location.href=A2CA.localPageUrl('tree.html?return=upload_fasta.html');}};
  $('continueBtn').onclick=()=>{if(pipelineComplete&&finalSession){publishSession(finalSession);location.href=A2CA.localPageUrl(continueTarget(finalSession));}};
  // Configure the disabled Continue button immediately from the locally cached
  // upstream session so structure-started BLAST workflows show the correct target
  // before the asynchronous parent-session handshake completes.
  configureContinueButton(A2CA.loadSession());
  requestSession().then(data=>{
    upstreamSession=data&&data.inputWorkflow==='blast'?data:null;
    configureContinueButton(data);
    if(restoreCompletedSession(data)){
      if(data.inputWorkflow==='blast'){
        const back=$('fastaBackBtn');if(back){back.removeAttribute('target');back.href=A2CA.localPageUrl('upload_single.html');back.textContent='Back to BLAST';}
      }
      return;
    }
    if(restoreBlastInput(data))return;
    validateInput();
  });
})();
