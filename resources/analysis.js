'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const embedded=window.parent!==window;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const AA_SEARCH_NAMES={
    A:'ALA ALANINE',R:'ARG ARGININE',N:'ASN ASPARAGINE',D:'ASP ASPARTATE ASPARTIC',
    C:'CYS CYSTEINE',Q:'GLN GLUTAMINE',E:'GLU GLUTAMATE GLUTAMIC',G:'GLY GLYCINE',
    H:'HIS HISTIDINE',I:'ILE ISOLEUCINE',L:'LEU LEUCINE',K:'LYS LYSINE',M:'MET METHIONINE',
    F:'PHE PHENYLALANINE',P:'PRO PROLINE',S:'SER SERINE',T:'THR THREONINE',
    W:'TRP TRYPTOPHAN',Y:'TYR TYROSINE',V:'VAL VALINE'
  };
  const AA3_TO_1={
    ALA:'A',ARG:'R',ASN:'N',ASP:'D',CYS:'C',GLN:'Q',GLU:'E',GLY:'G',HIS:'H',ILE:'I',
    LEU:'L',LYS:'K',MET:'M',PHE:'F',PRO:'P',SER:'S',THR:'T',TRP:'W',TYR:'Y',VAL:'V',
    MSE:'M',SEC:'U',PYL:'O',ASX:'B',GLX:'Z',XLE:'J',UNK:'X',HYP:'P'
  };

  const BLOSUM_AA='ARNDCQEGHILKMFPSTWYV';
  const BLOSUM62_ROWS=[
    [4,-1,-2,-2,0,-1,-1,0,-2,-1,-1,-1,-1,-2,-1,1,0,-3,-2,0],
    [-1,5,0,-2,-3,1,0,-2,0,-3,-2,2,-1,-3,-2,-1,-1,-3,-2,-3],
    [-2,0,6,1,-3,0,0,0,1,-3,-3,0,-2,-3,-2,1,0,-4,-2,-3],
    [-2,-2,1,6,-3,0,2,-1,-1,-3,-4,-1,-3,-3,-1,0,-1,-4,-3,-3],
    [0,-3,-3,-3,9,-3,-4,-3,-3,-1,-1,-3,-1,-2,-3,-1,-1,-2,-2,-1],
    [-1,1,0,0,-3,5,2,-2,0,-3,-2,1,0,-3,-1,0,-1,-2,-1,-2],
    [-1,0,0,2,-4,2,5,-2,0,-3,-3,1,-2,-3,-1,0,-1,-3,-2,-2],
    [0,-2,0,-1,-3,-2,-2,6,-2,-4,-4,-2,-3,-3,-2,0,-2,-2,-3,-3],
    [-2,0,1,-1,-3,0,0,-2,8,-3,-3,-1,-2,-1,-2,-1,-2,-2,2,-3],
    [-1,-3,-3,-3,-1,-3,-3,-4,-3,4,2,-3,1,0,-3,-2,-1,-3,-1,3],
    [-1,-2,-3,-4,-1,-2,-3,-4,-3,2,4,-2,2,0,-3,-2,-1,-2,-1,1],
    [-1,2,0,-1,-3,1,1,-2,-1,-3,-2,5,-1,-3,-1,0,-1,-3,-2,-2],
    [-1,-1,-2,-3,-1,0,-2,-3,-2,1,2,-1,5,0,-2,-1,-1,-1,-1,1],
    [-2,-3,-3,-3,-2,-3,-3,-3,-1,0,0,-3,0,6,-4,-2,-2,1,3,-1],
    [-1,-2,-2,-1,-3,-1,-1,-2,-2,-3,-3,-1,-2,-4,7,-1,-1,-4,-3,-2],
    [1,-1,1,0,-1,0,0,0,-1,-2,-2,0,-1,-2,-1,4,1,-3,-2,-2],
    [0,-1,0,-1,-1,-1,-1,-2,-2,-1,-1,-1,-1,-2,-1,1,5,-2,-2,0],
    [-3,-3,-4,-4,-2,-2,-3,-2,-2,-3,-2,-3,-1,1,-4,-3,-2,11,2,-3],
    [-2,-2,-2,-3,-2,-1,-2,-3,2,-1,-1,-2,-1,3,-3,-2,-2,2,7,-1],
    [0,-3,-3,-3,-1,-2,-2,-3,-3,3,1,-2,1,-1,-2,-2,0,-3,-1,4]
  ];
  const VALID_AA=new Set(BLOSUM_AA.split(''));
  const HEATMAP_AA_ORDER=Array.from('GAVLIMFWYCPSTNQDEKRH');
  const LEGACY_AA_COLORS={G:'#BCC4CA',A:'#773D0B',V:'#EA7B1B',L:'#B35C10',I:'#F2B076',F:'#BBCE70',W:'#8DAE10',Y:'#738218',C:'#FFFF00',M:'#CCCC00',D:'#950024',E:'#D60033',K:'#5286C4',R:'#2F5889',H:'#269693',N:'#7030A0',Q:'#CC0099',S:'#FF265B',T:'#FF6F91',P:'#003560','-':'#FFFFFF',NA:'#FFFFFF',X:'#DDDDDD','?':'#DDDDDD'};
  const DEFAULT_CORRELATION_COLORS={
    heatmapPositive:'#2463A6',heatmapNegative:'#D28A78',heatmapNeutral:'#F1F5F9',
    bubbleFill:'#7DA9D6',bubbleStroke:'#2463A6',
    treeResidueA:'#2463A6',treeResidueB:'#2F8F5B',treeBoth:'#7651A8',treeNeutral:'#AAB4BE'
  };
  const CORRELATION_COLOR_LABELS={
    heatmapPositive:'Positive enrichment',heatmapNegative:'Negative enrichment',heatmapNeutral:'Neutral enrichment',
    bubbleFill:'Property bubbles',bubbleStroke:'Bubble outline',treeResidueA:'Residue 1 change',
    treeResidueB:'Residue 2 change',treeBoth:'Both residues',treeNeutral:'No inferred change'
  };
  const blosumScore=(a,b)=>{
    const i=BLOSUM_AA.indexOf(String(a||'').toUpperCase());
    const j=BLOSUM_AA.indexOf(String(b||'').toUpperCase());
    return i>=0&&j>=0?BLOSUM62_ROWS[i][j]:NaN;
  };

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

  function start(session){
    if(!session||!session.alignmentText||!session.treeText){
      $('missingData').hidden=false;
      return;
    }

    let parsedAlignment,parsedTree;
    try{
      session=A2CA.validateSessionData(session);
      parsedAlignment=A2CA.parseFasta(session.alignmentText);
      parsedTree=A2CA.parseNewick(session.treeText);
    }catch(e){
      $('missingData').hidden=false;
      $('missingData').innerHTML=`<h2>Input data could not be restored</h2><p>${A2CA.escapeHtml(e.message)}</p><a class="button-link" href="upload.html">Go to upload</a>`;
      return;
    }

    const restored=session.analysisState||{};
    const STATE={
      alignment:parsedAlignment,
      tree:parsedTree,
      selectedSequence:restored.selectedSequence&&parsedAlignment[restored.selectedSequence]?restored.selectedSequence:(Object.keys(parsedAlignment)[0]||''),
      selectedPositions:Array.isArray(restored.selectedPositions)?restored.selectedPositions.map(Number).filter(Number.isFinite):[],
      customParameterMode:restored.customParameterMode==='custom'?'custom':'default',
      calcMode:restored.calcMode==='sum'?'sum':'average',
      absoluteMode:restored.absoluteMode==='relative to reference'?'relative to reference':'absolute',
      parameterViewMode:restored.parameterViewMode==='yes'?'yes':'no',
      selectedParameter:restored.selectedParameter||'Hydrophobicity',
      customProperties:restored.customProperties||A2CA.deepClone(A2CA.DEFAULT_PROPERTIES),
      colors:(()=>{
        const saved=restored.colors||{};
        if(restored.paletteVersion===2){const out={...A2CA.DEFAULT_COLORS};for(const [aa,c] of Object.entries(saved))if(A2CA.isHexColor(c))out[aa]=c;return out;}
        const migrated={...A2CA.DEFAULT_COLORS};
        for(const [aa,value] of Object.entries(saved)){
          if(A2CA.isHexColor(value)&&(!LEGACY_AA_COLORS[aa]||String(value).toUpperCase()!==String(LEGACY_AA_COLORS[aa]).toUpperCase()))migrated[aa]=value;
        }
        return migrated;
      })(),
      plotColors:(()=>{const out={...DEFAULT_CORRELATION_COLORS};for(const [k,c] of Object.entries(restored.plotColors||{}))if(Object.prototype.hasOwnProperty.call(DEFAULT_CORRELATION_COLORS,k)&&A2CA.isHexColor(c))out[k]=c;return out;})(),
      correlationPositionA:Number(restored.correlationPositionA)||null,
      correlationPositionB:Number(restored.correlationPositionB)||null,
      audit:restored.audit||'Alignment and tree loaded. Select residues to update the analysis.',
      projectName:String(restored.projectName||'')
    };

    let structureViewer=null;
    let structureModel=null;
    let structureViewerInitialized=false;
    let structureStyleMode=restored.structureStyleMode==='stick'?'stick':'cartoon';
    let visibleStructureChains=new Set(Array.isArray(restored.visibleStructureChains)?restored.visibleStructureChains:[]);
    let observedStructureResidues=null;
    let referenceToStructureMap=new Map();
    let structureToReferenceMap=new Map();
    let structureToReferenceResidueMap=new Map();
    let structurePickedResidues=Array.isArray(restored.structurePickedResidues)?restored.structurePickedResidues.filter(x=>x&&x.chain!==undefined&&x.resi!==undefined):[];
    let correlationTreeMetricsCache=null;

    $('analysisApp').hidden=false;
    $('inputSummary').textContent=`Alignment: ${session.alignmentFileName||'loaded file'} | Tree: ${session.treeFileName||'loaded file'} | ${Object.keys(STATE.alignment).length} sequences`;
    if($('downloadPrefix'))$('downloadPrefix').value=STATE.projectName;
    if($('correlationDownloadPrefix'))$('correlationDownloadPrefix').value=STATE.projectName;
    if($('sessionProjectName'))$('sessionProjectName').value=STATE.projectName;

    function persist(){
      const data={
        ...session,
        analysisState:{
          ...(session.analysisState||{}),
          selectedSequence:STATE.selectedSequence,
          selectedPositions:STATE.selectedPositions,
          customParameterMode:STATE.customParameterMode,
          calcMode:STATE.calcMode,
          absoluteMode:STATE.absoluteMode,
          parameterViewMode:STATE.parameterViewMode,
          selectedParameter:STATE.selectedParameter,
          customProperties:STATE.customProperties,
          colors:STATE.colors,
          paletteVersion:2,
          plotColors:STATE.plotColors,
          correlationPositionA:STATE.correlationPositionA,
          correlationPositionB:STATE.correlationPositionB,
          audit:STATE.audit,
          projectName:STATE.projectName,
          structureStyleMode,
          visibleStructureChains:[...visibleStructureChains],
          structurePickedResidues
        }
      };
      session=data;
      A2CA.saveSession(data);
      if(embedded)A2CA.postToParent('A2CA_SAVE_SESSION',data);
    }

    function getCurrentPropertyFile(){
      return STATE.customParameterMode==='custom'?STATE.customProperties:A2CA.DEFAULT_PROPERTIES;
    }

    function propertyNames(){return A2CA.propertyNames(getCurrentPropertyFile());}

    function targetSequenceToTable(){
      if(!STATE.selectedSequence||!STATE.alignment[STATE.selectedSequence])return [];
      const seq=STATE.alignment[STATE.selectedSequence];
      let rows=[],ungapped=1;
      for(let i=0;i<seq.length;i++){
        if(seq[i]!=='-'){
          rows.push({
            NR:i+1,
            residue:seq[i],
            sequencePosition:ungapped,
            AA:`${seq[i]}${ungapped}`
          });
          ungapped++;
        }
      }
      return rows;
    }

    function getSelectionMatrix(){
      const names=Object.keys(STATE.alignment);
      if(!names.length||!STATE.selectedPositions.length)return [];
      return names.map(name=>({
        name,
        residues:STATE.selectedPositions.map(pos=>STATE.alignment[name][pos-1]||'')
      }));
    }

    function getParameterMatrix(){
      const sel=getSelectionMatrix(),props=getCurrentPropertyFile(),param=STATE.selectedParameter;
      return sel.map(row=>({
        name:row.name,
        values:row.residues.map(aa=>aa==='-'?NaN:(props[String(aa).toUpperCase()]?.[param]??NaN))
      }));
    }

    function rowValues(){
      const pm=getParameterMatrix();
      let values={};
      for(const row of pm){
        const nums=row.values.filter(Number.isFinite);
        values[row.name]=nums.length
          ?(STATE.calcMode==='sum'?nums.reduce((a,b)=>a+b,0):nums.reduce((a,b)=>a+b,0)/nums.length)
          :NaN;
      }
      if(STATE.absoluteMode==='relative to reference'&&STATE.selectedSequence in values&&Number.isFinite(values[STATE.selectedSequence])){
        const ref=values[STATE.selectedSequence];
        Object.keys(values).forEach(k=>{if(Number.isFinite(values[k]))values[k]-=ref;});
      }
      return values;
    }

    function updateTable(){
      const sel=getSelectionMatrix(),vals=rowValues();
      return sel.map(row=>{
        let o={Sequence:row.name};
        row.residues.forEach((aa,i)=>o[String(i+1)]=aa);
        o[STATE.selectedParameter]=Number.isFinite(vals[row.name])?vals[row.name]:'';
        return o;
      });
    }

    function nameToYFromLeaves(leafNodes){
      let m={};
      leafNodes.forEach(l=>m[l.name]=l.y);
      return m;
    }

    function resolveY(name,yMap){
      if(yMap[name]!==undefined)return yMap[name];
      const hit=A2CA.matchTreeName(name,Object.keys(yMap));
      return hit===null?undefined:yMap[hit];
    }

    function selectedResidueDescriptors(){
      const rows=targetSequenceToTable();
      const byAlignmentPos=new Map(rows.map(row=>[row.NR,row]));
      return STATE.selectedPositions.map(pos=>byAlignmentPos.get(pos)).filter(Boolean).map(row=>({
        alignmentPosition:row.NR,
        referencePosition:row.sequencePosition,
        residue:row.residue,
        label:row.AA
      }));
    }

    function selectedResidueAbundances(){
      const names=Object.keys(STATE.alignment);
      const total=names.length;
      return selectedResidueDescriptors().map(item=>{
        const refAA=String(STATE.alignment[STATE.selectedSequence]?.[item.alignmentPosition-1]||'').toUpperCase();
        let matches=0;
        for(const name of names){
          if(String(STATE.alignment[name]?.[item.alignmentPosition-1]||'').toUpperCase()===refAA)matches++;
        }
        return total?100*matches/total:0;
      });
    }

    function syncCrossCorrelationControls(){
      const residues=selectedResidueDescriptors();
      const ids=residues.map(r=>r.alignmentPosition);
      const a=$('CorrelationResidueA'),b=$('CorrelationResidueB');
      const options=residues.map(r=>`<option value="${r.alignmentPosition}">${A2CA.escapeHtml(r.label)}</option>`).join('');
      a.innerHTML=options;
      b.innerHTML=options;
      const usable=residues.length>=2;
      a.disabled=!usable;
      b.disabled=!usable;
      if(!usable){
        STATE.correlationPositionA=ids[0]||null;
        STATE.correlationPositionB=null;
        return;
      }
      if(!ids.includes(Number(STATE.correlationPositionA)))STATE.correlationPositionA=ids[0];
      if(!ids.includes(Number(STATE.correlationPositionB))||Number(STATE.correlationPositionB)===Number(STATE.correlationPositionA)){
        STATE.correlationPositionB=ids.find(x=>x!==Number(STATE.correlationPositionA))||ids[1];
      }
      a.value=String(STATE.correlationPositionA);
      b.value=String(STATE.correlationPositionB);
    }

    function pearson(xs,ys){
      const pairs=[];
      for(let i=0;i<Math.min(xs.length,ys.length);i++)if(Number.isFinite(xs[i])&&Number.isFinite(ys[i]))pairs.push([xs[i],ys[i]]);
      if(pairs.length<3)return NaN;
      const mx=pairs.reduce((s,p)=>s+p[0],0)/pairs.length;
      const my=pairs.reduce((s,p)=>s+p[1],0)/pairs.length;
      let num=0,dx=0,dy=0;
      for(const [x,y] of pairs){const a=x-mx,b=y-my;num+=a*b;dx+=a*a;dy+=b*b;}
      return dx>0&&dy>0?num/Math.sqrt(dx*dy):NaN;
    }

    function ranks(values){
      const out=new Array(values.length).fill(NaN);
      const entries=values.map((v,i)=>({v,i})).filter(x=>Number.isFinite(x.v)).sort((a,b)=>a.v-b.v);
      for(let i=0;i<entries.length;){
        let j=i+1;while(j<entries.length&&entries[j].v===entries[i].v)j++;
        const rank=(i+j-1)/2+1;
        for(let k=i;k<j;k++)out[entries[k].i]=rank;
        i=j;
      }
      return out;
    }
    const spearman=(xs,ys)=>pearson(ranks(xs),ranks(ys));

    function residualize(values,covariate){
      const idx=[];
      for(let i=0;i<Math.min(values.length,covariate.length);i++)if(Number.isFinite(values[i])&&Number.isFinite(covariate[i]))idx.push(i);
      if(idx.length<3)return values.map(()=>NaN);
      const mx=idx.reduce((s,i)=>s+covariate[i],0)/idx.length;
      const my=idx.reduce((s,i)=>s+values[i],0)/idx.length;
      let den=0,num=0;
      for(const i of idx){const dx=covariate[i]-mx;den+=dx*dx;num+=dx*(values[i]-my);}
      const slope=den>0?num/den:0;
      const intercept=my-slope*mx;
      return values.map((v,i)=>Number.isFinite(v)&&Number.isFinite(covariate[i])?v-(intercept+slope*covariate[i]):NaN);
    }

    function correlationResidueData(){
      const posA=Number(STATE.correlationPositionA),posB=Number(STATE.correlationPositionB);
      if(!posA||!posB||posA===posB)return null;
      const rows=[];
      for(const [name,seq] of Object.entries(STATE.alignment)){
        const aaA=String(seq[posA-1]||'').toUpperCase();
        const aaB=String(seq[posB-1]||'').toUpperCase();
        if(VALID_AA.has(aaA)&&VALID_AA.has(aaB))rows.push({name,aaA,aaB});
      }
      return {posA,posB,rows};
    }

    function matchTreeLeaf(sequenceName,leafNodes){
      const matched=A2CA.matchTreeName(sequenceName,leafNodes.map(x=>x.name));
      return matched===null?null:(leafNodes.find(x=>x.name===matched)||null);
    }

    function buildTreeMetrics(){
      const root=STATE.tree;
      const all=A2CA.walkTree(root);
      const leaves=A2CA.leaves(root);
      const hasLengths=all.some(n=>Number(n.length)>0);
      const parent=new Map(),rootDist=new Map([[root,0]]),descCount=new Map();
      function descend(node){
        let count=node.children.length?0:1;
        for(const child of node.children){
          parent.set(child,node);
          rootDist.set(child,(rootDist.get(node)||0)+(hasLengths?Math.max(0,Number(child.length)||0):1));
          count+=descend(child);
        }
        descCount.set(node,count);
        return count;
      }
      descend(root);
      const leafBySequence=new Map();
      for(const name of Object.keys(STATE.alignment)){
        const leaf=matchTreeLeaf(name,leaves);
        if(leaf)leafBySequence.set(name,leaf);
      }
      const rawWeights={};
      for(const [name,leaf] of leafBySequence){
        let node=leaf,w=0;
        while(parent.has(node)){
          const len=hasLengths?Math.max(0,Number(node.length)||0):1;
          w+=len/Math.max(1,descCount.get(node)||1);
          node=parent.get(node);
        }
        rawWeights[name]=w>0?w:1;
      }
      const names=Object.keys(STATE.alignment);
      const mapped=Object.values(rawWeights);
      const fallback=mapped.length?mapped.reduce((a,b)=>a+b,0)/mapped.length:1;
      for(const name of names)if(!Number.isFinite(rawWeights[name]))rawWeights[name]=fallback;
      const mean=names.length?names.reduce((s,n)=>s+rawWeights[n],0)/names.length:1;
      const weights={};for(const n of names)weights[n]=rawWeights[n]/(mean||1);

      const ancestorCache=new Map();
      function ancestors(node){
        if(ancestorCache.has(node))return ancestorCache.get(node);
        const set=new Set();let cur=node;while(cur){set.add(cur);cur=parent.get(cur);}
        ancestorCache.set(node,set);return set;
      }
      function distance(nameA,nameB){
        if(nameA===nameB)return 0;
        const a=leafBySequence.get(nameA),b=leafBySequence.get(nameB);
        if(!a||!b)return NaN;
        const aset=ancestors(a);let cur=b,lca=root;
        while(cur){if(aset.has(cur)){lca=cur;break;}cur=parent.get(cur);}
        return (rootDist.get(a)||0)+(rootDist.get(b)||0)-2*(rootDist.get(lca)||0);
      }
      return {weights,distance,leafBySequence,hasLengths,parent,descCount};
    }

    function similarityCorrelation(rows,treeMetrics){
      const MAX_PAIRWISE_SEQUENCES=1000;
      let sample=rows;
      if(rows.length>MAX_PAIRWISE_SEQUENCES){
        sample=Array.from({length:MAX_PAIRWISE_SEQUENCES},(_,i)=>rows[Math.floor(i*(rows.length-1)/(MAX_PAIRWISE_SEQUENCES-1))]);
      }
      const raw={n:0,sx:0,sy:0,sxx:0,syy:0,sxy:0};
      const adj={n:0,sx:0,sy:0,sd:0,sxx:0,syy:0,sdd:0,sxy:0,sxd:0,syd:0};
      const add2=(a,x,y)=>{a.n++;a.sx+=x;a.sy+=y;a.sxx+=x*x;a.syy+=y*y;a.sxy+=x*y;};
      const add3=(a,x,y,d)=>{a.n++;a.sx+=x;a.sy+=y;a.sd+=d;a.sxx+=x*x;a.syy+=y*y;a.sdd+=d*d;a.sxy+=x*y;a.sxd+=x*d;a.syd+=y*d;};
      for(let i=0;i<sample.length;i++)for(let j=i+1;j<sample.length;j++){
        const x=blosumScore(sample[i].aaA,sample[j].aaA),y=blosumScore(sample[i].aaB,sample[j].aaB);
        if(!Number.isFinite(x)||!Number.isFinite(y))continue;add2(raw,x,y);
        if(treeMetrics){const d=treeMetrics.distance(sample[i].name,sample[j].name);if(Number.isFinite(d))add3(adj,x,y,d);}
      }
      const corr=(n,sx,sy,sxx,syy,sxy)=>{if(n<3)return NaN;const vx=sxx-sx*sx/n,vy=syy-sy*sy/n,cov=sxy-sx*sy/n;return vx>0&&vy>0?cov/Math.sqrt(vx*vy):NaN;};
      const rxy=corr(raw.n,raw.sx,raw.sy,raw.sxx,raw.syy,raw.sxy);
      let adjusted=NaN;
      if(adj.n>=3){
        const rxy2=corr(adj.n,adj.sx,adj.sy,adj.sxx,adj.syy,adj.sxy),rxd=corr(adj.n,adj.sx,adj.sd,adj.sxx,adj.sdd,adj.sxd),ryd=corr(adj.n,adj.sy,adj.sd,adj.syy,adj.sdd,adj.syd);
        const den=Math.sqrt((1-rxd*rxd)*(1-ryd*ryd));if(Number.isFinite(rxy2)&&Number.isFinite(rxd)&&Number.isFinite(ryd)&&den>0)adjusted=(rxy2-rxd*ryd)/den;
      }
      return {raw:rxy,adjusted,pairs:raw.n,adjustedPairs:adj.n,sampled:sample.length<rows.length,sampledSequences:sample.length,totalSequences:rows.length};
    }

    function pairFrequency(rows,weights=null){
      const counts=new Map(),rowCounts=new Map(),colCounts=new Map();
      let total=0;
      for(const row of rows){
        const w=weights?Number(weights[row.name]||0):1;
        if(!(w>0))continue;
        const key=`${row.aaA}|${row.aaB}`;
        counts.set(key,(counts.get(key)||0)+w);
        rowCounts.set(row.aaA,(rowCounts.get(row.aaA)||0)+w);
        colCounts.set(row.aaB,(colCounts.get(row.aaB)||0)+w);
        total+=w;
      }
      return {counts,rowCounts,colCounts,total};
    }

    function hexToRgb(hex){
      const clean=String(hex||'').replace('#','');
      if(!/^[0-9a-fA-F]{6}$/.test(clean))return [128,128,128];
      return [parseInt(clean.slice(0,2),16),parseInt(clean.slice(2,4),16),parseInt(clean.slice(4,6),16)];
    }

    function mixColor(fromHex,toHex,t){
      const a=hexToRgb(fromHex),b=hexToRgb(toHex),u=clamp(Number(t)||0,0,1);
      return `rgb(${a.map((x,i)=>Math.round(x+(b[i]-x)*u)).join(',')})`;
    }

    function enrichmentColor(value,maxAbs){
      const t=maxAbs>0?Math.min(1,Math.abs(value)/maxAbs):0;
      return value>=0?mixColor(STATE.plotColors.heatmapNeutral,STATE.plotColors.heatmapPositive,t):mixColor(STATE.plotColors.heatmapNeutral,STATE.plotColors.heatmapNegative,t);
    }

    function renderPairHeatmap(targetId,rows,weights,score,labelA,labelB){
      const box=$(targetId);
      const data=pairFrequency(rows,weights);
      if(!rows.length||data.total<=0){box.innerHTML='<div class="correlation-plot-empty">No ungapped amino-acid pairs are available for these positions.</div>';return;}
      const aaA=HEATMAP_AA_ORDER.filter(aa=>data.rowCounts.has(aa));
      const aaB=HEATMAP_AA_ORDER.filter(aa=>data.colCounts.has(aa));
      const width=620,height=400,left=62,top=38,right=24,bottom=108;
      const plotW=width-left-right,plotH=height-top-bottom;
      const cw=plotW/Math.max(aaB.length,1),ch=plotH/Math.max(aaA.length,1);
      const values=[];
      for(const a of aaA)for(const b of aaB){
        const obs=data.counts.get(`${a}|${b}`)||0;
        const exp=(data.rowCounts.get(a)||0)*(data.colCounts.get(b)||0)/data.total;
        values.push(Math.log2((obs+0.25)/(exp+0.25)));
      }
      const maxAbs=Math.max(1,...values.map(Math.abs));
      const gradientId=`enrichment_${targetId.replace(/[^A-Za-z0-9_-]/g,'_')}`;
      const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Residue pair enrichment heatmap" font-family="Arial,Helvetica,sans-serif">`];
      parts.push(`<defs><linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="${STATE.plotColors.heatmapNegative}"/><stop offset="50%" stop-color="${STATE.plotColors.heatmapNeutral}"/><stop offset="100%" stop-color="${STATE.plotColors.heatmapPositive}"/></linearGradient></defs>`);
      const scoreText=Number.isFinite(score)?`Similarity r = ${score.toFixed(3)}`:'Similarity r = n/a';
      parts.push(`<text x="${width-right}" y="17" text-anchor="end" font-size="10" fill="#6b7b8b">${scoreText}</text>`);
      aaB.forEach((aa,j)=>parts.push(`<text x="${left+(j+.5)*cw}" y="${top-10}" text-anchor="middle" font-size="11" font-weight="700">${aa}</text>`));
      aaA.forEach((aa,i)=>parts.push(`<text x="${left-10}" y="${top+(i+.5)*ch+4}" text-anchor="end" font-size="11" font-weight="700">${aa}</text>`));
      aaA.forEach((a,i)=>aaB.forEach((b,j)=>{
        const obs=data.counts.get(`${a}|${b}`)||0;
        const expected=(data.rowCounts.get(a)||0)*(data.colCounts.get(b)||0)/data.total;
        const enrichment=Math.log2((obs+0.25)/(expected+0.25));
        const pct=100*obs/data.total;
        const x=left+j*cw,y=top+i*ch;
        const fill=enrichmentColor(enrichment,maxAbs);
        const textColor=Math.abs(enrichment/maxAbs)>.58?'#fff':'#25313c';
        parts.push(`<rect x="${x+.5}" y="${y+.5}" width="${Math.max(1,cw-1)}" height="${Math.max(1,ch-1)}" rx="2" fill="${fill}"><title>${a}/${b}: ${pct.toFixed(1)}% observed; log2 enrichment ${enrichment.toFixed(2)}</title></rect>`);
        if(cw>=27&&ch>=22&&obs>0)parts.push(`<text x="${x+cw/2}" y="${y+ch/2+3.5}" text-anchor="middle" font-size="${Math.min(10,ch*.36)}" fill="${textColor}">${pct>=10?pct.toFixed(0):pct.toFixed(1)}%</text>`);
      }));
      const axisY=top+plotH+27;
      parts.push(`<text x="${left+plotW/2}" y="${axisY}" text-anchor="middle" font-size="11" fill="#526171">${A2CA.escapeHtml(labelB)}</text>`);
      parts.push(`<text x="15" y="${top+plotH/2}" text-anchor="middle" font-size="11" fill="#526171" transform="rotate(-90 15 ${top+plotH/2})">${A2CA.escapeHtml(labelA)}</text>`);
      const legendW=190,legendH=10,legendX=left+(plotW-legendW)/2,legendY=height-44;
      parts.push(`<text x="${legendX+legendW/2}" y="${legendY-7}" text-anchor="middle" font-size="9" fill="#6b7b8b">log2 enrichment</text>`);
      parts.push(`<rect x="${legendX}" y="${legendY}" width="${legendW}" height="${legendH}" rx="3" fill="url(#${gradientId})" stroke="#c8d2dc" stroke-width=".6"/>`);
      parts.push(`<text x="${legendX}" y="${legendY+24}" text-anchor="middle" font-size="9" fill="#6b7b8b">-${maxAbs.toFixed(1)}</text>`);
      parts.push(`<text x="${legendX+legendW/2}" y="${legendY+24}" text-anchor="middle" font-size="9" fill="#6b7b8b">0</text>`);
      parts.push(`<text x="${legendX+legendW}" y="${legendY+24}" text-anchor="middle" font-size="9" fill="#6b7b8b">+${maxAbs.toFixed(1)}</text>`);
      parts.push('</svg>');
      box.innerHTML=parts.join('');
    }

    function renderParameterBubble(rows,labelA,labelB){
      const box=$('parameterBubblePlot');
      const badge=$('parameterScoreBadge');
      const subtitle=$('parameterPlotSubtitle');
      if(STATE.parameterViewMode!=='yes'){
        badge.textContent='ρ = –';
        subtitle.textContent='Enable amino acid properties to visualize the selected parameter.';
        box.innerHTML='<div class="correlation-plot-empty">Amino-acid parameter visualization is currently disabled.</div>';
        return;
      }
      const props=getCurrentPropertyFile(),param=STATE.selectedParameter;
      subtitle.textContent=`${param} at the two selected residues across all sequences.`;
      const points=[];
      for(const row of rows){
        const x=Number(props[row.aaA]?.[param]),y=Number(props[row.aaB]?.[param]);
        if(Number.isFinite(x)&&Number.isFinite(y))points.push({...row,x,y});
      }
      if(points.length<2){badge.textContent='ρ = –';box.innerHTML='<div class="correlation-plot-empty">Not enough parameter values are available for these residues.</div>';return;}
      const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
      const pr=pearson(xs,ys),sr=spearman(xs,ys);
      badge.textContent=`ρ = ${Number.isFinite(sr)?sr.toFixed(2):'–'}`;
      const groups=new Map();
      for(const p of points){const key=`${p.x}\u0000${p.y}`;if(!groups.has(key))groups.set(key,{x:p.x,y:p.y,count:0,pairs:new Map()});const g=groups.get(key);g.count++;const pair=`${p.aaA}/${p.aaB}`;g.pairs.set(pair,(g.pairs.get(pair)||0)+1);}
      const vals=[...groups.values()];
      let minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
      if(minX===maxX){minX-=1;maxX+=1;}if(minY===maxY){minY-=1;maxY+=1;}
      const px=(maxX-minX)*.08,py=(maxY-minY)*.08;minX-=px;maxX+=px;minY-=py;maxY+=py;
      const width=620,height=360,left=62,top=28,right=24,bottom=56,plotW=width-left-right,plotH=height-top-bottom;
      const sx=x=>left+(x-minX)/(maxX-minX)*plotW,sy=y=>top+plotH-(y-minY)/(maxY-minY)*plotH;
      const maxCount=Math.max(...vals.map(g=>g.count),1);
      const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Amino acid parameter bubble plot" font-family="Arial,Helvetica,sans-serif">`];
      for(let k=0;k<=4;k++){
        const vx=minX+k*(maxX-minX)/4,vy=minY+k*(maxY-minY)/4;
        const gx=sx(vx),gy=sy(vy);
        parts.push(`<line x1="${gx}" y1="${top}" x2="${gx}" y2="${top+plotH}" stroke="#e5eaf0" stroke-width="1"/><text x="${gx}" y="${height-bottom+18}" text-anchor="middle" font-size="9" fill="#6b7b8b">${vx.toFixed(2).replace(/\.00$/,'')}</text>`);
        parts.push(`<line x1="${left}" y1="${gy}" x2="${left+plotW}" y2="${gy}" stroke="#e5eaf0" stroke-width="1"/><text x="${left-8}" y="${gy+3}" text-anchor="end" font-size="9" fill="#6b7b8b">${vy.toFixed(2).replace(/\.00$/,'')}</text>`);
      }
      vals.forEach(g=>{
        const r=5+16*Math.sqrt(g.count/maxCount);
        const pairText=[...g.pairs.entries()].map(([k,v])=>`${k} (${v})`).join(', ');
        parts.push(`<circle cx="${sx(g.x)}" cy="${sy(g.y)}" r="${r}" fill="${STATE.plotColors.bubbleFill}" fill-opacity=".58" stroke="${STATE.plotColors.bubbleStroke}" stroke-width="1.2"><title>${A2CA.escapeHtml(`${g.count} sequence${g.count===1?'':'s'}; ${pairText}; ${param}: ${g.x} / ${g.y}`)}</title></circle>`);
      });
      parts.push(`<text x="${left+plotW/2}" y="${height-9}" text-anchor="middle" font-size="11" fill="#526171">${A2CA.escapeHtml(labelA)} · ${A2CA.escapeHtml(param)}</text>`);
      parts.push(`<text x="15" y="${top+plotH/2}" text-anchor="middle" font-size="11" fill="#526171" transform="rotate(-90 15 ${top+plotH/2})">${A2CA.escapeHtml(labelB)} · ${A2CA.escapeHtml(param)}</text>`);
      parts.push(`<text x="${width-right}" y="16" text-anchor="end" font-size="10" fill="#526171">Pearson r = ${Number.isFinite(pr)?pr.toFixed(3):'n/a'} · Spearman ρ = ${Number.isFinite(sr)?sr.toFixed(3):'n/a'}</text>`);
      parts.push('</svg>');
      box.innerHTML=parts.join('');
    }

    function fitchStatesForPosition(pos){
      const leafNodes=A2CA.leaves(STATE.tree);
      const seqByLeaf=new Map();
      for(const leaf of leafNodes){
        const seqName=A2CA.matchTreeName(leaf.name,Object.keys(STATE.alignment));
        if(seqName)seqByLeaf.set(leaf,seqName);
      }
      const stateSets=new Map();
      function post(node){
        if(!node.children.length){
          const name=seqByLeaf.get(node),aa=name?String(STATE.alignment[name][pos-1]||'').toUpperCase():'';
          const set=VALID_AA.has(aa)?new Set([aa]):new Set();stateSets.set(node,set);return set;
        }
        const childSets=node.children.map(post).filter(s=>s.size);
        if(!childSets.length){const empty=new Set();stateSets.set(node,empty);return empty;}
        let current=new Set(childSets[0]);
        for(const set of childSets.slice(1)){
          const inter=new Set([...current].filter(x=>set.has(x)));
          current=inter.size?inter:new Set([...current,...set]);
        }
        stateSets.set(node,current);return current;
      }
      post(STATE.tree);
      const assigned=new Map();
      const refAA=String(STATE.alignment[STATE.selectedSequence]?.[pos-1]||'').toUpperCase();
      const choose=(set,preferred)=>set.has(preferred)?preferred:([...[...set].sort()][0]||null);
      assigned.set(STATE.tree,choose(stateSets.get(STATE.tree)||new Set(),refAA));
      function pre(node){
        const parentState=assigned.get(node);
        for(const child of node.children){
          const set=stateSets.get(child)||new Set();
          assigned.set(child,choose(set,parentState)||choose(set,refAA));
          pre(child);
        }
      }
      pre(STATE.tree);
      return assigned;
    }

    function renderCorrelationChangeTree(posA,posB,labelA,labelB){
      const box=$('correlationChangeTree');
      const leafNodes=A2CA.assignTreeCoordinates(STATE.tree),all=A2CA.walkTree(STATE.tree),n=leafNodes.length;
      if(!n){box.innerHTML='<div class="correlation-plot-empty">Tree data are unavailable.</div>';return;}
      const statesA=fitchStatesForPosition(posA),statesB=fitchStatesForPosition(posB);
      // Keep symmetric horizontal margins. The node connector is drawn for every
      // internal node (including the root), so basal branches are connected rather
      // than looking clipped at the left edge.
      const width=620,height=Math.max(300,Math.min(520,120+n*10)),left=66,right=66,top=24,bottom=28;
      const maxX=Math.max(...all.map(x=>x.x),1),sx=(width-left-right)/maxX,sy=(height-top-bottom)/Math.max(n-1,1);
      const labelFont=sy>=13?9:sy>=8?7:6;
      const colors={none:STATE.plotColors.treeNeutral,a:STATE.plotColors.treeResidueA,b:STATE.plotColors.treeResidueB,both:STATE.plotColors.treeBoth};
      const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Phylogenetic tree showing residue changes" font-family="Arial,Helvetica,sans-serif">`];
      function rec(node){
        if(node.children.length){
          const x=left+node.x*sx;
          const ys=node.children.map(c=>top+c.y*sy);
          parts.push(`<line x1="${x}" y1="${Math.min(...ys)}" x2="${x}" y2="${Math.max(...ys)}" stroke="${STATE.plotColors.treeNeutral}" stroke-width="1"/>`);
        }
        for(const child of node.children){
          const ca=statesA.get(node)&&statesA.get(child)&&statesA.get(node)!==statesA.get(child);
          const cb=statesB.get(node)&&statesB.get(child)&&statesB.get(node)!==statesB.get(child);
          const kind=ca&&cb?'both':ca?'a':cb?'b':'none';
          const y=top+child.y*sy,x1=left+node.x*sx,x2=left+child.x*sx;
          parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${colors[kind]}" stroke-width="${kind==='none'?1.1:2.6}"><title>${A2CA.escapeHtml(kind==='both'?`${labelA} and ${labelB} changed`:kind==='a'?`${labelA} changed`:kind==='b'?`${labelB} changed`:'No inferred change')}</title></line>`);
          rec(child);
        }
      }
      // A short root stem makes the left boundary explicit without touching the viewport.
      const rootY=top+STATE.tree.y*sy;
      parts.push(`<line x1="${left-22}" y1="${rootY}" x2="${left}" y2="${rootY}" stroke="${STATE.plotColors.treeNeutral}" stroke-width="1.2"/>`);
      rec(STATE.tree);
      parts.push('</svg>');box.innerHTML=parts.join('');
    }

    function syncCorrelationLegendColors(){
      const map={'.legend-line.neutral':'treeNeutral','.legend-line.residue-a':'treeResidueA','.legend-line.residue-b':'treeResidueB','.legend-line.both':'treeBoth'};
      Object.entries(map).forEach(([selector,key])=>{const el=document.querySelector(selector);if(el)el.style.background=STATE.plotColors[key];});
    }

    function renderCrossCorrelations(){
      syncCorrelationLegendColors();
      const residues=selectedResidueDescriptors();
      const status=$('correlationStatus');
      if(residues.length<2){
        status.className='status small correlation-status';
        status.textContent='Select at least two residues in Analysis Control to calculate coevolution.';
        $('similarityScoreBadge').textContent='r = –';$('phyloScoreBadge').textContent='r = –';$('parameterScoreBadge').textContent='ρ = –';
        ['similarityHeatmap','phyloHeatmap','parameterBubblePlot','correlationChangeTree'].forEach(id=>$(id).innerHTML='<div class="correlation-plot-empty">Select two residues to populate this plot.</div>');
        return;
      }
      const data=correlationResidueData();
      if(!data){status.className='status bad small correlation-status';status.textContent='Choose two different selected residues.';return;}
      const descA=residues.find(r=>r.alignmentPosition===data.posA),descB=residues.find(r=>r.alignmentPosition===data.posB);
      const labelA=descA?.label||`Position ${data.posA}`,labelB=descB?.label||`Position ${data.posB}`;
      const treeMetrics=correlationTreeMetricsCache||(correlationTreeMetricsCache=buildTreeMetrics());
      const scores=similarityCorrelation(data.rows,treeMetrics);
      status.className='status good small correlation-status';
      status.textContent=`${data.rows.length} ungapped sequences used · ${scores.pairs.toLocaleString()} sequence pairs for similarity correlation${scores.sampled?` (score sampled from ${scores.sampledSequences} sequences for browser safety)`:''} · ${scores.adjustedPairs.toLocaleString()} pairs with tree distances.`;
      $('similarityScoreBadge').textContent=`r = ${Number.isFinite(scores.raw)?scores.raw.toFixed(2):'–'}`;
      $('phyloScoreBadge').textContent=`r = ${Number.isFinite(scores.adjusted)?scores.adjusted.toFixed(2):'–'}`;
      renderPairHeatmap('similarityHeatmap',data.rows,null,scores.raw,labelA,labelB);
      renderPairHeatmap('phyloHeatmap',data.rows,treeMetrics.weights,scores.adjusted,labelA,labelB);
      renderParameterBubble(data.rows,labelA,labelB);
      renderCorrelationChangeTree(data.posA,data.posB,labelA,labelB);
    }


    function parseObservedPdbResidues(text){
      return A2CA.parseStructureObservedResidues(text,session.structureFormat||session.structureFileName||'');
    }

    function mapReferenceToObserved(referenceSequence,observedResidues){
      const ref=String(referenceSequence||'').replace(/[-.]/g,'').toUpperCase();
      const obs=(observedResidues||[]).map(r=>r.aa).join('').toUpperCase();
      const mapping=new Map();
      if(!ref||!obs)return mapping;
      if(ref===obs){observedResidues.forEach((r,i)=>mapping.set(i+1,r));return mapping;}
      let offset=ref.indexOf(obs);
      if(offset>=0){observedResidues.forEach((r,i)=>mapping.set(offset+i+1,r));return mapping;}
      offset=obs.indexOf(ref);
      if(offset>=0){for(let i=0;i<ref.length;i++)mapping.set(i+1,observedResidues[offset+i]);return mapping;}

      // Needleman-Wunsch mapping with linear-memory scores and a compact traceback.
      const n=ref.length,m=obs.length,gap=-2,match=2,mismatch=-1;
      const cells=(n+1)*(m+1),MAX_NW_CELLS=5_000_000;
      if(cells>MAX_NW_CELLS){console.warn(`A2CA: structure/reference alignment skipped because ${cells.toLocaleString()} Needleman–Wunsch cells exceed the ${MAX_NW_CELLS.toLocaleString()} safety limit.`);return mapping;}
      const trace=new Uint8Array(cells); // 0 diag, 1 up, 2 left
      let prev=new Int32Array(m+1),curr=new Int32Array(m+1);
      for(let j=1;j<=m;j++){prev[j]=prev[j-1]+gap;trace[j]=2;}
      for(let i=1;i<=n;i++){
        curr[0]=prev[0]+gap;trace[i*(m+1)]=1;
        for(let j=1;j<=m;j++){
          const diag=prev[j-1]+(ref[i-1]===obs[j-1]?match:mismatch);
          const up=prev[j]+gap,left=curr[j-1]+gap;
          let best=diag,dir=0;
          if(up>best){best=up;dir=1;}
          if(left>best){best=left;dir=2;}
          curr[j]=best;trace[i*(m+1)+j]=dir;
        }
        const swap=prev;prev=curr;curr=swap;
      }
      let i=n,j=m;
      while(i>0||j>0){
        const dir=trace[i*(m+1)+j];
        if(i>0&&j>0&&dir===0){mapping.set(i,observedResidues[j-1]);i--;j--;}
        else if(i>0&&(j===0||dir===1)){i--;}
        else if(j>0){j--;}
        else break;
      }
      return mapping;
    }

    function allStructureChainIds(){
      const ids=new Set(Object.keys(session.structureChains||{}));
      try{
        const observed=A2CA.parseStructureObservedResidues(session.structureText,session.structureFormat||session.structureFileName||'');
        Object.keys(observed||{}).forEach(chain=>ids.add(chain));
      }catch(e){}
      return [...ids].sort((a,b)=>String(a).localeCompare(String(b)));
    }

    function structureReferenceChain(){
      const chains=Object.keys(session.structureChains||{});
      return chains.includes(session.selectedStructureChain)?session.selectedStructureChain:(chains[0]||'');
    }

    function structureReferenceMatches(){
      const chain=structureReferenceChain();
      if(!chain||!session.structureChains?.[chain]||!STATE.alignment[STATE.selectedSequence])return false;
      return A2CA.matchPdbToAlignment({[chain]:session.structureChains[chain]},{[STATE.selectedSequence]:STATE.alignment[STATE.selectedSequence]}).length>0;
    }

    function buildReferenceStructureMap(){
      referenceToStructureMap=new Map();
      structureToReferenceMap=new Map();
      structureToReferenceResidueMap=new Map();
      if(!session.structureText||!STATE.alignment[STATE.selectedSequence])return;
      observedStructureResidues=observedStructureResidues||parseObservedPdbResidues(session.structureText);
      const chain=structureReferenceChain();
      if(!chain)return;
      referenceToStructureMap=mapReferenceToObserved(STATE.alignment[STATE.selectedSequence],observedStructureResidues[chain]||[]);
      for(const [refPos,pdbResidue] of referenceToStructureMap.entries()){
        const mappedItem={chain,...pdbResidue};
        structureToReferenceMap.set(structureResidueKey(mappedItem),refPos);
        // 3Dmol and raw PDB parsing do not always expose insertion codes in
        // exactly the same form. Keep a conservative chain + residue-number
        // fallback so valid structure picks remain transferable.
        const residueOnlyKey=`${chain||'_'}|${String(pdbResidue.resi)}`;
        if(!structureToReferenceResidueMap.has(residueOnlyKey))
          structureToReferenceResidueMap.set(residueOnlyKey,refPos);
      }
    }

    function structureResidueKey(item){
      return `${item.chain||'_'}|${String(item.resi)}|${item.icode||''}`;
    }

    function viewerChain(chain){return chain==='_'?'':chain;}

    function structureResidueFromAtom(atom){
      const resn=String(atom?.resn||'').toUpperCase();
      const aa=AA3_TO_1[resn];
      if(!aa)return null;
      const chain=String(atom.chain||'_')||'_';
      return {chain,resi:atom.resi,icode:String(atom.icode||''),resn,aa,label:`${aa}${atom.resi}${atom.icode||''}`};
    }

    function referencePositionForStructureResidue(item){
      const refChain=structureReferenceChain();
      if(!item||item.chain!==refChain)return null;
      if(!structureToReferenceMap.size)buildReferenceStructureMap();
      const exact=structureToReferenceMap.get(structureResidueKey(item));
      if(exact)return exact;
      const residueOnlyKey=`${item.chain||'_'}|${String(item.resi)}`;
      return structureToReferenceResidueMap.get(residueOnlyKey)||null;
    }

    function alignmentPositionForReferencePosition(referencePosition){
      const row=targetSequenceToTable().find(r=>r.sequencePosition===referencePosition);
      return row?row.NR:null;
    }

    function mappedStructureSelectionPositions(){
      const positions=[];
      for(const item of structurePickedResidues){
        const refPos=referencePositionForStructureResidue(item);
        const alnPos=refPos?alignmentPositionForReferencePosition(refPos):null;
        if(alnPos)positions.push(alnPos);
      }
      return [...new Set(positions)].sort((a,b)=>a-b);
    }

    function renderStructurePickedList(){
      const box=$('structureSelectedList');
      if(!box)return;
      const refChain=structureReferenceChain();
      structurePickedResidues=structurePickedResidues.filter(item=>item.chain===refChain);
      if(!structurePickedResidues.length){
        box.innerHTML=`<span class="muted small">Click a protein residue in reference chain ${A2CA.escapeHtml(refChain||'')} to select it.</span>`;
      }else{
        box.innerHTML=structurePickedResidues.map(item=>`<button type="button" class="selected-residue-chip structure-picked-chip" data-structure-key="${A2CA.escapeHtml(structureResidueKey(item))}" title="Click to remove">${A2CA.escapeHtml(item.label||`${item.aa||''}${item.resi}`)}<small>chain ${A2CA.escapeHtml(item.chain)}</small></button>`).join('');
      }
      const mapped=mappedStructureSelectionPositions().length;
      const hasSelection=structurePickedResidues.length>0;
      // Keep the transfer actions available whenever the user has selected
      // residues. Mapping is validated on transfer so a representation
      // mismatch cannot leave the UI permanently disabled.
      $('addStructureResiduesBtn').disabled=!hasSelection;
      $('replaceStructureResiduesBtn').disabled=!hasSelection;
      $('selectSphereBtn').disabled=!hasSelection;
      if(hasSelection&&mapped<structurePickedResidues.length){
        const unmapped=structurePickedResidues.length-mapped;
        $('structureMappingInfo').dataset.transferNote=`${mapped} mapped; ${unmapped} currently unmapped.`;
      }else{
        delete $('structureMappingInfo').dataset.transferNote;
      }
    }

    function toggleStructureResidue(item){
      if(!item||item.chain!==structureReferenceChain())return;
      const key=structureResidueKey(item);
      const index=structurePickedResidues.findIndex(x=>structureResidueKey(x)===key);
      if(index>=0)structurePickedResidues.splice(index,1);
      else structurePickedResidues.push(item);
      renderStructurePickedList();
      applyStructureStyles();
      persist();
    }

    function transferStructureSelection(mode){
      const mapped=mappedStructureSelectionPositions();
      if(!mapped.length){
        $('structureMappingInfo').textContent='The selected structure residues could not be mapped to the reference sequence. Check that the correct reference chain is selected on the Reference page.';
        return;
      }
      STATE.selectedPositions=mode==='replace'?mapped:[...new Set([...STATE.selectedPositions,...mapped])].sort((a,b)=>a-b);
      STATE.audit=`${mapped.length} residue${mapped.length===1?'':'s'} transferred from the structure selection (${mode}).`;
      renderAll();
    }

    function selectSphereAroundPicked(){
      if(!structureViewer||!structurePickedResidues.length)return;
      const radius=Number($('structureSphereRadius').value);
      if(!Number.isFinite(radius)||radius<=0){
        $('structureMappingInfo').textContent='Enter a valid sphere radius greater than 0 Å.';
        return;
      }
      const allAtoms=structureViewer.getAtomsFromSel({});
      const seedKeys=new Set(structurePickedResidues.map(structureResidueKey));
      const seedAtoms=allAtoms.filter(atom=>{
        const item=structureResidueFromAtom(atom);
        return item&&seedKeys.has(structureResidueKey(item));
      });
      if(!seedAtoms.length)return;
      const refChain=structureReferenceChain();
      const threshold=radius*radius;
      const picked=new Map(structurePickedResidues.map(item=>[structureResidueKey(item),item]));
      for(const atom of allAtoms){
        const item=structureResidueFromAtom(atom);
        if(!item||item.chain!==refChain)continue;
        let inside=false;
        for(const seed of seedAtoms){
          const dx=atom.x-seed.x,dy=atom.y-seed.y,dz=atom.z-seed.z;
          if(dx*dx+dy*dy+dz*dz<=threshold){inside=true;break;}
        }
        if(inside)picked.set(structureResidueKey(item),item);
      }
      structurePickedResidues=[...picked.values()].sort((a,b)=>String(a.chain).localeCompare(String(b.chain))||(Number(a.resi)||0)-(Number(b.resi)||0));
      renderStructurePickedList();
      applyStructureStyles();
      persist();
      $('structureMappingInfo').textContent=`Selected ${structurePickedResidues.length} protein residues within ${radius} Å of the seed selection.`;
    }

    function enabledChainsFromUi(){
      return [...document.querySelectorAll('#structureChainToggles input[type="checkbox"]:checked')].map(el=>el.value);
    }

    function renderStructureChainToggles(){
      const chains=allStructureChainIds();
      const refChain=structureReferenceChain();
      if(!visibleStructureChains.size&&chains.length){visibleStructureChains.add(refChain||chains[0]);}
      $('structureChainToggles').innerHTML=chains.map(chain=>{
        const checked=visibleStructureChains.has(chain)?'checked':'';
        const length=session.structureChains?.[chain]?.length||0;
        const detail=length?`${length} aa`:'non-protein';
        return `<label class="structure-chain-toggle"><input type="checkbox" value="${A2CA.escapeHtml(chain)}" ${checked}><span>Chain ${A2CA.escapeHtml(chain)} <span class="muted">(${detail})</span></span></label>`;
      }).join('');
    }

    function applyStructureStyles({zoom=false}={}){
      if(!structureViewerInitialized||!structureViewer)return;
      const chains=enabledChainsFromUi();
      visibleStructureChains=new Set(chains);
      structureViewer.setStyle({},{});
      const grey='#c5ccd3';
      const ligandGreen='#2f9e44';
      const pickedBlue='#7dd3fc';
      const analysisBlue='#2463a6';
      const waterNames=new Set(['HOH','WAT','DOD']);

      for(const chain of chains){
        const vChain=viewerChain(chain);
        const proteinSel={chain:vChain,predicate:atom=>!!AA3_TO_1[String(atom.resn||'').toUpperCase()]};
        const ligandSel={chain:vChain,predicate:atom=>Boolean(atom.hetflag)&&!AA3_TO_1[String(atom.resn||'').toUpperCase()]&&!waterNames.has(String(atom.resn||'').toUpperCase())};
        const base=structureStyleMode==='stick'?{stick:{color:grey,radius:0.18}}:{cartoon:{color:grey}};
        structureViewer.setStyle(proteinSel,base);
        structureViewer.setStyle(ligandSel,{stick:{color:ligandGreen,radius:0.22}});
      }

      buildReferenceStructureMap();
      const refChain=structureReferenceChain();
      let mapped=0;

      // Structure-picked residues are light blue. Apply these first so the
      // darker Analysis Control selection can override them when selections overlap.
      for(const item of structurePickedResidues){
        if(item.chain!==refChain||!chains.includes(item.chain))continue;
        const sel={chain:viewerChain(item.chain),resi:item.resi};
        if(item.icode)sel.icode=item.icode;
        structureViewer.addStyle(sel,{stick:{color:pickedBlue,radius:0.34}});
      }

      if(chains.includes(refChain)&&referenceToStructureMap.size){
        for(const item of selectedResidueDescriptors()){
          const pdbResidue=referenceToStructureMap.get(item.referencePosition);
          if(!pdbResidue)continue;
          const sel={chain:viewerChain(refChain),resi:pdbResidue.resi};
          if(pdbResidue.icode)sel.icode=pdbResidue.icode;
          structureViewer.addStyle(sel,{stick:{color:analysisBlue,radius:0.36}});
          mapped++;
        }
      }

      structureViewer.setClickable({},false,()=>{});
      if(chains.includes(refChain)){
        const clickableSel={chain:viewerChain(refChain),predicate:atom=>!!AA3_TO_1[String(atom.resn||'').toUpperCase()]};
        structureViewer.setClickable(clickableSel,true,(atom)=>{
          const item=structureResidueFromAtom(atom);
          if(item&&item.chain===refChain)toggleStructureResidue(item);
        });
      }
      renderStructurePickedList();
      structureViewer.render();
      if(zoom){
        if(chains.length===1)structureViewer.zoomTo({chain:viewerChain(chains[0])});
        else structureViewer.zoomTo();
        structureViewer.render();
      }

      if(!referenceToStructureMap.size){
        $('structureMappingInfo').textContent='The current reference sequence could not be mapped onto the selected structure reference chain. Return to Reference selection to remap the structure.';
      }else if(!STATE.selectedPositions.length){
        $('structureMappingInfo').textContent=`Reference chain: ${refChain}. Residue picking is restricted to this chain. Click residues to build a structure selection, or select residues in the Analysis Control.`;
      }else{
        $('structureMappingInfo').textContent=`${mapped} of ${STATE.selectedPositions.length} analysis residue${STATE.selectedPositions.length===1?'':'s'} mapped to chain ${refChain}.`;
      }
    }

    function ensureStructureViewer(){
      if(!session.structureText)return;
      if(structureViewerInitialized){
        try{structureViewer.resize();structureViewer.render();}catch(e){}
        applyStructureStyles();
        return;
      }
      if(!window.$3Dmol){
        $('structureViewerStatus').className='status bad small';
        $('structureViewerStatus').textContent='The 3D viewer library could not be loaded. Check the internet connection and reopen this section.';
        return;
      }
      try{
        observedStructureResidues=parseObservedPdbResidues(session.structureText);
        if(!session.structureChains)session.structureChains=A2CA.parseStructureSequences(session.structureText,session.structureFormat||session.structureFileName||'');
        const chains=allStructureChainIds();
        const refChain=structureReferenceChain();
        visibleStructureChains=new Set(refChain?[refChain]:(chains[0]?[chains[0]]:[]));
        renderStructureChainToggles();
        structureViewer=window.$3Dmol.createViewer($('structureViewer'),{backgroundColor:'white'});
        structureModel=structureViewer.addModel(session.structureText,session.structureFormat==='cif'?'cif':'pdb');
        structureViewerInitialized=true;
        $('structureViewerStatus').className='status good small';
        $('structureViewerStatus').textContent=`Loaded ${session.structureFileName||'structure.pdb'}. Drag to rotate; use the mouse wheel or trackpad to zoom.`;
        applyStructureStyles({zoom:true});
      }catch(e){
        $('structureViewerStatus').className='status bad small';
        $('structureViewerStatus').textContent='Structure viewer error: '+e.message;
      }
    }

    function syncStructureModule(){
      const hasStructure=!!session.structureText;
      $('noStructurePanel').hidden=hasStructure;
      $('structureViewerPanel').hidden=!hasStructure;
      if(!hasStructure)return;
      if(!session.structureChains){
        try{session.structureChains=A2CA.parseStructureSequences(session.structureText,session.structureFormat||session.structureFileName||'');}catch(e){}
      }
      const refChain=structureReferenceChain();
      structurePickedResidues=structurePickedResidues.filter(item=>item.chain===refChain);
      if(structureViewerInitialized){
        renderStructureChainToggles();
        applyStructureStyles();
      }else if($('structureModule').open){
        ensureStructureViewer();
      }
    }

    function updateMainPlot(){
      const box=$('treePlot');
      if(!STATE.tree){
        box.innerHTML='<div class="warn">Load a Newick tree file.</div>';
        return;
      }

      const leafNodes=A2CA.assignTreeCoordinates(STATE.tree);
      const all=A2CA.walkTree(STATE.tree);
      const n=leafNodes.length;
      const sel=getSelectionMatrix();
      const parameterVisible=STATE.parameterViewMode==='yes'&&sel.length>0;

      /*
       * A fixed internal canvas keeps exports reproducible. Each leaf label is
       * placed directly after its own terminal branch rather than at a shared
       * global x-position. The residue and parameter tracks begin only after
       * the right-most rendered label.
       */
      const width=1560;
      const top=64,left=58,right=26;
      const residueCount=STATE.selectedPositions.length;
      const bottom=residueCount?112:78;
      const rowStep=n<=12?38:n<=24?32:n<=45?26:n<=75?21:n<=120?17:13;
      const leafFont=n<=12?16:n<=24?14:n<=45?13:n<=75?11.5:n<=120?10:8.5;
      const trackTitleFont=n<=75?13:11;
      const height=Math.max(540,(Math.max(n-1,1)*rowStep)+top+bottom);
      const gap=12;
      const parameterWidth=parameterVisible?260:0;
      const desiredResidueWidth=residueCount?Math.min(420,Math.max(120,residueCount*28)):0;
      const labelCharWidth=leafFont*0.58;
      const maxLabelEstimate=Math.max(...leafNodes.map(l=>Math.min(360,Math.max(60,String(l.name||'').length*labelCharWidth+8))),75);
      const minTreeWidth=360;

      let residueWidth=desiredResidueWidth;
      const fixedTrackWidth=()=>
        (residueWidth?gap+residueWidth:0)+
        (parameterVisible?gap+parameterWidth:0);
      let treeWidth=width-left-right-maxLabelEstimate-fixedTrackWidth()-gap;

      if(treeWidth<minTreeWidth&&residueWidth){
        const reducible=Math.max(0,residueWidth-50);
        const reduction=Math.min(reducible,minTreeWidth-treeWidth);
        residueWidth-=Math.max(0,reduction);
        treeWidth=width-left-right-maxLabelEstimate-fixedTrackWidth()-gap;
      }
      treeWidth=Math.max(300,treeWidth);

      const maxX=Math.max(...all.map(x=>x.x),1);
      const sx=treeWidth/maxX;
      const sy=(height-top-bottom)/Math.max(n-1,1);
      const margin={left,top};
      const yMap=nameToYFromLeaves(leafNodes);
      const labelGap=Math.max(3,leafFont*0.28);
      const labelRight=Math.max(...leafNodes.map(l=>{
        const labelX=left+l.x*sx+labelGap;
        const labelW=Math.min(360,Math.max(30,String(l.name||'').length*labelCharWidth));
        return labelX+labelW;
      }),left+treeWidth);
      const heatX=labelRight+gap;
      const parameterX=heatX+(residueWidth?residueWidth+gap:0);

      let parts=[
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="Phylogenetic tree with selected residue and parameter tracks" font-family="Arial, Helvetica, sans-serif" style="font-family:Arial,Helvetica,sans-serif">`
      ];

      /* Draw the root connector and a short root stem so the left side reads
         as a complete rooted tree instead of looking clipped at the canvas. */
      if(STATE.tree.children&&STATE.tree.children.length){
        const ys=STATE.tree.children.map(c=>top+c.y*sy);
        if(ys.length>1){
          parts.push(`<line x1="${left}" y1="${Math.min(...ys)}" x2="${left}" y2="${Math.max(...ys)}" stroke="black" stroke-width="0.8"/>`);
        }
        const rootY=top+STATE.tree.y*sy;
        parts.push(`<line x1="${left-18}" y1="${rootY}" x2="${left}" y2="${rootY}" stroke="black" stroke-width="0.8"/>`);
      }

      A2CA.drawEdges(STATE.tree,parts,sx,sy,margin);

      const referenceLeaf=matchTreeLeaf(STATE.selectedSequence,leafNodes);
      leafNodes.forEach(l=>{
        const x=left+l.x*sx+labelGap;
        const y=top+l.y*sy+leafFont*0.34;
        const isReference=l===referenceLeaf;
        if(isReference){
          const labelW=Math.min(360,Math.max(34,String(l.name||'').length*labelCharWidth+8));
          parts.push(`<rect x="${x-3}" y="${y-leafFont*.88}" width="${labelW}" height="${leafFont*1.18}" rx="3" fill="${STATE.plotColors.heatmapNegative}"/>`);
        }
        parts.push(`<text x="${x}" y="${y}" font-size="${leafFont}" fill="${isReference?'#ffffff':'#1f2933'}" font-weight="${isReference?'700':'400'}">${A2CA.escapeHtml(l.name)}</text>`);
      });

      if(sel.length&&residueWidth>0){
        const cellW=residueWidth/Math.max(residueCount,1);
        const cellH=Math.min(22,Math.max(10,sy*0.72));
        parts.push(`<text x="${heatX}" y="28" font-size="${trackTitleFont}" font-weight="600">Selected residues</text>`);
        for(const row of sel){
          const y=resolveY(row.name,yMap);
          if(y===undefined)continue;
          const isReferenceRow=row.name===STATE.selectedSequence;
          row.residues.forEach((aa,j)=>{
            const col=STATE.colors[String(aa).toUpperCase()]||STATE.colors['?'];
            const x=heatX+j*cellW;
            const yy=top+y*sy-cellH/2;
            const rectW=Math.max(1,cellW-1);
            parts.push(`<rect x="${x}" y="${yy}" width="${rectW}" height="${cellH}" fill="${col}" stroke="${isReferenceRow?STATE.plotColors.heatmapNegative:'white'}" stroke-width="${isReferenceRow?'2.2':'0.5'}"/>`);
            if(cellW>=13){
              const fontSize=cellW>=26?Math.min(12,leafFont):Math.min(9,leafFont);
              parts.push(`<text x="${x+rectW/2}" y="${top+y*sy+fontSize*0.38}" text-anchor="middle" font-size="${fontSize}">${A2CA.escapeHtml(aa)}</text>`);
            }
          });
        }
        const abundances=selectedResidueAbundances();
        const abundanceY=height-bottom+30;
        abundances.forEach((pct,j)=>{
          const x=heatX+j*cellW+cellW/2;
          const abundanceFont=Math.max(6,Math.min(9.5,cellW*0.55));
          if(cellW<18){
            parts.push(`<text x="${x}" y="${abundanceY+5}" text-anchor="end" font-size="${abundanceFont}" fill="#526171" transform="rotate(-60 ${x} ${abundanceY+5})">${pct.toFixed(0)}%</text>`);
          }else{
            parts.push(`<text x="${x}" y="${abundanceY}" text-anchor="middle" font-size="${abundanceFont}" fill="#526171">${pct.toFixed(0)}%</text>`);
          }
        });
      }

      if(parameterVisible){
        const vals=rowValues();
        const nums=Object.values(vals).filter(Number.isFinite);
        const minVal=Math.min(0,...nums);
        const maxVal=Math.max(0,...nums);
        const span=Math.max(maxVal-minVal,1e-9);
        const trackLeft=parameterX;
        const trackRight=parameterX+parameterWidth;
        const zeroX=trackLeft+((0-minVal)/span)*parameterWidth;

        parts.push(`<text x="${trackLeft}" y="28" font-size="${trackTitleFont}" font-weight="600">${A2CA.escapeHtml(STATE.selectedParameter)}</text>`);
        parts.push(`<line x1="${zeroX}" y1="${top-12}" x2="${zeroX}" y2="${height-bottom+6}" stroke="#8b96a3" stroke-width="1"/>`);
        parts.push(`<line x1="${trackLeft}" y1="${top-12}" x2="${trackRight}" y2="${top-12}" stroke="#d8dee6" stroke-width="1"/>`);

        Object.keys(vals).forEach(name=>{
          const y=resolveY(name,yMap),v=vals[name];
          if(y===undefined||!Number.isFinite(v))return;
          const endX=trackLeft+((v-minVal)/span)*parameterWidth;
          parts.push(`<line x1="${zeroX}" y1="${top+y*sy}" x2="${endX}" y2="${top+y*sy}" stroke="#667788" stroke-width="4" stroke-linecap="round"/>`);
        });

        if(nums.length){
          const fmt=v=>Math.abs(v)>=100?Number(v).toFixed(0):Number(v).toFixed(2).replace(/\.00$/,'');
          parts.push(`<text x="${trackLeft}" y="${height-8}" font-size="9" fill="#64748b" text-anchor="start">${A2CA.escapeHtml(fmt(minVal))}</text>`);
          parts.push(`<text x="${zeroX}" y="${height-8}" font-size="9" fill="#64748b" text-anchor="middle">0</text>`);
          parts.push(`<text x="${trackRight}" y="${height-8}" font-size="9" fill="#64748b" text-anchor="end">${A2CA.escapeHtml(fmt(maxVal))}</text>`);
        }
      }

      // Phylogenetic scale bar. If branch lengths are present, the label uses
      // the same arbitrary/Newick branch-length units; otherwise one topology
      // step is shown explicitly as a branch step.
      const hasBranchLengths=all.some(node=>Number(node.length)>0);
      const niceScale=value=>{
        if(!(value>0))return 1;
        const power=Math.pow(10,Math.floor(Math.log10(value)));
        const fraction=value/power;
        const nice=fraction<1.5?1:fraction<3.5?2:fraction<7.5?5:10;
        return nice*power;
      };
      let scaleValue=hasBranchLengths?niceScale(maxX*0.16):1;
      if(scaleValue>maxX&&hasBranchLengths)scaleValue=niceScale(maxX*0.08);
      const scalePixels=Math.max(24,scaleValue*sx);
      const scaleX=left;
      const scaleY=height-31;
      parts.push(`<line x1="${scaleX}" y1="${scaleY}" x2="${scaleX+scalePixels}" y2="${scaleY}" stroke="#1f2933" stroke-width="1.4"/>`);
      parts.push(`<line x1="${scaleX}" y1="${scaleY-4}" x2="${scaleX}" y2="${scaleY+4}" stroke="#1f2933" stroke-width="1.4"/>`);
      parts.push(`<line x1="${scaleX+scalePixels}" y1="${scaleY-4}" x2="${scaleX+scalePixels}" y2="${scaleY+4}" stroke="#1f2933" stroke-width="1.4"/>`);
      const scaleLabel=hasBranchLengths?Number(scaleValue.toPrecision(3)).toString():`${scaleValue} branch step`;
      parts.push(`<text x="${scaleX+scalePixels/2}" y="${scaleY+18}" text-anchor="middle" font-size="10" fill="#526171">${A2CA.escapeHtml(scaleLabel)}</text>`);

      parts.push('</svg>');
      box.innerHTML=parts.join('');
    }

    function residueMatchesSearch(row,query){
      const q=String(query||'').trim().toUpperCase();
      if(!q)return true;
      if(/^\d+$/.test(q)){
        const nr=Number(q);
        return row.sequencePosition===nr||row.NR===nr;
      }
      const residue=String(row.residue||'').toUpperCase();
      const aaLabel=String(row.AA||'').toUpperCase();
      const names=AA_SEARCH_NAMES[residue]||'';
      return residue===q||aaLabel.includes(q)||names.includes(q);
    }

    function renderResiduePicker(){
      const target=targetSequenceToTable();
      const byPos=new Map(target.map(r=>[r.NR,r]));
      STATE.selectedPositions=STATE.selectedPositions.filter(pos=>byPos.has(pos));
      const selectedSet=new Set(STATE.selectedPositions);
      const query=$('residueSearch')?.value||'';
      const visible=target.filter(r=>residueMatchesSearch(r,query));

      if(!visible.length){
        $('fullResidueList').innerHTML='<div class="residue-empty">No residues match the current search.</div>';
      }else{
        $('fullResidueList').innerHTML=visible.map(r=>{
          const selected=selectedSet.has(r.NR);
          return `<button type="button" class="residue-chip${selected?' is-selected':''}" data-pos="${r.NR}" ${selected?'disabled':''} title="${A2CA.escapeHtml(`Alignment position ${r.NR}; reference residue ${r.AA}`)}"><span class="residue-letter">${A2CA.escapeHtml(r.residue)}</span><span class="residue-number">${r.sequencePosition}</span></button>`;
        }).join('');
      }

      if(!STATE.selectedPositions.length){
        $('selectedResidueList').innerHTML='<div class="residue-empty">Click residues in the full sequence to add them here.</div>';
      }else{
        $('selectedResidueList').innerHTML=STATE.selectedPositions.map(pos=>{
          const r=byPos.get(pos);
          if(!r)return '';
          return `<button type="button" class="residue-chip selected-residue-chip" data-pos="${r.NR}" title="Remove ${A2CA.escapeHtml(r.AA)}"><span class="residue-letter">${A2CA.escapeHtml(r.residue)}</span><span class="residue-number">${r.sequencePosition}</span></button>`;
        }).join('');
      }
      $('resetResiduesBtn').disabled=STATE.selectedPositions.length===0;
      $('clearResidueSearchBtn').disabled=!String(query).trim();
    }

    function syncParameterVisibility(){
      $('parameterOptions').hidden=STATE.parameterViewMode!=='yes';
    }

    function syncControls(){
      const names=Object.keys(STATE.alignment);
      $('SequenceOptions').innerHTML=names.map(n=>`<option value="${A2CA.escapeHtml(n)}"></option>`).join('');
      $('SelectedSequence').value=STATE.selectedSequence;
      renderResiduePicker();

      const params=propertyNames();
      if(!params.includes(STATE.selectedParameter))STATE.selectedParameter=params[0]||'';
      $('SelectedParameter').innerHTML=params.map(p=>`<option value="${A2CA.escapeHtml(p)}" ${p===STATE.selectedParameter?'selected':''}>${A2CA.escapeHtml(p)}</option>`).join('');
      $('ParameterViewToggle').checked=STATE.parameterViewMode==='yes';
      $('CustomParameterToggle').checked=STATE.customParameterMode==='custom';
      $('ParameterCalcToggle').checked=STATE.calcMode==='sum';
      $('ParameterAbsoluteToggle').checked=STATE.absoluteMode==='relative to reference';
      syncParameterVisibility();
    }

    function captureParameterControls(){
      STATE.parameterViewMode=$('ParameterViewToggle').checked?'yes':'no';
      STATE.customParameterMode=$('CustomParameterToggle').checked?'custom':'default';
      STATE.calcMode=$('ParameterCalcToggle').checked?'sum':'average';
      STATE.absoluteMode=$('ParameterAbsoluteToggle').checked?'relative to reference':'absolute';
      if($('SelectedParameter'))STATE.selectedParameter=$('SelectedParameter').value;
    }

    function renderAll(){
      syncControls();
      syncCrossCorrelationControls();
      updateMainPlot();
      syncStructureModule();
      if($('correlationModule').open)renderCrossCorrelations();
      $('audit').textContent=STATE.audit;
      persist();
    }

    function tableToDelimited(fmt){
      const rows=updateTable();if(!rows.length)return '';
      const cols=Object.keys(rows[0]),sep=fmt==='csv'?',':'\t';
      return cols.map(v=>A2CA.delimitedCell(v,fmt)).join(sep)+'\n'+rows.map(r=>cols.map(c=>A2CA.delimitedCell(r[c],fmt)).join(sep)).join('\n');
    }

    function contrastColor(hex){
      const clean=String(hex||'').replace('#','');
      if(!/^[0-9a-fA-F]{6}$/.test(clean))return '#1f2933';
      const r=parseInt(clean.slice(0,2),16),g=parseInt(clean.slice(2,4),16),b=parseInt(clean.slice(4,6),16);
      const luminance=(0.299*r+0.587*g+0.114*b)/255;
      return luminance>0.62?'#17202a':'#ffffff';
    }

    function styleColorChip(input){
      const label=input.closest('.color-chip, .plot-color-chip');
      if(!label)return;
      label.style.setProperty('--chip-color',input.value);
      label.style.setProperty('--chip-text',contrastColor(input.value));
    }

    function initColors(){
      $('colorInputs').innerHTML=A2CA.AA_ORDER.map(aa=>{
        const color=A2CA.safeColor(STATE.colors[aa],A2CA.DEFAULT_COLORS[aa]||'#D8E0E7');
        return `<label class="color-chip" style="--chip-color:${color};--chip-text:${contrastColor(color)}" title="Color for ${aa}"><span>${aa}</span><input type="color" id="col_${aa}" value="${color}" aria-label="Color for amino acid ${aa}"></label>`;
      }).join('');
      A2CA.AA_ORDER.forEach(aa=>{
        const input=$(`col_${aa}`);
        input.addEventListener('input',()=>styleColorChip(input));
      });
    }

    function initCorrelationColors(){
      $('correlationColorInputs').innerHTML=Object.keys(DEFAULT_CORRELATION_COLORS).map(key=>{
        const color=A2CA.safeColor(STATE.plotColors[key],DEFAULT_CORRELATION_COLORS[key]);
        const label=CORRELATION_COLOR_LABELS[key]||key;
        return `<label class="plot-color-chip" style="--chip-color:${color};--chip-text:${contrastColor(color)}" title="${A2CA.escapeHtml(label)}"><span>${A2CA.escapeHtml(label)}</span><input type="color" id="corrcol_${key}" value="${color}" aria-label="Color for ${A2CA.escapeHtml(label)}"></label>`;
      }).join('');
      Object.keys(DEFAULT_CORRELATION_COLORS).forEach(key=>{
        const input=$(`corrcol_${key}`);
        input.addEventListener('input',()=>styleColorChip(input));
      });
    }

    function selectResidue(pos){
      if(!STATE.selectedPositions.includes(pos))STATE.selectedPositions.push(pos);
      STATE.audit=`Residue selected (${STATE.selectedPositions.length} total).`;
      renderAll();
    }

    function removeResidue(pos){
      STATE.selectedPositions=STATE.selectedPositions.filter(x=>x!==pos);
      STATE.audit=`Residue removed (${STATE.selectedPositions.length} selected).`;
      renderAll();
    }

    $('SelectedSequence').onchange=()=>{
      const value=$('SelectedSequence').value.trim();
      if(!Object.prototype.hasOwnProperty.call(STATE.alignment,value)){
        STATE.audit='Choose a reference sequence from the search suggestions.';
        $('audit').textContent=STATE.audit;
        $('SelectedSequence').value=STATE.selectedSequence;
        return;
      }
      if(value===STATE.selectedSequence)return;
      STATE.selectedSequence=value;
      STATE.selectedPositions=[];
      STATE.audit='Reference sequence changed; residue selection was reset.';
      renderAll();
    };
    $('SelectedSequence').addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();$('SelectedSequence').blur();}
    });

    $('fullResidueList').addEventListener('click',event=>{
      const btn=event.target.closest('.residue-chip[data-pos]');
      if(!btn||btn.disabled)return;
      selectResidue(Number(btn.dataset.pos));
    });

    $('selectedResidueList').addEventListener('click',event=>{
      const btn=event.target.closest('.residue-chip[data-pos]');
      if(!btn)return;
      removeResidue(Number(btn.dataset.pos));
    });

    $('resetResiduesBtn').onclick=()=>{
      STATE.selectedPositions=[];
      STATE.audit='Residue selection reset.';
      renderAll();
    };

    $('residueSearch').addEventListener('input',()=>{
      renderResiduePicker();
    });

    $('clearResidueSearchBtn').onclick=()=>{
      $('residueSearch').value='';
      renderResiduePicker();
      $('residueSearch').focus();
    };

    $('CorrelationResidueA').addEventListener('change',()=>{
      STATE.correlationPositionA=Number($('CorrelationResidueA').value)||null;
      if(STATE.correlationPositionA===STATE.correlationPositionB){
        const candidates=STATE.selectedPositions.filter(x=>x!==STATE.correlationPositionA);
        STATE.correlationPositionB=candidates[0]||null;
        syncCrossCorrelationControls();
      }
      renderCrossCorrelations();
      persist();
    });
    $('CorrelationResidueB').addEventListener('change',()=>{
      STATE.correlationPositionB=Number($('CorrelationResidueB').value)||null;
      if(STATE.correlationPositionA===STATE.correlationPositionB){
        const candidates=STATE.selectedPositions.filter(x=>x!==STATE.correlationPositionB);
        STATE.correlationPositionA=candidates[0]||null;
        syncCrossCorrelationControls();
      }
      renderCrossCorrelations();
      persist();
    });

    $('ParameterViewToggle').addEventListener('change',()=>{
      captureParameterControls();
      STATE.audit=STATE.parameterViewMode==='yes'?'Parameter visualization enabled.':'Parameter visualization disabled.';
      renderAll();
    });

    ['CustomParameterToggle','ParameterCalcToggle','ParameterAbsoluteToggle'].forEach(id=>{
      $(id).addEventListener('change',()=>{
        captureParameterControls();
        STATE.audit='Parameter settings updated.';
        renderAll();
      });
    });

    $('SelectedParameter').addEventListener('change',()=>{
      STATE.selectedParameter=$('SelectedParameter').value;
      STATE.audit='Selected parameter changed.';
      renderAll();
    });

    $('saveColorsBtn').onclick=()=>{
      A2CA.AA_ORDER.forEach(aa=>STATE.colors[aa]=$(`col_${aa}`).value);
      Object.keys(DEFAULT_CORRELATION_COLORS).forEach(key=>STATE.plotColors[key]=$(`corrcol_${key}`).value);
      STATE.audit='Color schema saved.';
      renderAll();
    };

    $('resetColorsBtn').onclick=()=>{
      STATE.colors={...A2CA.DEFAULT_COLORS};
      STATE.plotColors={...DEFAULT_CORRELATION_COLORS};
      initColors();
      initCorrelationColors();
      STATE.audit='Color schema reset.';
      renderAll();
    };

    $('structureModule').addEventListener('toggle',()=>{
      if($('structureModule').open&&session.structureText){
        ensureStructureViewer();
        setTimeout(()=>{try{structureViewer?.resize();structureViewer?.render();}catch(e){}},80);
      }
    });
    $('correlationModule').addEventListener('toggle',()=>{
      if($('correlationModule').open){
        syncCrossCorrelationControls();
        renderCrossCorrelations();
      }
    });
    $('structureChainToggles').addEventListener('change',()=>applyStructureStyles({zoom:true}));
    $('StructureStyleToggle').addEventListener('change',()=>{
      structureStyleMode=$('StructureStyleToggle').checked?'stick':'cartoon';
      applyStructureStyles();
    });
    $('showReferenceChainBtn').addEventListener('click',()=>{
      const refChain=structureReferenceChain();
      visibleStructureChains=new Set(refChain?[refChain]:[]);
      renderStructureChainToggles();
      applyStructureStyles({zoom:true});
    });
    $('showAllChainsBtn').addEventListener('click',()=>{
      visibleStructureChains=new Set(allStructureChainIds());
      renderStructureChainToggles();
      applyStructureStyles({zoom:true});
    });

    $('structureSelectedList').addEventListener('click',event=>{
      const button=event.target.closest('[data-structure-key]');
      if(!button)return;
      const key=button.dataset.structureKey;
      const item=structurePickedResidues.find(x=>structureResidueKey(x)===key);
      if(item)toggleStructureResidue(item);
    });
    $('resetStructureResiduesBtn').addEventListener('click',()=>{
      structurePickedResidues=[];
      renderStructurePickedList();
      applyStructureStyles();
      persist();
      $('structureMappingInfo').textContent=`Structure selection cleared. Residue picking is restricted to reference chain ${structureReferenceChain()||''}.`;
    });
    $('addStructureResiduesBtn').addEventListener('click',()=>transferStructureSelection('add'));
    $('replaceStructureResiduesBtn').addEventListener('click',()=>transferStructureSelection('replace'));
    $('selectSphereBtn').addEventListener('click',selectSphereAroundPicked);

    function correlationLabelsAndData(){
      const data=correlationResidueData();
      if(!data)return null;
      const residues=selectedResidueDescriptors();
      const descA=residues.find(r=>r.alignmentPosition===data.posA),descB=residues.find(r=>r.alignmentPosition===data.posB);
      return {data,labelA:descA?.label||`Position ${data.posA}`,labelB:descB?.label||`Position ${data.posB}`};
    }

    function heatmapRawRows(rows,weights,labelA,labelB,kind){
      const data=pairFrequency(rows,weights),out=[];
      if(!(data.total>0))return out;
      const aaA=HEATMAP_AA_ORDER.filter(aa=>data.rowCounts.has(aa));
      const aaB=HEATMAP_AA_ORDER.filter(aa=>data.colCounts.has(aa));
      for(const a of aaA)for(const b of aaB){
        const observed=data.counts.get(`${a}|${b}`)||0;
        const expected=(data.rowCounts.get(a)||0)*(data.colCounts.get(b)||0)/data.total;
        out.push({plot:kind,residue_1_position:labelA,residue_2_position:labelB,residue_1_aa:a,residue_2_aa:b,observed,observed_percent:100*observed/data.total,expected,log2_enrichment:Math.log2((observed+0.25)/(expected+0.25)),weighting:weights?'phylogenetic':'none'});
      }
      return out;
    }

    function parameterRawRows(rows,labelA,labelB){
      if(STATE.parameterViewMode!=='yes')return [];
      const props=getCurrentPropertyFile(),param=STATE.selectedParameter;
      return rows.map(row=>({plot:'parameter',sequence:row.name,residue_1_position:labelA,residue_2_position:labelB,residue_1_aa:row.aaA,residue_2_aa:row.aaB,parameter:param,residue_1_value:Number(props[row.aaA]?.[param]),residue_2_value:Number(props[row.aaB]?.[param])})).filter(r=>Number.isFinite(r.residue_1_value)&&Number.isFinite(r.residue_2_value));
    }

    function treeChangeRawRows(posA,posB,labelA,labelB){
      const statesA=fitchStatesForPosition(posA),statesB=fitchStatesForPosition(posB),out=[];
      let internal=0;
      const nodeName=node=>node.name||`internal_${++internal}`;
      function rec(node,parentLabel){
        const thisLabel=parentLabel||nodeName(node);
        for(const child of node.children){
          const childLabel=nodeName(child);
          const a0=statesA.get(node)||'',a1=statesA.get(child)||'',b0=statesB.get(node)||'',b1=statesB.get(child)||'';
          const ca=Boolean(a0&&a1&&a0!==a1),cb=Boolean(b0&&b1&&b0!==b1);
          out.push({plot:'tree',parent:thisLabel,child:childLabel,branch_length:Number(child.length)||0,residue_1_position:labelA,residue_1_parent:a0,residue_1_child:a1,residue_1_changed:ca,residue_2_position:labelB,residue_2_parent:b0,residue_2_child:b1,residue_2_changed:cb,change_class:ca&&cb?'both':ca?'residue_1':cb?'residue_2':'neither'});
          rec(child,childLabel);
        }
      }
      rec(STATE.tree,nodeName(STATE.tree));
      return out;
    }

    function correlationRawRows(target){
      const bundle=correlationLabelsAndData();
      if(!bundle)return [];
      const {data,labelA,labelB}=bundle;
      const treeMetrics=correlationTreeMetricsCache||(correlationTreeMetricsCache=buildTreeMetrics());
      const lookup={
        similarity:()=>heatmapRawRows(data.rows,null,labelA,labelB,'similarity'),
        parameter:()=>parameterRawRows(data.rows,labelA,labelB),
        phylo:()=>heatmapRawRows(data.rows,treeMetrics.weights,labelA,labelB,'phylo_adjusted'),
        tree:()=>treeChangeRawRows(data.posA,data.posB,labelA,labelB)
      };
      if(target==='all')return ['similarity','parameter','phylo','tree'].flatMap(key=>lookup[key]());
      return lookup[target]?lookup[target]():[];
    }

    function rowsToDelimited(rows,format){
      if(!rows.length)return '';
      const columns=[];
      rows.forEach(row=>Object.keys(row).forEach(key=>{if(!columns.includes(key))columns.push(key);}));
      const sep=format==='csv'?',':'\t';
      const esc=value=>A2CA.delimitedCell(value,format);
      return columns.map(esc).join(sep)+'\n'+rows.map(row=>columns.map(key=>esc(row[key])).join(sep)).join('\n');
    }

    function correlationPlotSelector(target){
      return {similarity:'#similarityHeatmap',parameter:'#parameterBubblePlot',phylo:'#phyloHeatmap',tree:'#correlationChangeTree'}[target]||null;
    }

    function correlationTargetName(target){
      return {all:'all',similarity:'similarity',parameter:'parameter',phylo:'phylogeny_adjusted',tree:'substitution_tree'}[target]||target;
    }

    function svgDimensions(svg){
      const vb=(svg.getAttribute('viewBox')||'').trim().split(/\s+/).map(Number);
      if(vb.length===4&&vb.every(Number.isFinite))return {w:vb[2],h:vb[3],viewBox:vb.join(' ')};
      return {w:Number(svg.getAttribute('width'))||620,h:Number(svg.getAttribute('height'))||400,viewBox:`0 0 ${Number(svg.getAttribute('width'))||620} ${Number(svg.getAttribute('height'))||400}`};
    }

    function combinedCorrelationSvg(){
      const targets=['similarity','parameter','phylo','tree'];
      const selectors=targets.map(correlationPlotSelector);
      const svgs=selectors.map(sel=>document.querySelector(`${sel} svg`));
      const tileW=640,tileH=440,gap=18,outerW=tileW*2+gap,outerH=tileH*2+gap;
      const titles=['Similarity-based coevolution','Amino-acid property coupling','Phylogeny-adjusted coevolution','Inferred substitutions on phylogeny'];
      const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${outerW} ${outerH}" width="${outerW}" height="${outerH}" font-family="Arial,Helvetica,sans-serif"><rect width="100%" height="100%" fill="white"/>`];
      svgs.forEach((svg,i)=>{
        const col=i%2,row=Math.floor(i/2),x=col*(tileW+gap),y=row*(tileH+gap);
        parts.push(`<rect x="${x+.5}" y="${y+.5}" width="${tileW-1}" height="${tileH-1}" rx="8" fill="#fff" stroke="#dce5ee"/>`);
        parts.push(`<text x="${x+16}" y="${y+24}" font-size="15" font-weight="700" fill="#1f2933">${A2CA.escapeHtml(titles[i])}</text>`);
        if(svg){
          const d=svgDimensions(svg),inner=svg.innerHTML;
          parts.push(`<svg x="${x+8}" y="${y+34}" width="${tileW-16}" height="${tileH-42}" viewBox="${d.viewBox}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`);
        }else{
          parts.push(`<text x="${x+tileW/2}" y="${y+tileH/2}" text-anchor="middle" font-size="13" fill="#64748b">Plot unavailable</text>`);
        }
      });
      parts.push('</svg>');
      return parts.join('');
    }

    function downloadSvgText(svgText,filename){A2CA.downloadText(filename,'image/svg+xml;charset=utf-8',svgText);}
    function downloadPngText(svgText,filename){
      const blob=new Blob([svgText],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),img=new Image();
      img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=img.naturalWidth||1300;canvas.height=img.naturalHeight||900;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0);URL.revokeObjectURL(url);canvas.toBlob(out=>{const a=document.createElement('a');a.href=URL.createObjectURL(out);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);},'image/png');};
      img.onerror=()=>{URL.revokeObjectURL(url);alert('PNG export failed in this browser. Please use SVG export.');};img.src=url;
    }

    function correlationDownloadPrefix(){
      const raw=String($('correlationDownloadPrefix').value||$('downloadPrefix').value||'').trim();
      const clean=raw.replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'');
      return clean||'project';
    }

    function downloadTimestamp(){
      const d=new Date();
      const pad=n=>String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    }
    function downloadPrefix(){
      const raw=String($('downloadPrefix').value||'').trim();
      const clean=raw.replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'');
      return clean||'project';
    }
    function downloadBase(kind){return `${downloadTimestamp()}_A2CA_${downloadPrefix()}_${kind}`;}

    // Keep all project-name fields synchronized so every export and the saved
    // session use one consistent project prefix.
    function mirrorProjectName(source){
      if(!source)return;
      const value=source.value;
      for(const id of ['downloadPrefix','correlationDownloadPrefix','sessionProjectName']){
        const el=$(id);
        if(el&&el!==source)el.value=value;
      }
      STATE.projectName=value;
      persist();
    }
    for(const id of ['downloadPrefix','correlationDownloadPrefix','sessionProjectName']){
      const el=$(id);
      if(el)el.addEventListener('input',()=>mirrorProjectName(el));
    }

    $('downloadTableBtn').onclick=()=>{
      const format=$('TableFormatToggle').checked?'csv':'txt';
      const mime=format==='csv'?'text/csv;charset=utf-8':'text/plain;charset=utf-8';
      A2CA.downloadText(`${downloadBase('table')}.${format}`,mime,tableToDelimited(format));
    };
    $('downloadImageBtn').onclick=()=>{
      const format=$('ImageFormatToggle').checked?'png':'svg';
      const filename=`${downloadBase('tree')}.${format}`;
      if(format==='png')A2CA.downloadPng('#treePlot',filename);
      else A2CA.downloadSvg('#treePlot',filename);
    };
    $('downloadCorrelationImageBtn').onclick=()=>{
      const target=$('CorrelationDownloadTarget').value,format=$('CorrelationImageFormatToggle').checked?'png':'svg';
      const base=`${downloadTimestamp()}_A2CA_${correlationDownloadPrefix()}_coevolution_${correlationTargetName(target)}`;
      if(target==='all'){
        const svgText=combinedCorrelationSvg();
        if(format==='png')downloadPngText(svgText,`${base}.png`);else downloadSvgText(svgText,`${base}.svg`);
        return;
      }
      const selector=correlationPlotSelector(target);
      if(!selector||!document.querySelector(`${selector} svg`)){alert('The selected plot is not currently available.');return;}
      if(format==='png')A2CA.downloadPng(selector,`${base}.png`);else A2CA.downloadSvg(selector,`${base}.svg`);
    };
    $('downloadCorrelationTableBtn').onclick=()=>{
      const target=$('CorrelationDownloadTarget').value,format=$('CorrelationTableFormatToggle').checked?'csv':'txt';
      const rows=correlationRawRows(target);
      if(!rows.length){alert(target==='parameter'?'Enable amino acid properties to export parameter data.':'No raw data are available for the selected plot.');return;}
      const mime=format==='csv'?'text/csv;charset=utf-8':'text/plain;charset=utf-8';
      const base=`${downloadTimestamp()}_A2CA_${correlationDownloadPrefix()}_coevolution_${correlationTargetName(target)}`;
      A2CA.downloadText(`${base}.${format}`,mime,rowsToDelimited(rows,format));
    };
    $('saveSessionBtn').onclick=()=>{
      persist();
      try{
        const text=A2CA.serializeSessionFile(session,'2.0.40');
        A2CA.downloadText(`${downloadBase('session')}.a2ca`,'application/json;charset=utf-8',text);
        STATE.audit='Session file saved.';
        $('audit').textContent=STATE.audit;
      }catch(err){
        alert('The session could not be saved: '+err.message);
      }
    };

    $('newAnalysisBtn').onclick=()=>{
      A2CA.clearSession();
      if(embedded){
        A2CA.postToParent('A2CA_SHOW_START',{clear:true});
      }else{
        location.href='upload.html?new=1';
      }
    };

    initColors();
    initCorrelationColors();
    renderAll();
  }

  requestSession().then(start);
})();
