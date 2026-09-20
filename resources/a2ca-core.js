'use strict';
(function(global){
  const SESSION_MARKER='A2CA_MULTIPAGE_V1';
  const SESSION_KEY='a2ca_multipage_session_v1';
  const SESSION_FILE_MARKER='A2CA_SESSION_FILE';
  const SESSION_FILE_VERSION=1;
  const AA_ORDER=Array.from('GAVLIFWYCMDEKRHNQSTP');
  const DEFAULT_COLORS={G:'#B9C7D4',A:'#9EC4E1',V:'#83B3D6',L:'#6AA2CC',I:'#4F8FC0',F:'#9A8FC4',W:'#8274B1',Y:'#AD9DCC',C:'#C9AD6A',M:'#B99A59',D:'#D98D8D',E:'#C9757D',K:'#6F97C7',R:'#537DB1',H:'#6CA8A2',N:'#A8CBD2',Q:'#8FB7C6',S:'#9BC9BD',T:'#82B9AA',P:'#B39BC8','-':'#FFFFFF',NA:'#FFFFFF',X:'#D8E0E7','?':'#D8E0E7'};
  const DEFAULT_PROPERTIES={
    A:{Hydrophobicity:1.8,Volume:88.6,Mass:71.08,Charge:0,Polarity:0},R:{Hydrophobicity:-4.5,Volume:173.4,Mass:156.19,Charge:1,Polarity:1},N:{Hydrophobicity:-3.5,Volume:114.1,Mass:114.10,Charge:0,Polarity:1},D:{Hydrophobicity:-3.5,Volume:111.1,Mass:115.09,Charge:-1,Polarity:1},C:{Hydrophobicity:2.5,Volume:108.5,Mass:103.15,Charge:0,Polarity:0},Q:{Hydrophobicity:-3.5,Volume:143.8,Mass:128.13,Charge:0,Polarity:1},E:{Hydrophobicity:-3.5,Volume:138.4,Mass:129.12,Charge:-1,Polarity:1},G:{Hydrophobicity:-0.4,Volume:60.1,Mass:57.05,Charge:0,Polarity:0},H:{Hydrophobicity:-3.2,Volume:153.2,Mass:137.14,Charge:0.1,Polarity:1},I:{Hydrophobicity:4.5,Volume:166.7,Mass:113.16,Charge:0,Polarity:0},L:{Hydrophobicity:3.8,Volume:166.7,Mass:113.16,Charge:0,Polarity:0},K:{Hydrophobicity:-3.9,Volume:168.6,Mass:128.17,Charge:1,Polarity:1},M:{Hydrophobicity:1.9,Volume:162.9,Mass:131.20,Charge:0,Polarity:0},F:{Hydrophobicity:2.8,Volume:189.9,Mass:147.18,Charge:0,Polarity:0},P:{Hydrophobicity:-1.6,Volume:112.7,Mass:97.12,Charge:0,Polarity:0},S:{Hydrophobicity:-0.8,Volume:89.0,Mass:87.08,Charge:0,Polarity:1},T:{Hydrophobicity:-0.7,Volume:116.1,Mass:101.11,Charge:0,Polarity:1},W:{Hydrophobicity:-0.9,Volume:227.8,Mass:186.21,Charge:0,Polarity:0},Y:{Hydrophobicity:-1.3,Volume:193.6,Mass:163.18,Charge:0,Polarity:1},V:{Hydrophobicity:4.2,Volume:140.0,Mass:99.13,Charge:0,Polarity:0}
  };
  const MAX_ALIGNMENT_SEQUENCES=5000;
  const MAX_ALIGNMENT_LENGTH=100000;
  const MAX_ALIGNMENT_CELLS=20000000;
  const HEX_COLOR_RE=/^#[0-9A-Fa-f]{6}$/;
  const deepClone=obj=>JSON.parse(JSON.stringify(obj));
  const isHexColor=value=>HEX_COLOR_RE.test(String(value||''));
  const safeColor=(value,fallback='#D8E0E7')=>isHexColor(value)?String(value):fallback;
  const escapeHtml=s=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const safeText=(value,max=200)=>String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').slice(0,max);
  function csvSafeValue(value){
    if(typeof value!=='string')return value;
    return /^[\t\r\n ]*[=+\-@]/.test(value)?`'${value}`:value;
  }
  function delimitedCell(value,format='csv'){
    let text=String(format==='csv'?csvSafeValue(value):(value??''));
    if(format==='csv'&&/[",\r\n]/.test(text))text='"'+text.replace(/"/g,'""')+'"';
    return text;
  }
  function likelyNucleicAcid(seq){
    const x=String(seq||'').replace(/[-.\s*?]/g,'').toUpperCase();
    if(x.length<4)return false;
    const n=[...x].filter(c=>'ACGTUN'.includes(c)).length;
    // Very short A/C/G/T-only strings are ambiguous, but are not useful BLASTP
    // queries and are safer to treat as nucleic acid. Longer sequences require
    // near-complete nucleotide composition before being rejected.
    return x.length<12 ? n===x.length : n/x.length>=0.95;
  }

  function readFile(input){return new Promise((resolve,reject)=>{const f=input.files&&input.files[0];if(!f)return reject(new Error('No file selected.'));const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(r.error||new Error('Could not read file.'));r.readAsText(f);});}
  function cleanSequenceName(name){return String(name||'').trim().split(/\s+/)[0];}
  function cleanTreeLabel(label){return String(label||'').trim().replace(/^['"]|['"]$/g,'');}
  function nameVariants(name){
    const x=cleanTreeLabel(name);
    const set=new Set([x]);
    const first=cleanSequenceName(x);if(first)set.add(first);
    for(const part of x.split('|').map(v=>v.trim()).filter(Boolean))set.add(part);
    return [...set];
  }
  function matchTreeName(sequenceName,treeNames){
    const names=Array.isArray(treeNames)?treeNames:[];
    const seq=cleanSequenceName(sequenceName);
    let hit=names.find(name=>cleanTreeLabel(name)===seq);
    if(hit!==undefined)return hit;
    const variants=new Set(nameVariants(seq));
    const matches=names.filter(name=>nameVariants(name).some(v=>variants.has(v)));
    return matches.length===1?matches[0]:null;
  }
  function validateProteinCharacters(seq,name='sequence',allowGaps=false){
    const normalized=String(seq||'').toUpperCase().replace(/\./g,'-');
    const re=allowGaps?/^[A-Z*?\-]+$/:/^[A-Z*?]+$/;
    if(!normalized||!re.test(normalized))throw new Error(`${name} contains unsupported characters.`);
    return normalized;
  }
  function parseFasta(text){
    const records={};let current=null;
    for(const raw of String(text||'').split(/\r?\n/)){
      const line=raw.trim();if(!line)continue;
      if(line.startsWith('>')){
        current=cleanSequenceName(line.slice(1));
        if(!current)throw new Error('A FASTA header is empty.');
        if(Object.prototype.hasOwnProperty.call(records,current))throw new Error(`Duplicate FASTA identifier: ${current}`);
        records[current]='';
      }else{
        if(!current)throw new Error('Sequence data were found before the first FASTA header.');
        records[current]+=line.replace(/\s+/g,'').toUpperCase().replace(/\./g,'-');
      }
    }
    const names=Object.keys(records);
    if(!names.length)throw new Error('No FASTA records were found.');
    if(names.length>MAX_ALIGNMENT_SEQUENCES)throw new Error(`Alignment contains more than ${MAX_ALIGNMENT_SEQUENCES} sequences, which exceeds the browser safety limit.`);
    const lengths=new Set();
    for(const name of names){records[name]=validateProteinCharacters(records[name],`Sequence ${name}`,true);lengths.add(records[name].length);}
    if(lengths.size!==1)throw new Error('Alignment records must all have the same length.');
    const length=records[names[0]].length;
    if(length>MAX_ALIGNMENT_LENGTH)throw new Error(`Alignment length exceeds the browser safety limit of ${MAX_ALIGNMENT_LENGTH.toLocaleString()} columns.`);
    if(names.length*length>MAX_ALIGNMENT_CELLS)throw new Error(`Alignment contains more than ${MAX_ALIGNMENT_CELLS.toLocaleString()} residue cells, which exceeds the browser safety limit.`);
    const nucleotideLike=names.filter(name=>likelyNucleicAcid(records[name])).length;
    if(nucleotideLike>=Math.max(2,Math.ceil(names.length*0.8)))throw new Error('The alignment appears to contain DNA/RNA rather than protein sequences. A2CA requires an amino-acid alignment.');
    return records;
  }
  function tokenizeNewick(text){return String(text||'').trim().match(/\(|\)|,|:|;|[^\(\),:;\s]+/g)||[];}
  function parseNewick(text){
    const tokens=tokenizeNewick(text);if(!tokens.length)throw new Error('Empty Newick file.');let idx=0;
    function node(){return {name:'',length:0,children:[],x:0,y:0};}
    function parseSubtree(){
      const n=node();
      if(tokens[idx]==='('){idx++;while(true){n.children.push(parseSubtree());if(tokens[idx]===','){idx++;continue;}if(tokens[idx]===')'){idx++;break;}throw new Error('Malformed Newick tree.');}}
      if(idx<tokens.length&&![',',')',':',';'].includes(tokens[idx])){n.name=cleanTreeLabel(tokens[idx]);idx++;}
      if(tokens[idx]===':'){idx++;const len=Number.parseFloat(tokens[idx]);n.length=Number.isFinite(len)?len:0;idx++;}
      return n;
    }
    const root=parseSubtree();if(!root.children.length&&!root.name)throw new Error('No tree structure was found.');return root;
  }
  function validateTreeAlignment(alignment,tree){
    const alignmentNames=Object.keys(alignment||{}),leafNames=leaves(tree).map(x=>x.name);
    if(!leafNames.length)throw new Error('The tree contains no terminal nodes.');
    const used=new Set(),unmatchedLeaves=[];
    for(const leaf of leafNames){
      const match=matchTreeName(leaf,alignmentNames);
      if(!match||used.has(match))unmatchedLeaves.push(leaf);else used.add(match);
    }
    const missingAlignment=alignmentNames.filter(name=>!used.has(name));
    if(unmatchedLeaves.length||missingAlignment.length){
      const a=unmatchedLeaves.slice(0,5).join(', '),b=missingAlignment.slice(0,5).join(', ');
      throw new Error(`Tree and alignment identifiers do not match one-to-one.${unmatchedLeaves.length?` Unmatched tree tips: ${a}${unmatchedLeaves.length>5?'…':''}.`:''}${missingAlignment.length?` Alignment sequences missing from tree: ${b}${missingAlignment.length>5?'…':''}.`:''}`);
    }
    return true;
  }
  function parseDelimited(text){const firstLine=(text.split(/\r?\n/).find(l=>l.trim())||'');const sep=(firstLine.match(/;/g)||[]).length>=(firstLine.match(/,/g)||[]).length?';':',';return text.trim().split(/\r?\n/).filter(Boolean).map(line=>line.split(sep).map(x=>x.trim()));}
  function parseParameterCsv(text){
    const rows=parseDelimited(text);if(!rows.length)throw new Error('Parameter file is empty.');
    const header=rows[0],cols=header.slice(1).map((c,i)=>safeText(c||`Parameter_${i+1}`,80));
    if(!cols.length)throw new Error('Parameter file requires at least one numeric parameter column.');
    if(new Set(cols).size!==cols.length)throw new Error('Parameter column names must be unique.');
    const out={};
    for(const [rowIndex,row] of rows.slice(1).entries()){
      if(row.length<2)continue;const aa=(row[0]||'').toUpperCase()[0];if(!aa)continue;
      out[aa]={};
      cols.forEach((c,i)=>{
        const raw=String(row[i+1]??'').trim();
        if(raw==='')throw new Error(`Empty parameter value for residue ${aa}, column ${c}, row ${rowIndex+2}.`);
        const value=Number(raw.replace(',','.'));
        if(!Number.isFinite(value))throw new Error(`Invalid numeric parameter value "${safeText(raw,40)}" for residue ${aa}, column ${c}.`);
        out[aa][c]=value;
      });
    }
    if(!Object.keys(out).length)throw new Error('No residue parameter rows were found.');return out;
  }
  function leaves(n){return n.children.length?[].concat(...n.children.map(leaves)):[n];}
  function walkTree(n){return [n].concat(...n.children.map(walkTree));}
  function assignTreeCoordinates(root){const leafNodes=leaves(root);leafNodes.forEach((leaf,i)=>leaf.y=i);const hasLengths=walkTree(root).some(n=>n.length>0);function rec(n,parentX){n.x=parentX+(hasLengths?n.length:(n===root?0:1));for(const c of n.children)rec(c,n.x);if(n.children.length)n.y=n.children.reduce((a,c)=>a+c.y,0)/n.children.length;}rec(root,0);return leafNodes;}
  function drawEdges(n,parts,sx,sy,margin){for(const c of n.children){parts.push(`<line x1="${margin.left+n.x*sx}" y1="${margin.top+c.y*sy}" x2="${margin.left+c.x*sx}" y2="${margin.top+c.y*sy}" stroke="black" stroke-width="0.8"/>`);if(c.children.length){const ys=c.children.map(k=>k.y);parts.push(`<line x1="${margin.left+c.x*sx}" y1="${margin.top+Math.min(...ys)*sy}" x2="${margin.left+c.x*sx}" y2="${margin.top+Math.max(...ys)*sy}" stroke="black" stroke-width="0.8"/>`);}drawEdges(c,parts,sx,sy,margin);}}
  function htmlTable(rows){if(!rows||!rows.length)return '<p class="muted">No data available.</p>';const cols=Object.keys(rows[0]);return '<table class="data"><thead><tr>'+cols.map(c=>`<th>${escapeHtml(c)}</th>`).join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>`<td>${escapeHtml(r[c]??'')}</td>`).join('')+'</tr>').join('')+'</tbody></table>';}
  function propertyNames(obj){const first=obj[Object.keys(obj)[0]]||{};return Object.keys(first);}
  function saveSession(data){
    const raw=JSON.stringify({marker:SESSION_MARKER,data});
    try{global.sessionStorage.setItem(SESSION_KEY,raw);}catch(e){}
    return raw.length;
  }
  function loadSession(){
    try{
      const raw=global.sessionStorage.getItem(SESSION_KEY);if(!raw)return null;
      const obj=JSON.parse(raw);if(obj&&obj.marker===SESSION_MARKER&&obj.data)return obj.data;
    }catch(e){}
    return null;
  }
  function clearSession(){try{global.sessionStorage.removeItem(SESSION_KEY);}catch(e){}}
  function sanitizeProperties(obj){
    const out={};if(!obj||typeof obj!=='object')return deepClone(DEFAULT_PROPERTIES);
    for(const [aa,row] of Object.entries(obj)){
      const key=String(aa||'').toUpperCase()[0];if(!key||!row||typeof row!=='object')continue;
      const clean={};
      for(const [name,value] of Object.entries(row)){
        const n=safeText(name,80).trim();const v=Number(value);
        if(n&&Number.isFinite(v))clean[n]=v;
      }
      if(Object.keys(clean).length)out[key]=clean;
    }
    return Object.keys(out).length?out:deepClone(DEFAULT_PROPERTIES);
  }
  function sanitizeAnalysisState(state,alignment){
    const src=state&&typeof state==='object'?state:{};const out={};
    const names=Object.keys(alignment||{}),len=names.length?alignment[names[0]].length:0;
    out.selectedSequence=names.includes(src.selectedSequence)?src.selectedSequence:(names[0]||'');
    out.selectedPositions=Array.isArray(src.selectedPositions)?[...new Set(src.selectedPositions.map(Number).filter(v=>Number.isInteger(v)&&v>=1&&v<=len))]:[];
    out.customParameterMode=src.customParameterMode==='custom'?'custom':'default';
    out.calcMode=src.calcMode==='sum'?'sum':'average';
    out.absoluteMode=src.absoluteMode==='relative to reference'?'relative to reference':'absolute';
    out.parameterViewMode=src.parameterViewMode==='yes'?'yes':'no';
    out.structureStyleMode=src.structureStyleMode==='stick'?'stick':'cartoon';
    out.paletteVersion=Number(src.paletteVersion)===2?2:0;
    out.colors={...DEFAULT_COLORS};for(const [aa,c] of Object.entries(src.colors||{}))if(isHexColor(c))out.colors[aa]=c;
    out.plotColors={};for(const [k,c] of Object.entries(src.plotColors||{}))if(isHexColor(c))out.plotColors[safeText(k,80)]=c;
    out.customProperties=sanitizeProperties(src.customProperties);
    out.selectedParameter=safeText(src.selectedParameter||'Hydrophobicity',80);
    out.projectName=safeText(src.projectName||'',120).trim();
    out.audit=safeText(src.audit||'',500);
    out.correlationPositionA=Number.isInteger(Number(src.correlationPositionA))?Number(src.correlationPositionA):null;
    out.correlationPositionB=Number.isInteger(Number(src.correlationPositionB))?Number(src.correlationPositionB):null;
    out.visibleStructureChains=Array.isArray(src.visibleStructureChains)?src.visibleStructureChains.map(x=>safeText(x,20)):[];
    out.structurePickedResidues=Array.isArray(src.structurePickedResidues)?src.structurePickedResidues.slice(0,5000).filter(x=>x&&x.chain!==undefined&&x.resi!==undefined).map(x=>({chain:safeText(x.chain,20),resi:typeof x.resi==='number'?x.resi:safeText(x.resi,20),icode:safeText(x.icode||'',5),resn:safeText(x.resn||'',8),aa:safeText(x.aa||'',2),label:safeText(x.label||'',30)})):[];
    return out;
  }
  function validateSessionData(data){
    if(!data||typeof data!=='object')throw new Error('The session does not contain A2CA data.');
    if(typeof data.alignmentText!=='string'||!data.alignmentText.trim())throw new Error('The session does not contain a sequence alignment.');
    if(typeof data.treeText!=='string'||!data.treeText.trim())throw new Error('The session does not contain a phylogenetic tree.');
    const clean={...data};
    clean.alignmentFileName=safeText(clean.alignmentFileName||'',240);
    clean.treeFileName=safeText(clean.treeFileName||'',240);
    clean.structureFileName=safeText(clean.structureFileName||'',240);
    clean.structureFormat=clean.structureFormat==='cif'?'cif':(clean.structureFormat==='pdb'?'pdb':'');
    clean.selectedStructureChain=safeText(clean.selectedStructureChain||'',40);
    clean.structurePdbId=/^[A-Za-z0-9]{4}$/.test(String(clean.structurePdbId||''))?String(clean.structurePdbId).toUpperCase():'';
    clean.structureMatches=[]; // always recomputed from the validated structure/alignment
    clean.inputWorkflow=['blast','fasta','precomputed'].includes(clean.inputWorkflow)?clean.inputWorkflow:'';
    const alignment=parseFasta(clean.alignmentText),tree=parseNewick(clean.treeText);validateTreeAlignment(alignment,tree);
    if(Object.keys(alignment).length<2)throw new Error('The saved alignment contains fewer than two sequences.');
    if(leaves(tree).length<2)throw new Error('The saved tree contains fewer than two terminal nodes.');
    clean.analysisState=sanitizeAnalysisState(clean.analysisState,alignment);
    if(clean.structureText){
      if(typeof clean.structureText!=='string'||clean.structureText.length>25*1024*1024)throw new Error('The saved protein structure exceeds the 25 MB safety limit.');
      try{clean.structureChains=parseStructureSequences(clean.structureText,clean.structureFileName||clean.structureFormat||'');}catch(e){throw new Error('The saved protein structure is invalid: '+e.message);}
      if(clean.selectedStructureChain&&!Object.prototype.hasOwnProperty.call(clean.structureChains,clean.selectedStructureChain))clean.selectedStructureChain='';
    }
    return clean;
  }
  function serializeSessionFile(data,appVersion=''){
    const clean=validateSessionData(data);
    return JSON.stringify({format:SESSION_FILE_MARKER,formatVersion:SESSION_FILE_VERSION,appVersion:safeText(appVersion||'',40),savedAt:new Date().toISOString(),data:clean},null,2);
  }
  function parseSessionFile(text){
    let obj;
    try{obj=JSON.parse(String(text||''));}catch(e){throw new Error('The selected file is not valid JSON.');}
    if(!obj||obj.format!==SESSION_FILE_MARKER)throw new Error('This is not an A2CA session file.');
    if(Number(obj.formatVersion)!==SESSION_FILE_VERSION)throw new Error(`Unsupported A2CA session format version: ${obj.formatVersion??'unknown'}.`);
    return validateSessionData(obj.data);
  }
  function downloadText(filename,mime,text){const blob=new Blob([text],{type:mime});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function currentSvg(selector){const svg=document.querySelector(selector+' svg');if(!svg)throw new Error('No SVG available.');const clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('font-family','Arial, Helvetica, sans-serif');clone.style.fontFamily='Arial, Helvetica, sans-serif';clone.querySelectorAll('text').forEach(node=>{node.setAttribute('font-family','Arial, Helvetica, sans-serif');node.style.fontFamily='Arial, Helvetica, sans-serif';});return new XMLSerializer().serializeToString(clone);}
  function downloadSvg(selector,filename){downloadText(filename,'image/svg+xml;charset=utf-8',currentSvg(selector));}
  function downloadPng(selector,filename){const svgText=currentSvg(selector);const svg=new Blob([svgText],{type:'image/svg+xml;charset=utf-8'});const url=URL.createObjectURL(svg);const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=img.width||1200;canvas.height=img.height||800;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0);URL.revokeObjectURL(url);canvas.toBlob(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);},'image/png');};img.onerror=()=>{URL.revokeObjectURL(url);alert('PNG export failed in this browser. Please use SVG export.');};img.src=url;}

  function parseFastaRaw(text){
    const records={};
    let current=null;
    for(const raw of String(text||'').split(/\r?\n/)){
      const line=raw.trim();
      if(!line)continue;
      if(line.startsWith('>')){
        current=cleanSequenceName(line.slice(1));
        if(!current)throw new Error('A FASTA header is empty.');
        if(Object.prototype.hasOwnProperty.call(records,current))throw new Error(`Duplicate FASTA identifier: ${current}`);
        records[current]='';
      }else{
        if(!current)throw new Error('Sequence data were found before the first FASTA header.');
        records[current]+=line.replace(/\s+/g,'').toUpperCase();
      }
    }
    const names=Object.keys(records);
    if(!names.length)throw new Error('No FASTA records were found.');
    if(names.length>MAX_ALIGNMENT_SEQUENCES)throw new Error(`FASTA input contains more than ${MAX_ALIGNMENT_SEQUENCES} sequences, which exceeds the browser safety limit.`);
    let totalResidues=0;
    for(const name of names){
      records[name]=records[name].replace(/[.\-]/g,'');
      if(!records[name])throw new Error(`Sequence ${name} is empty.`);
      if(records[name].length>MAX_ALIGNMENT_LENGTH)throw new Error(`Sequence ${name} exceeds the browser safety limit of ${MAX_ALIGNMENT_LENGTH.toLocaleString()} residues.`);
      if(!/^[A-Z*?]+$/.test(records[name]))throw new Error(`Sequence ${name} contains unsupported characters.`);
      totalResidues+=records[name].length;
    }
    if(totalResidues>MAX_ALIGNMENT_CELLS)throw new Error(`FASTA input contains more than ${MAX_ALIGNMENT_CELLS.toLocaleString()} residues, which exceeds the browser safety limit.`);
    return records;
  }
  function formatFasta(records,width=80){
    return Object.entries(records).map(([name,seq])=>{
      const chunks=[];
      for(let i=0;i<seq.length;i+=width)chunks.push(seq.slice(i,i+width));
      return `>${name}\n${chunks.join('\n')}`;
    }).join('\n')+'\n';
  }
  const AA3_TO_1={
    ALA:'A',ARG:'R',ASN:'N',ASP:'D',CYS:'C',GLN:'Q',GLU:'E',GLY:'G',HIS:'H',ILE:'I',
    LEU:'L',LYS:'K',MET:'M',PHE:'F',PRO:'P',SER:'S',THR:'T',TRP:'W',TYR:'Y',VAL:'V',
    MSE:'M',SEC:'U',PYL:'O',ASX:'B',GLX:'Z',XLE:'J',UNK:'X',HYP:'P'
  };
  function parsePdbSequences(text){
    const seqres={},stats={};
    for(const raw of String(text||'').split(/\r?\n/)){
      if(!raw.startsWith('SEQRES'))continue;
      const chain=(raw.slice(11,12).trim()||'_');const residues=raw.slice(19).trim().split(/\s+/).filter(Boolean);
      if(!seqres[chain]){seqres[chain]=[];stats[chain]={total:0,protein:0};}
      for(const token of residues){stats[chain].total++;const aa=AA3_TO_1[token.toUpperCase()];if(aa){stats[chain].protein++;seqres[chain].push(aa);}}
    }
    const seqresOut={};
    for(const [chain,a] of Object.entries(seqres)){
      const st=stats[chain];if(a.length>=5&&st.total&&st.protein/st.total>=0.7)seqresOut[chain]=a.join('');
    }
    if(Object.keys(seqresOut).length)return seqresOut;
    const atoms={},seen={};
    for(const raw of String(text||'').split(/\r?\n/)){
      if(raw.startsWith('ENDMDL'))break;if(!(raw.startsWith('ATOM  ')||raw.startsWith('HETATM')))continue;
      const res3=raw.slice(17,20).trim().toUpperCase(),aa=AA3_TO_1[res3];if(!aa)continue;
      const chain=(raw.slice(21,22).trim()||'_'),resid=(raw.slice(22,27).trim()||String((atoms[chain]||[]).length+1));
      if(!atoms[chain]){atoms[chain]=[];seen[chain]=new Set();}if(seen[chain].has(resid))continue;seen[chain].add(resid);atoms[chain].push(aa);
    }
    const out={};Object.entries(atoms).forEach(([chain,a])=>{if(a.length>=5)out[chain]=a.join('');});
    if(!Object.keys(out).length)throw new Error('No protein chain sequence could be extracted from the PDB file. DNA/RNA-only chains are ignored.');
    return out;
  }

  function detectStructureFormat(text,fileName=''){
    const name=String(fileName||'').toLowerCase();
    if(/\.(?:cif|mmcif)$/.test(name))return 'cif';
    const raw=String(text||'').trimStart();
    if(/^data_/i.test(raw)||/^_atom_site\./m.test(raw)||/^_entity_poly\./m.test(raw))return 'cif';
    return 'pdb';
  }

  function tokenizeCif(text){
    const tokens=[];
    const lines=String(text||'').replace(/\r/g,'').split('\n');
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(line.startsWith(';')){
        const value=[];
        if(line.length>1)value.push(line.slice(1));
        i++;
        while(i<lines.length&&!lines[i].startsWith(';')){value.push(lines[i]);i++;}
        tokens.push(value.join('\n'));
        continue;
      }
      let j=0;
      while(j<line.length){
        while(j<line.length&&/\s/.test(line[j]))j++;
        if(j>=line.length||line[j]==='#')break;
        if(line[j]==='"'||line[j]==="'"){
          const q=line[j++];let value='';
          while(j<line.length&&line[j]!==q)value+=line[j++];
          if(j<line.length)j++;
          tokens.push(value);
        }else{
          let value='';
          while(j<line.length&&!/\s/.test(line[j])&&line[j]!=='#')value+=line[j++];
          if(value)tokens.push(value);
          if(j<line.length&&line[j]==='#')break;
        }
      }
    }
    return tokens;
  }

  function parseCifTables(text){
    const tokens=tokenizeCif(text),singles={},loops=[];
    let i=0;
    while(i<tokens.length){
      const token=tokens[i];
      if(token==='loop_'){
        i++;const headers=[];
        while(i<tokens.length&&tokens[i].startsWith('_'))headers.push(tokens[i++]);
        if(!headers.length)continue;
        const rows=[];
        while(i<tokens.length){
          const next=tokens[i];
          if(next==='loop_'||/^data_/i.test(next)||/^save_/i.test(next)||(next.startsWith('_')&&rows.length*headers.length===0))break;
          if(next.startsWith('_')&&((rows.length*headers.length)===0))break;
          if(i+headers.length>tokens.length)break;
          const row=tokens.slice(i,i+headers.length);
          if(row.length<headers.length)break;
          // A new data item at a row boundary marks the end of the loop.
          if(row[0].startsWith('_'))break;
          rows.push(row);i+=headers.length;
        }
        loops.push({headers,rows});
      }else if(token.startsWith('_')){
        singles[token]=i+1<tokens.length?tokens[i+1]:'';i+=2;
      }else i++;
    }
    return {singles,loops};
  }

  function cifLoop(table,prefix){
    return table.loops.find(loop=>loop.headers.some(h=>h.startsWith(prefix)))||null;
  }

  function cleanCifOneLetter(value){
    let seq=String(value||'').replace(/[\s\n\r]+/g,'').toUpperCase();
    seq=seq.replace(/\(([A-Z0-9]{3})\)/g,(_,res)=>AA3_TO_1[res]||'X');
    return seq.replace(/[^A-Z*?]/g,'');
  }

  function parseCifObservedResidues(text){
    const table=parseCifTables(text);
    const loop=cifLoop(table,'_atom_site.');
    if(!loop)return {};
    const idx=Object.fromEntries(loop.headers.map((h,i)=>[h,i]));
    const get=(row,names)=>{for(const n of names){const k=idx[n];if(k!==undefined){const v=row[k];if(v!==undefined&&v!=='.'&&v!=='?')return v;}}return '';};
    const chains={},seen={};
    for(const row of loop.rows){
      const group=String(get(row,['_atom_site.group_PDB'])||'ATOM').toUpperCase();
      if(group!=='ATOM'&&group!=='HETATM')continue;
      const res3=String(get(row,['_atom_site.auth_comp_id','_atom_site.label_comp_id'])).toUpperCase();
      const aa=AA3_TO_1[res3];if(!aa)continue;
      const chain=String(get(row,['_atom_site.auth_asym_id','_atom_site.label_asym_id'])||'_');
      const resiRaw=String(get(row,['_atom_site.auth_seq_id','_atom_site.label_seq_id'])||'');
      const icodeRaw=String(get(row,['_atom_site.pdbx_PDB_ins_code'])||'');
      const icode=(icodeRaw==='.'||icodeRaw==='?')?'':icodeRaw;
      const key=`${resiRaw}:${icode}`;
      if(!chains[chain]){chains[chain]=[];seen[chain]=new Set();}
      if(seen[chain].has(key))continue;
      seen[chain].add(key);
      const numeric=Number.parseInt(resiRaw,10);
      chains[chain].push({aa,resi:Number.isFinite(numeric)?numeric:resiRaw,icode,label:`${resiRaw}${icode}`});
    }
    return chains;
  }

  function parseCifSequences(text){
    const table=parseCifTables(text),entitySeq={},entityType={};
    const entityLoop=cifLoop(table,'_entity_poly.');
    if(entityLoop){
      const idx=Object.fromEntries(entityLoop.headers.map((h,i)=>[h,i]));
      const idIdx=idx['_entity_poly.entity_id'];
      const seqIdx=idx['_entity_poly.pdbx_seq_one_letter_code_can']!==undefined?idx['_entity_poly.pdbx_seq_one_letter_code_can']:idx['_entity_poly.pdbx_seq_one_letter_code'];
      const typeIdx=idx['_entity_poly.type'];
      if(idIdx!==undefined&&seqIdx!==undefined){
        for(const row of entityLoop.rows){
          const id=String(row[idIdx]),type=typeIdx!==undefined?String(row[typeIdx]||'').toLowerCase():'';entityType[id]=type;
          if(type&&!type.includes('polypeptide'))continue;
          const seq=cleanCifOneLetter(row[seqIdx]);if(seq&&!likelyNucleicAcid(seq))entitySeq[id]=seq;
        }
      }
    }
    if(!Object.keys(entitySeq).length&&table.singles['_entity_poly.entity_id']){
      const id=String(table.singles['_entity_poly.entity_id']);const type=String(table.singles['_entity_poly.type']||'').toLowerCase();
      const seq=cleanCifOneLetter(table.singles['_entity_poly.pdbx_seq_one_letter_code_can']||table.singles['_entity_poly.pdbx_seq_one_letter_code']);
      if((!type||type.includes('polypeptide'))&&seq&&!likelyNucleicAcid(seq))entitySeq[id]=seq;
    }
    const labelToEntity={};const asymLoop=cifLoop(table,'_struct_asym.');
    if(asymLoop){const idx=Object.fromEntries(asymLoop.headers.map((h,i)=>[h,i]));const a=idx['_struct_asym.id'],e=idx['_struct_asym.entity_id'];if(a!==undefined&&e!==undefined)for(const row of asymLoop.rows)labelToEntity[String(row[a])]=String(row[e]);}
    const labelToAuth={};const atomLoop=cifLoop(table,'_atom_site.');
    if(atomLoop){const idx=Object.fromEntries(atomLoop.headers.map((h,i)=>[h,i]));const l=idx['_atom_site.label_asym_id'],a=idx['_atom_site.auth_asym_id'];if(l!==undefined)for(const row of atomLoop.rows){const label=String(row[l]||'');if(label&&!labelToAuth[label])labelToAuth[label]=a!==undefined&&row[a]!=='.'&&row[a]!=='?'?String(row[a]):label;}}
    const out={};
    for(const [label,entity] of Object.entries(labelToEntity)){const seq=entitySeq[entity];if(!seq)continue;const chain=labelToAuth[label]||label||'_';if(!out[chain]||seq.length>out[chain].length)out[chain]=seq;}
    if(Object.keys(out).length)return out;
    const observed=parseCifObservedResidues(text);for(const [chain,residues] of Object.entries(observed))if(residues.length>=5)out[chain]=residues.map(r=>r.aa).join('');
    if(!Object.keys(out).length)throw new Error('No protein chain sequence could be extracted from the mmCIF file. DNA/RNA-only chains are ignored.');
    return out;
  }

  function parseStructureSequences(text,fileName=''){
    return detectStructureFormat(text,fileName)==='cif'?parseCifSequences(text):parsePdbSequences(text);
  }

  function parseStructureObservedResidues(text,fileNameOrFormat=''){
    const format=fileNameOrFormat==='cif'||fileNameOrFormat==='pdb'?fileNameOrFormat:detectStructureFormat(text,fileNameOrFormat);
    if(format==='cif')return parseCifObservedResidues(text);
    const chains={},seen={};
    for(const raw of String(text||'').split(/\r?\n/)){
      if(raw.startsWith('ENDMDL'))break;
      if(!(raw.startsWith('ATOM  ')||raw.startsWith('HETATM')))continue;
      const res3=raw.slice(17,20).trim().toUpperCase();
      const aa=AA3_TO_1[res3];if(!aa)continue;
      const chain=(raw.slice(21,22).trim()||'_');
      const resiRaw=raw.slice(22,26).trim();
      const icode=raw.slice(26,27).trim();
      const key=`${resiRaw}:${icode}`;
      if(!chains[chain]){chains[chain]=[];seen[chain]=new Set();}
      if(seen[chain].has(key))continue;
      seen[chain].add(key);
      const numeric=Number.parseInt(resiRaw,10);
      chains[chain].push({aa,resi:Number.isFinite(numeric)?numeric:resiRaw,icode,label:`${resiRaw}${icode}`});
    }
    return chains;
  }
  function matchPdbToAlignment(chains,alignment){
    const ungapped={};
    Object.entries(alignment||{}).forEach(([name,seq])=>ungapped[name]=String(seq).replace(/[-.]/g,'').toUpperCase());
    const exact=[];
    for(const [chain,seqRaw] of Object.entries(chains||{})){
      const seq=String(seqRaw).toUpperCase();
      for(const [name,a] of Object.entries(ungapped)){
        if(seq===a)exact.push({chain,sequenceName:name,sequence:seq,identity:1,coverage:1,mode:'exact'});
      }
    }
    if(exact.length)return exact;
    const partial=[];
    for(const [chain,seqRaw] of Object.entries(chains||{})){
      const seq=String(seqRaw).toUpperCase();
      for(const [name,a] of Object.entries(ungapped)){
        const shorter=seq.length<=a.length?seq:a;
        const longer=seq.length<=a.length?a:seq;
        if(shorter.length>=25&&longer.includes(shorter)){
          const coverage=shorter.length/longer.length;
          if(coverage>=0.7)partial.push({chain,sequenceName:name,sequence:seq,identity:1,coverage,mode:'contained'});
        }
      }
    }
    return partial.sort((a,b)=>b.coverage-a.coverage);
  }


  async function fetchWithTimeout(url,options={},timeoutMs=60000){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{return await fetch(url,{...options,signal:controller.signal});}
    catch(e){if(e&&e.name==='AbortError')throw new Error(`Network request timed out after ${Math.round(timeoutMs/1000)} seconds.`);throw e;}
    finally{clearTimeout(timer);}
  }
  function messageTargetOrigin(){return location.protocol==='file:'?'*':location.origin;}
  function messageChannel(){const key='a2ca_message_channel_v1';let channel=new URLSearchParams(location.search).get('a2caChannel')||'';try{if(channel)sessionStorage.setItem(key,channel);else channel=sessionStorage.getItem(key)||'';}catch(e){}return channel;}
  function localPageUrl(url){
    const raw=String(url||'');const channel=messageChannel();if(!channel||!raw)return raw;
    try{
      const target=new URL(raw,location.href);
      if(target.protocol!==location.protocol)return raw;
      if(location.protocol!=='file:'&&target.origin!==location.origin)return raw;
      target.searchParams.set('a2caChannel',channel);
      return target.href;
    }catch(e){return raw;}
  }
  function postToParent(type,data){if(global.parent===global)return;global.parent.postMessage({type,data,a2caChannel:messageChannel()},messageTargetOrigin());}
  function isTrustedParentMessage(event,type){
    if(event.source!==global.parent||!event.data||typeof event.data!=='object')return false;
    if(location.protocol!=='file:'&&event.origin!==location.origin)return false;
    const channel=messageChannel();if(channel&&event.data.a2caChannel!==channel)return false;
    return !type||event.data.type===type;
  }


  // Preserve the per-iframe message channel across local page navigation.
  // This avoids persistent cross-navigation window metadata while keeping file:// mode functional even
  // in browsers where storage semantics for local files are restrictive.
  if(global.document&&typeof global.document.addEventListener==='function')global.document.addEventListener('click',event=>{
    const anchor=event.target&&event.target.closest?event.target.closest('a[href]'):null;
    if(!anchor||anchor.target==='_top'||anchor.hasAttribute('download'))return;
    const href=anchor.getAttribute('href')||'';
    if(!/^[^:#?]*\.html(?:[?#]|$)/i.test(href))return;
    anchor.href=localPageUrl(href);
  },true);

  // Local launcher lifecycle -------------------------------------------------
  // The top-level A2CA controller keeps a persistent Server-Sent Events
  // connection to resources/run_A2CA.py. A socket close is much more reliable than
  // pagehide when the entire browser application is terminated. A lightweight
  // heartbeat remains as a fallback and for reconnection/navigation handling.
  (function initLauncherLifecycle(){
    const isLocalLauncher=(location.protocol==='http:'||location.protocol==='https:') && /^(127\.0\.0\.1|localhost)$/i.test(location.hostname);
    if(!isLocalLauncher)return;
    // The application runs its workflow pages in an iframe. Tracking only the
    // top-level controller avoids duplicate lifecycle clients during navigation.
    if(global.top!==global.self)return;
    const CLIENT_KEY='a2ca_launcher_client_id_v2';
    let clientId='';
    try{clientId=sessionStorage.getItem(CLIENT_KEY)||'';}catch(e){}
    if(!clientId){
      clientId=(global.crypto&&typeof global.crypto.randomUUID==='function')?global.crypto.randomUUID():`a2ca-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try{sessionStorage.setItem(CLIENT_KEY,clientId);}catch(e){}
    }
    let stopped=false;
    let stream=null;
    const heartbeat=()=>{
      if(stopped)return;
      fetch(`/api/a2ca/heartbeat?client=${encodeURIComponent(clientId)}`,{method:'POST',cache:'no-store',keepalive:true}).catch(()=>{});
    };
    const openStream=()=>{
      if(stopped||!('EventSource' in global))return;
      try{
        if(stream)stream.close();
        stream=new EventSource(`/api/a2ca/stream?client=${encodeURIComponent(clientId)}`);
        // EventSource reconnects automatically after a transient disconnect.
        stream.onerror=()=>{};
      }catch(e){}
    };
    heartbeat();
    openStream();
    const timer=setInterval(heartbeat,5000);
    global.addEventListener('pageshow',()=>{heartbeat();if(!stream)openStream();});
    global.addEventListener('visibilitychange',()=>{if(!document.hidden)heartbeat();});
    global.addEventListener('pagehide',()=>{
      stopped=true;
      clearInterval(timer);
      try{if(stream){stream.close();stream=null;}}catch(e){}
      const url=`/api/a2ca/pagehide?client=${encodeURIComponent(clientId)}`;
      try{
        if(navigator.sendBeacon)navigator.sendBeacon(url,new Blob([], {type:'text/plain'}));
        else fetch(url,{method:'POST',cache:'no-store',keepalive:true}).catch(()=>{});
      }catch(e){}
    },{once:true});
  })();

  global.A2CA={SESSION_MARKER,SESSION_FILE_MARKER,SESSION_FILE_VERSION,AA_ORDER,DEFAULT_COLORS,DEFAULT_PROPERTIES,MAX_ALIGNMENT_SEQUENCES,MAX_ALIGNMENT_LENGTH,MAX_ALIGNMENT_CELLS,deepClone,escapeHtml,safeText,isHexColor,safeColor,csvSafeValue,delimitedCell,likelyNucleicAcid,readFile,cleanSequenceName,cleanTreeLabel,nameVariants,matchTreeName,validateTreeAlignment,parseFasta,parseFastaRaw,formatFasta,parsePdbSequences,detectStructureFormat,parseCifSequences,parseStructureSequences,parseStructureObservedResidues,matchPdbToAlignment,parseNewick,parseParameterCsv,leaves,walkTree,assignTreeCoordinates,drawEdges,htmlTable,propertyNames,saveSession,loadSession,clearSession,validateSessionData,serializeSessionFile,parseSessionFile,downloadText,downloadSvg,downloadPng,fetchWithTimeout,messageTargetOrigin,messageChannel,localPageUrl,postToParent,isTrustedParentMessage};
})(window);
