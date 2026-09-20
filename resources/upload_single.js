'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const embedded=window.parent!==window;
  const BLAST_URL='https://blast.ncbi.nlm.nih.gov/Blast.cgi';
  const EFETCH_URL='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
  const LOCAL_PROXY=(location.protocol==='http:'||location.protocol==='https:') && /^(127\.0\.0\.1|localhost)$/i.test(location.hostname);
  const BLAST_ENDPOINT=LOCAL_PROXY?'/api/ncbi/blast':BLAST_URL;
  const EFETCH_ENDPOINT=LOCAL_PROXY?'/api/ncbi/efetch':EFETCH_URL;
  const TOOL='A2CA';
  let queryInfo=null;
  let running=false;
  let blastSession=null;
  let lastFasta='';
  let lastClusterFasta='';
  let initGeneration=0;
  let structureInput=null;
  let suppressStructureQueryChange=false;
  let pollStopRequested=false;
  let stopButtonTimer=null;

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

  function publishSession(data){
    blastSession=data;A2CA.saveSession(data);
    if(embedded)A2CA.postToParent('A2CA_SAVE_SESSION',data);
  }

  function emailValid(){const v=$('ncbiEmail').value.trim();return !v||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
  function hasEmail(){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('ncbiEmail').value.trim());}
  function transportReady(){return LOCAL_PROXY;}
  function updateTransportStatus(){
    const el=$('ncbiTransportStatus');
    if(!el)return;
    if(LOCAL_PROXY){el.hidden=true;if($('fetchQueryBtn'))$('fetchQueryBtn').disabled=false;return;}
    el.hidden=false;el.className='status bad';
    el.textContent='This workflow requires online mode. Start A2CA with the Windows or macOS online launcher.';
    if($('fetchQueryBtn'))$('fetchQueryBtn').disabled=true;
  }
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

  function setProgress(pct,text){
    $('progressPercent').textContent=`${Math.round(pct)}%`;
    $('progressBar').style.width=`${Math.max(0,Math.min(100,pct))}%`;
    if(text)$('blastStatus').textContent=text;
  }
  function stepState(id,state){const el=$(id);el.classList.remove('active','done','failed');if(state)el.classList.add(state);}
  function resetProgress(){
    blastSession=null;lastFasta='';lastClusterFasta='';$('continueBlastBtn').disabled=true;$('viewBlastSequencesBtn').disabled=true;
    pollStopRequested=false;clearTimeout(stopButtonTimer);stopButtonTimer=null;$('stopBlastBtn').hidden=true;$('stopBlastBtn').disabled=false;$('stopBlastBtn').textContent='Stop BLAST run';
    ['stepQuery','stepSubmit','stepSearch','stepRetrieve','stepBlastReady'].forEach(id=>stepState(id,''));
    setProgress(0,'Waiting to start.');$('blastStatus').className='status';
    const diag=$('blastDiagnostics');if(diag)diag.hidden=true;const diagText=$('blastDiagnosticsText');if(diagText)diagText.textContent='';
  }

  function normalizeRawProtein(text){return String(text||'').replace(/\s+/g,'').toUpperCase();}

  function classifyQuery(text){
    const raw=String(text||'').trim();
    if(!raw)throw new Error('Provide one protein FASTA record or raw protein sequence.');
    if(raw.startsWith('>')){
      const records=A2CA.parseFastaRaw(raw);
      const names=Object.keys(records);
      if(names.length!==1)throw new Error('This workflow accepts exactly one query sequence.');
      const sequence=records[names[0]];
      if(A2CA.likelyNucleicAcid(sequence))throw new Error('The query appears to be DNA or RNA. This workflow uses BLASTP and requires a protein sequence.');
      return {type:'fasta',query:raw,name:names[0],sequence,label:`FASTA sequence ${names[0]} (${sequence.length} aa)`};
    }
    const compact=normalizeRawProtein(raw);
    if(/^[ABCDEFGHIKLMNPQRSTVWXYZOUJ*?]+$/.test(compact)&&compact.length>=8){
      if(A2CA.likelyNucleicAcid(compact))throw new Error('The query appears to be DNA or RNA. This workflow uses BLASTP and requires a protein sequence.');
      return {type:'sequence',query:compact,name:'A2CA_query',sequence:compact,label:`Raw protein sequence (${compact.length} aa)`};
    }
    throw new Error('The query is not recognized as a single FASTA record or raw protein sequence. Use “Fetch a query sequence” for NCBI accessions or PDB entries.');
  }

  function safeStructureQueryName(fileName,chain){
    const base=String(fileName||'structure').replace(/\.[^.]+$/,'').replace(/[^A-Za-z0-9_.-]+/g,'_')||'structure';
    const c=String(chain||'_').replace(/[^A-Za-z0-9_.-]+/g,'_')||'_';
    return `${base}_chain_${c}`;
  }

  function clearStructureInput({clearFile=false,message=''}={}){
    structureInput=null;
    $('queryStructureControls').hidden=true;
    $('queryStructureChain').innerHTML='';
    $('queryStructureStatus').textContent='';
    if(clearFile)$('queryFile').value='';
    if(message){$('queryFileStatus').className='status';$('queryFileStatus').textContent=message;}
  }

  function setStructureChainQuery(chain,{persist=true}={}){
    if(!structureInput||!structureInput.chains[chain])return;
    structureInput.selectedChain=chain;
    const sequence=structureInput.chains[chain];
    const name=safeStructureQueryName(structureInput.fileName,chain);
    suppressStructureQueryChange=true;
    $('queryText').value=A2CA.formatFasta({[name]:sequence});
    suppressStructureQueryChange=false;
    $('queryStructureStatus').className='status good small';
    $('queryStructureStatus').textContent=`Chain ${chain}: ${sequence.length} residues. This chain will be used as the BLAST query and preferred analysis reference.`;
    validateQuery();
    if(persist)persistDraft();
  }

  function loadStructureInput(text,fileName,pdbId=''){
    const format=A2CA.detectStructureFormat(text,fileName);
    const chains=A2CA.parseStructureSequences(text,fileName);
    const names=Object.keys(chains);
    if(!names.length)throw new Error('No protein chains were found in the structure file.');
    structureInput={text,fileName,format,chains,selectedChain:names[0],pdbId:String(pdbId||'').trim().toUpperCase()};
    $('queryStructureChain').innerHTML=names.map(chain=>`<option value="${A2CA.escapeHtml(chain)}">Chain ${A2CA.escapeHtml(chain)} – ${chains[chain].length} residues</option>`).join('');
    $('queryStructureChain').value=names[0];
    $('queryStructureControls').hidden=false;
    $('queryFileStatus').className='status good';
    $('queryFileStatus').textContent=`Loaded structure: ${fileName} – ${names.length} protein chain${names.length===1?'':'s'} found.`;
    setStructureChainQuery(names[0],{persist:false});
    persistDraft();
  }

  function restoreStructureInput(data){
    if(!data||!data.structureText)return;
    try{
      const format=data.structureFormat||A2CA.detectStructureFormat(data.structureText,data.structureFileName||'');
      const chains=data.structureChains||A2CA.parseStructureSequences(data.structureText,data.structureFileName||format);
      const names=Object.keys(chains);if(!names.length)return;
      const selected=names.includes(data.selectedStructureChain)?data.selectedStructureChain:names[0];
      structureInput={text:data.structureText,fileName:data.structureFileName||`structure.${format==='cif'?'cif':'pdb'}`,format,chains,selectedChain:selected,pdbId:String(data.structurePdbId||'').trim().toUpperCase()};
      $('queryStructureChain').innerHTML=names.map(chain=>`<option value="${A2CA.escapeHtml(chain)}">Chain ${A2CA.escapeHtml(chain)} – ${chains[chain].length} residues</option>`).join('');
      $('queryStructureChain').value=selected;
      $('queryStructureControls').hidden=false;
      $('queryFileStatus').className='status good';
      $('queryFileStatus').textContent=`Restored structure: ${structureInput.fileName}.`;
      $('queryStructureStatus').className='status good small';
      $('queryStructureStatus').textContent=`Chain ${selected}: ${chains[selected].length} residues. This chain will be used as the preferred analysis reference.`;
    }catch(e){clearStructureInput();}
  }

  function currentBlastParameters(){
    return {
      database:$('blastDatabase').value,
      expect:$('blastExpect').value,
      hitlistSize:Number($('blastHits').value)||50,
      matrix:$('blastMatrix').value,
      wordSize:$('blastWordSize').value,
      gapCosts:$('blastGapCosts').value,
      filter:$('blastFilter').checked?'L':'F',
      compositionBasedStatistics:$('blastComposition').value,
      shortQueryAdjust:$('blastShortQuery').checked
    };
  }

  function persistDraft(){
    const existing=A2CA.loadSession()||{};
    const structure=structureInput?{
      structureText:structureInput.text,
      structureFileName:structureInput.fileName,
      structureFormat:structureInput.format,
      structurePdbId:structureInput.pdbId||'',
      structureChains:structureInput.chains,
      selectedStructureChain:structureInput.selectedChain,
      structureMatches:[]
    }:{structureText:'',structureFileName:'',structureFormat:'',structureChains:null,selectedStructureChain:'',structureMatches:[]};
    const selectedName=queryInfo?.name||existing.analysisState?.selectedSequence||'';
    const draft={
      ...existing,...structure,
      inputWorkflow:'blast',
      blastQuery:$('queryText').value,
      blastFetchIdentifier:$('queryFetchIdentifier').value.trim(),
      blastEmail:$('ncbiEmail').value.trim(),
      blastReferenceName:selectedName,
      blastReferenceSequence:queryInfo?.sequence||'',
      blastMeta:{...(existing.blastMeta||{}),parameters:currentBlastParameters()},
      analysisState:{...(existing.analysisState||{}),...(selectedName?{selectedSequence:selectedName}:{})},
      blastFastaText:'',originalFastaText:'',originalFastaFileName:'',alignmentText:'',treeText:''
    };
    A2CA.saveSession(draft);
    if(embedded)A2CA.postToParent('A2CA_SAVE_SESSION',draft);
  }

  function validateQuery(){
    resetProgress();
    try{
      queryInfo=classifyQuery($('queryText').value);
      const email=$('ncbiEmail').value.trim();
      if(!email){
        $('queryValidation').className='status';
        $('queryValidation').textContent=`Valid query: ${queryInfo.label}. Enter a contact email to enable BLAST.`;
      }else if(!hasEmail()){
        $('queryValidation').className='status bad';
        $('queryValidation').textContent=`Valid query: ${queryInfo.label}. The contact email is not valid.`;
      }else{
        $('queryValidation').className='status good';
        $('queryValidation').textContent=`Valid query: ${queryInfo.label}. Contact email accepted.`;
      }
      $('runBlastBtn').disabled=running||!transportReady()||!hasEmail();
    }catch(e){
      queryInfo=null;$('queryValidation').className='status';
      if($('queryText').value.trim()){$('queryValidation').className='status bad';$('queryValidation').textContent='Error: '+e.message;}
      else $('queryValidation').textContent='Provide one protein FASTA record or raw protein sequence.';
      $('runBlastBtn').disabled=true;
    }
  }

  function isPdbIdentifier(value){
    return /^[A-Za-z0-9]{4}$/.test(String(value||'').trim());
  }

  async function fetchQueryIdentifier(){
    const raw=String($('queryFetchIdentifier').value||'').trim();
    if(!raw){
      $('queryFetchStatus').className='status bad';
      $('queryFetchStatus').textContent='Enter an NCBI protein accession or a four-character PDB identifier.';
      return;
    }
    if(!transportReady()){
      $('queryFetchStatus').className='status bad';
      $('queryFetchStatus').textContent='Fetching query data requires online mode.';
      return;
    }
    const btn=$('fetchQueryBtn');
    btn.disabled=true;
    try{
      if(isPdbIdentifier(raw)){
        const id=raw.toUpperCase();
        $('queryFetchStatus').className='status';
        $('queryFetchStatus').textContent=`Fetching PDB entry ${id} from RCSB…`;
        const response=await A2CA.fetchWithTimeout(`/api/rcsb/pdb?id=${encodeURIComponent(id)}`,{cache:'no-store'},60000);
        const text=await response.text();
        if(!response.ok)throw new Error(text||`RCSB returned HTTP ${response.status}.`);
        if(!/^HEADER|^ATOM  |^SEQRES/m.test(text))throw new Error('The retrieved response is not a valid legacy PDB file.');
        $('queryFile').value='';
        loadStructureInput(text,`${id}.pdb`,id);
        $('queryFetchStatus').className='status good';
        $('queryFetchStatus').textContent=`Fetched PDB entry ${id}. Select the protein chain below.`;
      }else{
        if(!/^[A-Za-z0-9_.:-]{3,120}$/.test(raw))throw new Error('The identifier is not recognized as an NCBI protein accession or PDB entry.');
        $('queryFetchStatus').className='status';
        $('queryFetchStatus').textContent=`Fetching protein accession ${raw} from NCBI…`;
        const body=new URLSearchParams();
        body.set('db','protein');body.set('id',raw);body.set('rettype','fasta');body.set('retmode','text');body.set('tool',TOOL);
        const email=$('ncbiEmail').value.trim();if(email)body.set('email',email);
        const text=await fetchText(EFETCH_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
        const records=A2CA.parseFastaRaw(text);
        const names=Object.keys(records);
        if(names.length!==1)throw new Error(`NCBI Protein did not resolve ${raw} to exactly one protein sequence.`);
        const sequence=records[names[0]];
        if(A2CA.likelyNucleicAcid(sequence))throw new Error('The fetched record appears to be DNA/RNA rather than protein.');
        clearStructureInput({clearFile:true});
        suppressStructureQueryChange=true;
        $('queryText').value=fastaFromRecord(raw,sequence);
        suppressStructureQueryChange=false;
        $('queryFileStatus').className='status';
        $('queryFileStatus').textContent='No file selected.';
        validateQuery();persistDraft();
        $('queryFetchStatus').className='status good';
        $('queryFetchStatus').textContent=`Fetched ${raw}: ${sequence.length} amino acids.`;
      }
    }catch(e){
      $('queryFetchStatus').className='status bad';
      $('queryFetchStatus').textContent='Error: '+e.message;
    }finally{btn.disabled=!transportReady();}
  }

  $('queryFile').addEventListener('change',async()=>{
    try{
      const file=$('queryFile').files[0];
      $('queryFetchIdentifier').value='';
      $('queryFetchStatus').className='status';
      $('queryFetchStatus').textContent='Enter an NCBI protein accession or PDB identifier.';
      const text=await A2CA.readFile($('queryFile'));
      const name=file?.name||'query file';
      const structureByName=/\.(?:pdb|ent|cif|mmcif)$/i.test(name);
      const structureByContent=/^(?:HEADER|ATOM  |HETATM|SEQRES)/m.test(text)||/^\s*data_/i.test(text)||/^_atom_site\./m.test(text);
      if(structureByName||structureByContent){
        loadStructureInput(text,name);
      }else{
        clearStructureInput();
        const records=A2CA.parseFastaRaw(text);
        if(Object.keys(records).length!==1)throw new Error('The FASTA file must contain exactly one sequence.');
        $('queryText').value=text;
        $('queryFileStatus').className='status good';
        $('queryFileStatus').textContent=`Loaded: ${name}`;
        validateQuery();persistDraft();
      }
    }catch(e){clearStructureInput();$('queryFileStatus').className='status bad';$('queryFileStatus').textContent='Error: '+e.message;}
  });
  $('queryStructureChain').addEventListener('change',()=>setStructureChainQuery($('queryStructureChain').value));
  $('fetchQueryBtn').addEventListener('click',fetchQueryIdentifier);
  $('queryFetchIdentifier').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();fetchQueryIdentifier();}});
  $('queryText').addEventListener('input',()=>{
    if(structureInput&&!suppressStructureQueryChange)clearStructureInput({clearFile:true,message:'Structure association cleared because the query sequence was edited manually.'});
    if(!suppressStructureQueryChange&&$('queryFetchIdentifier').value.trim()){
      $('queryFetchStatus').className='status';
      $('queryFetchStatus').textContent='The displayed sequence was edited manually. Use Fetch to restore the identifier sequence.';
    }
    validateQuery();persistDraft();
  });
  $('ncbiEmail').addEventListener('input',()=>{validateQuery();persistDraft();});
  ['blastDatabase','blastExpect','blastHits','blastMatrix','blastWordSize','blastGapCosts','blastComposition','blastFilter','blastShortQuery'].forEach(id=>{
    $(id).addEventListener('change',()=>{persistDraft();});
  });
  $('blastDatabase').addEventListener('change',updateDatabaseNote);


  function updateDatabaseNote(){
    const note=$('blastDatabaseNote');
    if(!note)return;
    if($('blastDatabase').value==='nr'){
      note.textContent='Full nr selected. This database is much larger and API jobs may remain queued for a long time. For a fast, diverse homolog set, ClusteredNR is recommended.';
      note.className='status warn';
    }else{
      note.textContent='ClusteredNR is the current NCBI Protein BLAST web default and is strongly recommended for interactive homolog retrieval. The full nr database can take substantially longer, especially through the programmatic queue.';
      note.className='muted';
    }
  }

  async function fetchText(url,options,timeoutMs=90000){
    try{
      const res=await A2CA.fetchWithTimeout(url,{cache:'no-store',...(options||{})},timeoutMs);
      const text=await res.text();
      if(!res.ok)throw new Error(text.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()||`HTTP ${res.status}`);
      return text.trim();
    }catch(e){
      if(e instanceof TypeError||/Failed to fetch|NetworkError|Load failed/i.test(String(e&&e.message))){
        throw new Error(LOCAL_PROXY?'The local A2CA server could not contact NCBI. Check the internet connection, VPN/firewall/proxy settings, and retry.':'This workflow requires the online A2CA launcher.');
      }
      throw e;
    }
  }

  function parseSubmission(text){
    // NCBI places RID/RTOE in the QBlastInfo block. Restrict parsing to that
    // block first so unrelated numbers elsewhere in the HTML cannot be picked up.
    const infoBlock=(text.match(/QBlastInfoBegin([\s\S]*?)QBlastInfoEnd/i)||[])[1]||text;
    const rid=(infoBlock.match(/\bRID\s*=\s*([^\s<]+)/i)||[])[1];
    const rtoeRaw=Number((infoBlock.match(/\bRTOE\s*=\s*(\d+)/i)||[])[1]||0);
    if(!rid){
      const clean=text.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
      throw new Error(`NCBI BLAST did not return a request ID.${clean?` Response: ${clean.slice(0,500)}`:''}`);
    }
    return {rid:rid.trim(),rtoe:Number.isFinite(rtoeRaw)?rtoeRaw:0};
  }

  function pollingStoppedError(){
    const e=new Error('BLAST polling stopped by the user. The NCBI job may continue running remotely.');
    e.code='A2CA_BLAST_POLL_STOPPED';return e;
  }
  function ensurePollingActive(){if(pollStopRequested)throw pollingStoppedError();}
  function scheduleStopButton(){
    clearTimeout(stopButtonTimer);
    $('stopBlastBtn').hidden=true;$('stopBlastBtn').disabled=false;$('stopBlastBtn').textContent='Stop BLAST run';
    stopButtonTimer=setTimeout(()=>{if(running&&!pollStopRequested)$('stopBlastBtn').hidden=false;},10*60*1000);
  }

  async function waitCountdown(seconds,prefix,pctStart,pctEnd){
    const total=Math.max(1,Math.ceil(seconds));
    for(let left=total;left>0;left--){
      ensurePollingActive();
      const done=(total-left)/total;
      setProgress(pctStart+(pctEnd-pctStart)*done,`${prefix} Next NCBI status check in ${left} s.`);
      await sleep(1000);
    }
    ensurePollingActive();
  }

  function fastaFromRecord(name, sequence){
    const safeName=String(name||'A2CA_query').replace(/\s+/g,'_');
    const seq=String(sequence||'').replace(/\s+/g,'').toUpperCase();
    const lines=[];
    for(let i=0;i<seq.length;i+=80)lines.push(seq.slice(i,i+80));
    return `>${safeName}\n${lines.join('\n')}\n`;
  }

  async function resolveAccession(info){
    if(info.type!=='accession')return info;
    setProgress(18,`Resolving ${info.query} to its protein sequence through NCBI Protein…`);
    const body=new URLSearchParams();
    body.set('db','protein');
    body.set('id',info.query);
    body.set('rettype','fasta');
    body.set('retmode','text');
    body.set('tool',TOOL);
    const email=$('ncbiEmail').value.trim();
    if(email)body.set('email',email);
    const text=await fetchText(EFETCH_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
    const records=A2CA.parseFastaRaw(text);
    const names=Object.keys(records);
    if(names.length!==1)throw new Error(`NCBI Protein did not resolve ${info.query} to exactly one protein sequence.`);
    const name=names[0];
    const sequence=records[name];
    if(!sequence||sequence.length<1)throw new Error(`NCBI Protein returned an empty sequence for ${info.query}.`);
    return {...info,name,sequence,resolvedAccession:info.query,query:fastaFromRecord(name,sequence),label:`NCBI accession ${info.query} (${sequence.length} aa)`};
  }

  async function submitBlast(info){
    const body=new URLSearchParams();
    const email=$('ncbiEmail').value.trim();
    body.set('CMD','Put'); body.set('PROGRAM','blastp');
    body.set('DATABASE',$('blastDatabase').value); body.set('QUERY',info.query);
    body.set('EXPECT',$('blastExpect').value); body.set('HITLIST_SIZE',$('blastHits').value);
    body.set('GAPCOSTS',$('blastGapCosts').value);
    if($('blastMatrix').value!=='BLOSUM62') body.set('MATRIX',$('blastMatrix').value);
    if($('blastWordSize').value!=='3') body.set('WORD_SIZE',$('blastWordSize').value);
    if($('blastFilter').checked) body.set('FILTER','L');
    if($('blastComposition').value!=='2') body.set('COMPOSITION_BASED_STATISTICS',$('blastComposition').value);
    if($('blastShortQuery').checked) body.set('SHORT_QUERY_ADJUST','true');
    body.set('tool',TOOL); body.set('email',email);
    const text=await fetchText(BLAST_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
    const submission=parseSubmission(text);
    submission.parameters={program:'blastp',database:$('blastDatabase').value,expect:$('blastExpect').value,hitlistSize:$('blastHits').value,matrix:$('blastMatrix').value,wordSize:$('blastWordSize').value,gapCosts:$('blastGapCosts').value,filter:$('blastFilter').checked?'L':'F',compositionBasedStatistics:$('blastComposition').value,shortQueryAdjust:$('blastShortQuery').checked,queryLength:info.sequence?info.sequence.length:null};
    return submission;
  }

  function updateDiagnostics(lines){
    const el=$('blastDiagnosticsText');
    if(!el)return;
    el.textContent=Array.isArray(lines)?lines.join('\n'):String(lines||'');
    const box=$('blastDiagnostics');
    if(box)box.hidden=false;
  }

  function parseQBlastInfo(text){
    const blockMatch=String(text||'').match(/QBlastInfoBegin([\s\S]*?)QBlastInfoEnd/i);
    if(!blockMatch)return null;
    const block=blockMatch[1];
    const status=((block.match(/Status\s*=\s*(\w+)/i)||[])[1]||'').toUpperCase();
    const hits=((block.match(/ThereAreHits\s*=\s*(\w+)/i)||[])[1]||'').toLowerCase();
    return status?{status,hits,block}:null;
  }

  async function pollBlast(rid,rtoe,parameters){
    const firstWait=60;
    const estimate=(Number.isFinite(rtoe)&&rtoe>0)?` (NCBI estimate: ${Math.round(rtoe)} s)`:'';
    const baseDiag=[`RID: ${rid}`,`RTOE: ${Number.isFinite(rtoe)?rtoe:'n/a'} s`,`Program: blastp`,`Database: ${parameters&&parameters.database||'n/a'}`,`Query length: ${parameters&&parameters.queryLength||'n/a'} aa`,`Word size: ${parameters&&parameters.wordSize||'n/a'}`,`E-value: ${parameters&&parameters.expect||'n/a'}`,`Hit list size: ${parameters&&parameters.hitlistSize||'n/a'}`];
    updateDiagnostics([...baseDiag,'Status: submitted','Polls: 0']);
    await waitCountdown(firstWait,`BLAST job ${rid} submitted.${estimate}`,28,40);
    let polls=0,unparsable=0;
    while(true){
      ensurePollingActive();
      const url=new URL(BLAST_ENDPOINT,location.href);
      url.searchParams.set('CMD','Get');url.searchParams.set('FORMAT_OBJECT','SearchInfo');url.searchParams.set('RID',rid);url.searchParams.set('tool',TOOL);url.searchParams.set('email',$('ncbiEmail').value.trim());
      const text=await fetchText(url.toString());polls++;
      const info=parseQBlastInfo(text);
      if(!info){
        unparsable++;updateDiagnostics([...baseDiag,'Status: unparsable',`Polls: ${polls}`,`Consecutive unparsable replies: ${unparsable}`]);
        if(unparsable>=3)throw new Error(`NCBI BLAST returned three consecutive status replies without a parsable QBlastInfo block for RID ${rid}.`);
        await waitCountdown(60,`BLAST job ${rid}: NCBI status reply could not be parsed. Retrying…`,40,50);continue;
      }
      unparsable=0;const {status,hits}=info;
      updateDiagnostics([...baseDiag,`Status: ${status}`,`Polls: ${polls}`,`Elapsed polling time: ~${polls} min`]);
      if(status==='READY'){
        if(hits==='no')throw new Error(`NCBI BLAST job ${rid} completed but found no significant hits with the selected parameters.`);
        setProgress(52,`BLAST job ${rid}: ready. Preparing result retrieval…`);await waitCountdown(10,'Search complete.',52,55);return;
      }
      if(status==='FAILED')throw new Error(`NCBI BLAST job ${rid} failed.`);
      if(status==='UNKNOWN')throw new Error(`NCBI BLAST job ${rid} is unknown or expired.`);
      if(status!=='WAITING')throw new Error(`NCBI BLAST job ${rid} returned unexpected status ${status}.`);
      const prefix=polls>=5?`BLAST job ${rid}: still waiting in the NCBI remote queue (${polls} min).`:`BLAST job ${rid}: waiting.`;
      await waitCountdown(60,prefix,40,50);
    }
  }

  function parseBlastTabular(text){
    const raw=String(text||'').replace(/\r\n?/g,'\n');
    const lines=raw.split('\n');
    let fields=[];
    for(const line of lines){
      const m=line.match(/^#\s*Fields:\s*(.+)$/i);
      if(m){fields=m[1].split(/\s*,\s*/).map(v=>v.trim().toLowerCase());break;}
    }
    const subjectIndex=fields.findIndex(name=>/^(subject acc\.ver|subject accession|subject id|subject seq-id)$/.test(name));
    const titleIndex=fields.findIndex(name=>/^(subject title|subject titles)$/.test(name));
    const hits=[];const seen=new Set();
    for(const line of lines){
      if(!line.trim()||line.startsWith('#'))continue;
      const cols=line.split('\t');
      const idx=subjectIndex>=0?subjectIndex:1;
      if(cols.length<=idx)continue;
      let accession=String(cols[idx]||'').trim();
      // Normalize common BLAST identifiers such as ref|XP_...| or gb|ABC...|.
      const pipe=accession.match(/(?:^|\|)([A-Z]{1,6}_?[A-Z0-9]*\d+(?:\.\d+)?)(?:\||$)/i);
      if(pipe)accession=pipe[1];
      if(!accession||seen.has(accession))continue;
      seen.add(accession);
      hits.push({accession,id:accession,title:titleIndex>=0&&cols.length>titleIndex?String(cols[titleIndex]||'').trim():''});
    }
    if(!hits.length){
      const clean=raw.replace(/^#.*$/gm,'').trim();
      if(!clean)throw new Error('NCBI BLAST returned an empty tabular hit table.');
      throw new Error('NCBI BLAST returned a tabular result, but no subject accessions could be parsed.');
    }
    return hits;
  }

  async function retrieveBlastHits(rid){
    // Use the documented text/tabular report instead of XML2. For ClusteredNR,
    // the subject accessions are the cluster representatives. Fetching those
    // accessions as complete protein FASTA therefore reproduces the biological
    // content of the manual "FASTA (cluster)" download while remaining within
    // the documented Common URL API.
    const url=new URL(BLAST_ENDPOINT,location.href);
    url.searchParams.set('CMD','Get');
    url.searchParams.set('RID',rid);
    url.searchParams.set('FORMAT_TYPE','Text');
    url.searchParams.set('ALIGNMENT_VIEW','Tabular');
    url.searchParams.set('DESCRIPTIONS',$('blastHits').value);
    url.searchParams.set('ALIGNMENTS',$('blastHits').value);
    url.searchParams.set('tool',TOOL);
    url.searchParams.set('email',$('ncbiEmail').value.trim());
    const table=await fetchText(url.toString());
    const hits=parseBlastTabular(table);
    return {table,hits};
  }

  function parseFetchedFasta(text){
    const records=A2CA.parseFastaRaw(text);
    if(!Object.keys(records).length)throw new Error('NCBI Protein returned no FASTA sequences.');
    return records;
  }

  async function efetchProteins(ids,email){
    const unique=[...new Set(ids.filter(Boolean))];
    if(!unique.length)return {};
    const body=new URLSearchParams();
    body.set('db','protein');body.set('id',unique.join(','));body.set('rettype','fasta');body.set('retmode','text');body.set('tool',TOOL);if(email)body.set('email',email);
    const text=await fetchText(EFETCH_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body});
    return parseFetchedFasta(text);
  }

  function dedupeRecords(records){
    const out={};const seqSeen=new Set();
    for(const [name,seq] of Object.entries(records)){
      const key=String(seq).replace(/\s+/g,'').toUpperCase();
      if(seqSeen.has(key))continue;
      seqSeen.add(key);let finalName=name||`Sequence_${Object.keys(out).length+1}`;let i=2;
      while(Object.prototype.hasOwnProperty.call(out,finalName)){finalName=`${name}_${i++}`;}
      out[finalName]=key;
    }
    return out;
  }

  function buildHomologSet(info,hitRecords,queryRecords){
    const ordered={};
    if(info&&info.sequence)ordered[info.name||'A2CA_query']=info.sequence;
    else Object.assign(ordered,queryRecords||{});
    Object.assign(ordered,hitRecords||{});
    return dedupeRecords(ordered);
  }

  function setInputsDisabled(disabled){
    ['queryFile','queryFetchIdentifier','fetchQueryBtn','queryStructureChain','queryText','ncbiEmail','blastDatabase','blastExpect','blastHits','blastMatrix','blastWordSize','blastGapCosts','blastComposition','blastFilter','blastShortQuery'].forEach(id=>$(id).disabled=disabled);
  }


  // Browsers may restore dynamically disabled controls from their back/forward cache.
  // Always rebuild transient runtime state explicitly when this page is entered or
  // restored. Completed BLAST results are restored separately from A2CA session data.
  function initializeTransientUi(){
    initGeneration++;
    running=false;
    queryInfo=null;
    blastSession=null;
    lastFasta='';
    lastClusterFasta='';
    structureInput=null;
    $('queryStructureControls').hidden=true;
    $('queryStructureChain').innerHTML='';
    $('queryStructureStatus').textContent='';
    $('queryFetchStatus').className='status';
    $('queryFetchStatus').textContent='Enter an NCBI protein accession or PDB identifier.';
    setInputsDisabled(false);
    $('fetchQueryBtn').disabled=!transportReady();
    $('runBlastBtn').disabled=true;
    $('continueBlastBtn').disabled=true;
    $('viewBlastSequencesBtn').disabled=true;
    $('stopBlastBtn').hidden=true;$('stopBlastBtn').disabled=false;$('stopBlastBtn').textContent='Stop BLAST run';
    $('blastProgress').hidden=true;
    ['stepQuery','stepSubmit','stepSearch','stepRetrieve','stepBlastReady'].forEach(id=>stepState(id,''));
    $('progressPercent').textContent='0%';
    $('progressBar').style.width='0%';
    $('blastStatus').className='status';
    $('blastStatus').textContent='Waiting to start.';
  }

  async function restorePageState(){
    const generation=++initGeneration;
    const data=await requestSession();
    if(generation!==initGeneration)return;

    // Restore only durable input values and fully completed BLAST results. A stale
    // in-progress state from a previous browser/server run is intentionally ignored.
    if(data&&data.inputWorkflow==='blast'){
      restoreStructureInput(data);
      if(data.blastQuery)$('queryText').value=data.blastQuery;
      if(data.blastFetchIdentifier)$('queryFetchIdentifier').value=data.blastFetchIdentifier;
      if(data.blastEmail)$('ncbiEmail').value=data.blastEmail;
      if(data.blastMeta&&data.blastMeta.parameters){
        const p=data.blastMeta.parameters;
        if(p.database){
          const migratedDatabase=p.database==='nr_clustered'?'nr_cluster_seq':p.database;
          if([...$('blastDatabase').options].some(option=>option.value===migratedDatabase))$('blastDatabase').value=migratedDatabase;
        }
        if(p.expect)$('blastExpect').value=p.expect;
        if(p.hitlistSize)$('blastHits').value=String(p.hitlistSize);
        if(p.matrix)$('blastMatrix').value=p.matrix;
        if(p.wordSize)$('blastWordSize').value=String(p.wordSize);
        if(p.gapCosts)$('blastGapCosts').value=p.gapCosts;
        if(p.compositionBasedStatistics!==undefined)$('blastComposition').value=String(p.compositionBasedStatistics);
        if(p.filter!==undefined)$('blastFilter').checked=p.filter!=='F';
        if(p.shortQueryAdjust!==undefined)$('blastShortQuery').checked=Boolean(p.shortQueryAdjust);
      }
    }

    validateQuery();

    const completed=Boolean(data&&data.inputWorkflow==='blast'&&data.blastFastaText&&data.blastMeta&&data.blastMeta.rid);
    if(completed){
      try{
        const records=A2CA.parseFastaRaw(data.blastFastaText);
        lastFasta=data.blastFastaText;
        lastClusterFasta=data.blastClusterFastaText||data.blastFastaText;
        blastSession=data;
        $('blastProgress').hidden=false;
        ['stepQuery','stepSubmit','stepSearch','stepRetrieve','stepBlastReady'].forEach(id=>stepState(id,'done'));
        setProgress(100,`Ready: ${Object.keys(records).length} protein sequences retrieved and prepared for MAFFT.`);
        $('blastStatus').className='status good';
        $('continueBlastBtn').disabled=false;$('viewBlastSequencesBtn').disabled=false;
      }catch(e){
        // Corrupt or incomplete persisted output must never lock the controls.
        blastSession=null;
        lastFasta='';
        lastClusterFasta='';
        $('continueBlastBtn').disabled=true;
        $('viewBlastSequencesBtn').disabled=true;
        $('stopBlastBtn').hidden=true;$('stopBlastBtn').disabled=false;$('stopBlastBtn').textContent='Stop BLAST run';
        validateQuery();
      }
    }
  }

  function initializePage(){
    initializeTransientUi();
    updateTransportStatus();
    updateDatabaseNote();
    restorePageState().then(updateDatabaseNote);
  }

  $('runBlastBtn').onclick=async()=>{
    validateQuery();if(!queryInfo||running||!transportReady()||!hasEmail())return;
    persistDraft();
    running=true;pollStopRequested=false;clearTimeout(stopButtonTimer);setInputsDisabled(true);$('runBlastBtn').disabled=true;$('continueBlastBtn').disabled=true;$('viewBlastSequencesBtn').disabled=true;$('blastProgress').hidden=false;
    const email=$('ncbiEmail').value.trim();
    try{
      stepState('stepQuery','done');stepState('stepSubmit','active');setProgress(8,'Preparing BLASTP query…');
      const searchInfo=queryInfo;
      setProgress(20,`Submitting ${searchInfo.sequence?searchInfo.sequence.length:'the'} aa protein sequence to NCBI BLASTP…`);
      const submitted=await submitBlast(searchInfo);
      scheduleStopButton();
      stepState('stepSubmit','done');stepState('stepSearch','active');setProgress(25,`NCBI RID ${submitted.rid} received.`);
      await pollBlast(submitted.rid,submitted.rtoe,submitted.parameters);
      clearTimeout(stopButtonTimer);stopButtonTimer=null;$('stopBlastBtn').hidden=true;
      stepState('stepSearch','done');stepState('stepRetrieve','active');setProgress(58,'Retrieving BLAST hit table…');
      const blast=await retrieveBlastHits(submitted.rid);
      const maxHits=Number($('blastHits').value)||50;
      const hitIds=blast.hits.slice(0,maxHits).map(h=>h.accession);
      setProgress(68,`Retrieving ${hitIds.length} complete cluster-representative protein sequences from NCBI Protein…`);
      const hitRecords=await efetchProteins(hitIds,email);
      // This is the ClusteredNR representative FASTA equivalent to the web UI's
      // "FASTA (cluster)" download. Keep it separately from the downstream
      // MAFFT input, which also includes the user's query as the reference.
      lastClusterFasta=A2CA.formatFasta(hitRecords);
      const homologs=buildHomologSet(searchInfo,hitRecords,{});
      const count=Object.keys(homologs).length;
      if(count<3)throw new Error(`Only ${count} non-identical protein sequences could be retrieved. At least three are required for the MAFFT workflow.`);
      if(count>500)throw new Error('More than 500 sequences were retrieved, exceeding the downstream MAFFT service limit. Reduce Maximum homologs.');
      lastFasta=A2CA.formatFasta(homologs);
      const params={database:$('blastDatabase').value,expect:$('blastExpect').value,hitlistSize:maxHits,matrix:$('blastMatrix').value,wordSize:$('blastWordSize').value,gapCosts:$('blastGapCosts').value,filter:$('blastFilter').checked?'L':'F',compositionBasedStatistics:$('blastComposition').value,shortQueryAdjust:$('blastShortQuery').checked};
      blastSession={
        alignmentText:'',treeText:'',alignmentFileName:'',treeFileName:'',
        originalFastaText:lastFasta,originalFastaFileName:`NCBI BLAST homologs (${submitted.rid})`,
        blastFastaText:lastFasta,blastClusterFastaText:lastClusterFasta,blastEmail:email,blastQuery:queryInfo.query,blastFetchIdentifier:$('queryFetchIdentifier').value.trim(),
        blastMeta:{rid:submitted.rid,rtoe:submitted.rtoe,program:'blastp',parameters:{...params,queryLength:searchInfo.sequence?searchInfo.sequence.length:null},hitCount:blast.hits.length,retrievedSequenceCount:count,resultFormat:'FASTA cluster representatives via tabular hit table + NCBI Protein EFetch'},
        structureText:structureInput?.text||'',structureFileName:structureInput?.fileName||'',structureFormat:structureInput?.format||'',structurePdbId:structureInput?.pdbId||'',
        structureChains:structureInput?.chains||null,structureMatches:[],selectedStructureChain:structureInput?.selectedChain||'',
        blastReferenceName:searchInfo.name,blastReferenceSequence:searchInfo.sequence||'',
        analysisState:{selectedSequence:searchInfo.name,selectedPositions:[]},inputWorkflow:'blast'
      };
      publishSession(blastSession);
      stepState('stepRetrieve','done');stepState('stepBlastReady','done');setProgress(100,`Ready: ${count} protein sequences retrieved and prepared for MAFFT.`);
      $('blastStatus').className='status good';$('continueBlastBtn').disabled=false;$('viewBlastSequencesBtn').disabled=false;
    }catch(e){
      const active=['stepSubmit','stepSearch','stepRetrieve','stepBlastReady'].find(id=>$(id).classList.contains('active'));
      if(e&&e.code==='A2CA_BLAST_POLL_STOPPED'){
        if(active)stepState(active,'');
        $('blastStatus').className='status warn';$('blastStatus').textContent=e.message;
      }else{
        if(active)stepState(active,'failed');$('blastStatus').className='status bad';$('blastStatus').textContent='Error: '+e.message;
      }
      $('continueBlastBtn').disabled=true;$('viewBlastSequencesBtn').disabled=true;
    }finally{
      running=false;clearTimeout(stopButtonTimer);stopButtonTimer=null;$('stopBlastBtn').hidden=true;$('stopBlastBtn').disabled=false;$('stopBlastBtn').textContent='Stop BLAST run';
      setInputsDisabled(false);$('runBlastBtn').disabled=!(queryInfo&&transportReady()&&hasEmail());
    }
  };

  $('stopBlastBtn').onclick=()=>{
    if(!running)return;
    pollStopRequested=true;$('stopBlastBtn').disabled=true;$('stopBlastBtn').textContent='Stopping…';
    $('blastStatus').className='status warn';$('blastStatus').textContent='Stopping A2CA polling. The submitted NCBI BLAST job itself may continue remotely.';
  };

  $('viewBlastSequencesBtn').onclick=()=>{if(blastSession&&lastClusterFasta){publishSession(blastSession);location.href=A2CA.localPageUrl('sequences.html');}};
  $('continueBlastBtn').onclick=()=>{if(blastSession&&lastFasta){publishSession(blastSession);location.href=A2CA.localPageUrl('upload_fasta.html');}};

  initializePage();

  // pageshow fires when a browser restores this page from its back/forward cache.
  // Reinitializing here prevents stale disabled buttons or a stale `running` flag.
  window.addEventListener('pageshow',event=>{
    if(event.persisted)initializePage();
  });
})();
