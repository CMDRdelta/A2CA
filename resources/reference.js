'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const embedded=window.parent!==window;
  let session=null;
  let alignment=null;
  let structureChains=null;
  let selectedChain='';
  let sequenceNames=[];

  function requestSession(){
    if(!embedded)return Promise.resolve(A2CA.loadSession());
    return new Promise(resolve=>{
      let settled=false;
      const handler=event=>{
        if(!A2CA.isTrustedParentMessage(event,'A2CA_SESSION'))return;
        if(settled)return;
        settled=true;
        window.removeEventListener('message',handler);
        resolve(event.data.data||A2CA.loadSession());
      };
      window.addEventListener('message',handler);
      A2CA.postToParent('A2CA_REQUEST_SESSION');
      setTimeout(()=>{
        if(settled)return;
        settled=true;
        window.removeEventListener('message',handler);
        resolve(A2CA.loadSession());
      },500);
    });
  }

  function publish(){
    A2CA.saveSession(session);
    if(embedded)A2CA.postToParent('A2CA_SAVE_SESSION',session);
  }

  function selectedReference(){
    const value=$('SelectedSequence').value.trim();
    return sequenceNames.includes(value)?value:'';
  }

  function matchesForChain(chain){
    if(!chain||!structureChains||!structureChains[chain])return [];
    return A2CA.matchPdbToAlignment({[chain]:structureChains[chain]},alignment);
  }

  function setAnalysisReference(name,resetResidues=true){
    const previous=session.analysisState?.selectedSequence||'';
    session.analysisState={...(session.analysisState||{}),selectedSequence:name};
    if(resetResidues&&previous&&previous!==name)session.analysisState.selectedPositions=[];
  }

  function updateReferenceStatus(){
    const ref=selectedReference();
    if(!ref){
      $('referenceStatus').className='status bad';
      $('referenceStatus').textContent='Choose a sequence from the search suggestions.';
      return false;
    }
    const length=String(alignment[ref]||'').replace(/[-.]/g,'').length;
    $('referenceStatus').className='status good';
    $('referenceStatus').textContent=`Selected: ${ref} – ${length} residues (ungapped).`;
    return true;
  }

  function updateChainStatus({autoSelect=false}={}){
    if(!session.structureText||!selectedChain){
      $('continueBtn').disabled=!selectedReference();
      return;
    }
    const matches=matchesForChain(selectedChain);
    session.structureMatches=matches;
    session.selectedStructureChain=selectedChain;
    if(matches.length){
      const names=[...new Set(matches.map(m=>m.sequenceName))];
      if(autoSelect||!names.includes(selectedReference())){
        $('SelectedSequence').value=names[0];
        setAnalysisReference(names[0]);
        updateReferenceStatus();
      }
      const chosen=selectedReference();
      const chosenMatch=matches.find(m=>m.sequenceName===chosen);
      if(chosenMatch){
        const detail=chosenMatch.mode==='exact'
          ?'exact sequence match'
          :`${Math.round(chosenMatch.coverage*100)}% containment coverage`;
        $('chainStatus').className='status good';
        $('chainStatus').textContent=`Chain ${selectedChain} matches reference sequence ${chosen} (${detail}).`;
        $('continueBtn').disabled=false;
      }else{
        $('chainStatus').className='status bad';
        $('chainStatus').textContent=`Chain ${selectedChain} is present in the alignment, but not as the currently selected reference. Choose one of: ${names.join(', ')}.`;
        $('continueBtn').disabled=true;
      }
    }else{
      $('chainStatus').className='status bad';
      $('chainStatus').textContent=`Chain ${selectedChain} could not be matched to any sequence in the alignment. Choose another chain or remove the structure.`;
      $('continueBtn').disabled=true;
    }
    publish();
  }

  function populateChains(preferred=''){
    const names=Object.keys(structureChains||{});
    if(!names.length){$('chainControls').hidden=true;return;}
    $('chainControls').hidden=false;
    $('structureChain').innerHTML=names.map(chain=>{
      const len=structureChains[chain].length;
      return `<option value="${A2CA.escapeHtml(chain)}">Chain ${A2CA.escapeHtml(chain)} – ${len} residues</option>`;
    }).join('');
    selectedChain=names.includes(preferred)?preferred:names[0];
    $('structureChain').value=selectedChain;
    updateChainStatus({autoSelect:true});
  }

  function clearStructure({publishNow=true}={}){
    session.structureText='';
    session.structureFileName='';
    session.structurePdbId='';
    session.structureFormat='';
    session.structureChains=null;
    session.structureMatches=[];
    session.selectedStructureChain='';
    if(session.analysisState)session.analysisState={...session.analysisState,structurePickedResidues:[]};
    structureChains=null;selectedChain='';
    $('pdbFile').value='';
    $('pdbIdentifier').value='';
    $('chainControls').hidden=true;
    $('structureChain').innerHTML='';
    $('pdbStatus').className='status';
    $('pdbStatus').textContent='Optional. Upload a PDB/mmCIF file or enter a four-character PDB identifier to link a structural chain to the alignment reference.';
    $('continueBtn').disabled=!selectedReference();
    if(publishNow)publish();
  }

  function assignStructure(text,fileName,pdbId=''){
    const format=A2CA.detectStructureFormat(text,fileName);
    const chains=A2CA.parseStructureSequences(text,fileName);
    session.structureText=text;
    session.structureFileName=fileName||'structure.pdb';
    session.structurePdbId=pdbId||'';
    session.structureFormat=format;
    session.structureChains=chains;
    if(session.analysisState)session.analysisState={...session.analysisState,structurePickedResidues:[]};
    structureChains=chains;
    $('pdbStatus').className='status good';
    $('pdbStatus').textContent=`Loaded: ${session.structureFileName} – ${Object.keys(chains).length} protein chain${Object.keys(chains).length===1?'':'s'} found.`;
    populateChains(session.selectedStructureChain||'');
    publish();
  }

  async function loadStructure(){
    try{
      const text=await A2CA.readFile($('pdbFile'));
      assignStructure(text,$('pdbFile').files[0]?.name||'structure.pdb','');
    }catch(e){
      clearStructure({publishNow:false});
      $('pdbStatus').className='status bad';
      $('pdbStatus').textContent='Error: '+e.message;
      publish();
    }
  }

  async function fetchStructureById(){
    const id=String($('pdbIdentifier').value||'').trim().toUpperCase();
    if(!/^[A-Z0-9]{4}$/.test(id)){
      $('pdbStatus').className='status bad';
      $('pdbStatus').textContent='Enter a valid four-character PDB identifier, for example 4HHB.';
      return;
    }
    const btn=$('fetchPdbBtn');
    btn.disabled=true;
    $('pdbStatus').className='status';
    $('pdbStatus').textContent=`Fetching ${id} from RCSB PDB…`;
    try{
      const local=(location.protocol==='http:'||location.protocol==='https:')&&/^(127\.0\.0\.1|localhost)$/i.test(location.hostname);
      const url=local?`/api/rcsb/pdb?id=${encodeURIComponent(id)}`:`https://files.rcsb.org/download/${encodeURIComponent(id)}.pdb`;
      const response=await A2CA.fetchWithTimeout(url,{cache:'no-store'},60000);
      if(!response.ok)throw new Error(response.status===404?`PDB entry ${id} was not found as a legacy PDB file.`:`RCSB returned HTTP ${response.status}.`);
      const text=await response.text();
      if(!/^HEADER|^ATOM  |^SEQRES/m.test(text))throw new Error('The retrieved response is not a valid legacy PDB file.');
      $('pdbFile').value='';
      assignStructure(text,`${id}.pdb`,id);
    }catch(e){
      $('pdbStatus').className='status bad';
      $('pdbStatus').textContent='Error: '+e.message+(location.protocol==='file:'?' Start A2CA with the local launcher for reliable online retrieval.':'');
    }finally{btn.disabled=false;}
  }

  function start(data){
    if(!data||!data.alignmentText||!data.treeText){
      $('missingData').hidden=false;
      return;
    }
    session=data;
    try{alignment=A2CA.parseFasta(session.alignmentText);}catch(e){
      $('missingData').hidden=false;
      $('missingData').innerHTML=`<h2>Input data could not be restored</h2><p>${A2CA.escapeHtml(e.message)}</p><a class="button-link" href="upload.html" target="_top">Go to input</a>`;
      return;
    }

    $('referenceApp').hidden=false;
    $('referenceInputSummary').textContent=`Alignment: ${session.alignmentFileName||'loaded file'} | Tree: ${session.treeFileName||'loaded file'} | ${Object.keys(alignment).length} sequences`;
    const names=Object.keys(alignment);
    sequenceNames=names;
    const restored=session.analysisState?.selectedSequence;
    const ref=restored&&alignment[restored]?restored:names[0];
    $('SequenceOptions').innerHTML=names.map(n=>`<option value="${A2CA.escapeHtml(n)}"></option>`).join('');
    $('SelectedSequence').value=ref;
    setAnalysisReference(ref,false);
    updateReferenceStatus();

    const fromAnalysis=new URLSearchParams(location.search).get('from')==='analysis';
    const back=fromAnalysis?'analysis.html':(['fasta','blast'].includes(session.inputWorkflow)?'upload_fasta.html':'upload_precomputed.html');
    $('backBtn').href=back;
    if(fromAnalysis)$('backBtn').textContent='Back to analysis';

    if(session.structureText){
      try{
        structureChains=session.structureChains||A2CA.parseStructureSequences(session.structureText,session.structureFormat||session.structureFileName||'');
        session.structureChains=structureChains;
        $('pdbStatus').className='status good';
        $('pdbStatus').textContent=`Loaded: ${session.structureFileName||'structure.pdb'} – ${Object.keys(structureChains).length} protein chain${Object.keys(structureChains).length===1?'':'s'} found.`;
        if(session.structurePdbId)$('pdbIdentifier').value=session.structurePdbId;
        populateChains(session.selectedStructureChain||'');
      }catch(e){clearStructure({publishNow:false});}
    }else{
      $('continueBtn').disabled=false;
    }
    publish();

    $('SelectedSequence').addEventListener('change',()=>{
      const ref=selectedReference();
      if(!ref){
        updateReferenceStatus();
        $('continueBtn').disabled=true;
        return;
      }
      setAnalysisReference(ref);
      updateReferenceStatus();
      if(session.structureText)updateChainStatus(); else {$('continueBtn').disabled=false;publish();}
    });
    $('SelectedSequence').addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();$('SelectedSequence').blur();}
    });
    $('pdbFile').addEventListener('change',loadStructure);
    $('fetchPdbBtn').addEventListener('click',fetchStructureById);
    $('pdbIdentifier').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();fetchStructureById();}});
    $('structureChain').addEventListener('change',()=>{
      selectedChain=$('structureChain').value;
      updateChainStatus({autoSelect:true});
    });
    $('removeStructureBtn').addEventListener('click',()=>clearStructure());
    $('continueBtn').addEventListener('click',()=>{
      if($('continueBtn').disabled)return;
      setAnalysisReference(selectedReference(),false);
      publish();
      location.href=A2CA.localPageUrl('analysis.html');
    });
  }

  requestSession().then(start);
})();
