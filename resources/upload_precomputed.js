'use strict';
(function(){
  const $=id=>document.getElementById(id);
  let baseSession={};
  let alignmentText='',treeText='',alignment=null,tree=null;
  let alignmentFileName='',treeFileName='';

  function publishSession(data){
    baseSession=data;
    A2CA.session.publish(data);
  }

  function currentSession(){
    return {
      ...baseSession,
      alignmentText,treeText,alignmentFileName,treeFileName,
      /* Structure selection now happens on reference.html. Clear any stale
         structure whenever the precomputed input is replaced. */
      structureText:'',structureFileName:'',structureChains:null,structureMatches:[],selectedStructureChain:'',
      analysisState:null,
      inputWorkflow:'precomputed'
    };
  }

  function updateSummary(){
    const box=$('inputSummary');
    if(!(alignment&&tree)){box.hidden=true;return;}
    const n=Object.keys(alignment).length;
    const leaves=A2CA.leaves(tree).length;
    box.textContent=`Ready: ${n} aligned sequences | ${leaves} tree tips`;
    box.hidden=false;
  }

  function updateContinue(){
    $('viewAlignmentBtn').disabled=!(alignment&&alignmentText);
    $('viewTreeBtn').disabled=!(tree&&treeText);
    $('continueBtn').disabled=!(alignment&&tree&&alignmentText&&treeText);
    updateSummary();
  }

  function resetTree(){
    treeText='';tree=null;treeFileName='';$('treeFile').value='';
    $('treeStatus').className='status';$('treeStatus').textContent='Alignment loaded. Select the corresponding tree.';
  }

  function restoreSession(session){
    if(!session||!session.alignmentText||!session.treeText)return;
    try{
      baseSession=session;
      alignmentText=session.alignmentText;treeText=session.treeText;
      alignment=A2CA.parseFasta(alignmentText);tree=A2CA.parseNewick(treeText);
      alignmentFileName=session.alignmentFileName||'previous alignment';treeFileName=session.treeFileName||'previous tree';
      $('treeFile').disabled=false;
      $('alignmentStatus').className='status good';
      $('alignmentStatus').textContent=`Loaded: ${alignmentFileName} – ${Object.keys(alignment).length} sequences, alignment length ${alignment[Object.keys(alignment)[0]].length}.`;
      $('treeStatus').className='status good';
      $('treeStatus').textContent=`Loaded: ${treeFileName} – ${A2CA.leaves(tree).length} terminal nodes.`;
      updateContinue();
    }catch(e){/* leave empty */}
  }

  A2CA.session.request().then(restoreSession);


  $('alnFile').addEventListener('change',async()=>{
    try{
      const text=await A2CA.readFile($('alnFile'));
      const parsed=A2CA.parseFasta(text);
      alignmentText=text;alignment=parsed;alignmentFileName=$('alnFile').files[0]?.name||'alignment';
      resetTree();
      $('treeFile').disabled=false;
      const names=Object.keys(parsed);
      $('alignmentStatus').className='status good';
      $('alignmentStatus').textContent=`Loaded: ${alignmentFileName} – ${names.length} sequences, alignment length ${parsed[names[0]].length}.`;
      publishSession(currentSession());updateContinue();
    }catch(e){
      alignmentText='';alignment=null;alignmentFileName='';resetTree();
      $('treeFile').disabled=true;
      $('alignmentStatus').className='status bad';$('alignmentStatus').textContent='Error: '+e.message;
      publishSession(currentSession());updateContinue();
    }
  });

  $('treeFile').addEventListener('change',async()=>{
    try{
      if(!alignment)throw new Error('Load a valid alignment first.');
      const text=await A2CA.readFile($('treeFile'));
      const parsed=A2CA.parseNewick(text);
      const treeLeaves=A2CA.leaves(parsed).map(x=>x.name);
      if(treeLeaves.length<2)throw new Error('The tree must contain at least two terminal nodes.');
      A2CA.validateTreeAlignment(alignment,parsed);
      treeText=text;tree=parsed;treeFileName=$('treeFile').files[0]?.name||'tree';
      $('treeStatus').className='status good';
      $('treeStatus').textContent=`Loaded: ${treeFileName} – ${treeLeaves.length} terminal nodes.`;
      publishSession(currentSession());updateContinue();
    }catch(e){
      treeText='';tree=null;treeFileName='';
      $('treeStatus').className='status bad';$('treeStatus').textContent='Error: '+e.message;
      publishSession(currentSession());updateContinue();
    }
  });

  $('viewAlignmentBtn').onclick=()=>{
    if(!(alignment&&alignmentText))return;
    publishSession(currentSession());
    location.href=A2CA.localPageUrl('alignment.html?return=upload_precomputed.html');
  };

  $('viewTreeBtn').onclick=()=>{
    if(!(tree&&treeText))return;
    publishSession(currentSession());
    location.href=A2CA.localPageUrl('tree.html?return=upload_precomputed.html');
  };

  $('continueBtn').onclick=()=>{
    if(!(alignment&&tree&&alignmentText&&treeText))return;
    publishSession(currentSession());location.href=A2CA.localPageUrl('reference.html');
  };
})();
