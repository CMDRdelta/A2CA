'use strict';
(function(global){
  const A2CA=global.A2CA;
  if(!A2CA)throw new Error('a2ca-core.js must be loaded before a2ca-services.js');

  const sleep=ms=>new Promise(resolve=>global.setTimeout(resolve,ms));

  function serviceErrorMessage(status,body,label){
    const detail=String(body||'').trim();
    if(status===400)return detail||`${label} rejected the submitted data as invalid.`;
    if(status===413)return detail||`${label} input exceeds the server safety limit.`;
    if(status===429)return detail||`${label} is busy or rate-limited. Retry shortly.`;
    if(status===502)return detail||`${label} execution failed on the server.`;
    if(status===503)return detail||`${label} is unavailable in the server runtime.`;
    if(status===504)return detail||`${label} exceeded the server runtime limit. Try fewer or shorter sequences.`;
    return detail||`${label} returned HTTP ${status}`;
  }

  async function postText(endpoint,text,{timeoutMs=330000,retries=2,label='A2CA service'}={}){
    let lastError=null;
    for(let attempt=0;attempt<=retries;attempt++){
      const response=await A2CA.fetchWithTimeout(endpoint,{
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=UTF-8'},
        body:text,
        cache:'no-store'
      },timeoutMs);
      const body=await response.text();
      if(response.ok)return body;

      const message=serviceErrorMessage(response.status,body,label);
      const retryable=response.status===429;
      if(!retryable||attempt===retries)throw new Error(message);
      const retryAfter=Number(response.headers.get('Retry-After'));
      const delayMs=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,15000):Math.min(15000,1500*(attempt+1));
      lastError=new Error(message);
      await sleep(delayMs);
    }
    throw lastError||new Error(`${label} failed.`);
  }

  async function runMafft(records){
    const fasta=typeof records==='string'?records:A2CA.formatFasta(records);
    const input=typeof records==='string'?A2CA.parseFastaRaw(records):records;
    const text=await postText('/api/mafft',fasta,{timeoutMs:330000,retries:2,label:'MAFFT'});
    let alignment;
    try{alignment=A2CA.parseFasta(text);}
    catch(error){throw new Error(`MAFFT returned an invalid alignment: ${error.message}`);}

    const expected=Object.keys(input||{}).sort();
    const actual=Object.keys(alignment).sort();
    if(expected.length!==actual.length||expected.some((name,i)=>name!==actual[i])){
      throw new Error('MAFFT output does not contain the same sequence identifiers as the input.');
    }
    const meta=await A2CA.getAppMeta().catch(()=>null);
    return {
      alignment,
      alignmentText:text.trim()+'\n',
      resultType:'server-mafft-auto-amino-anysymbol',
      toolVersion:meta?.tools?.mafft?.version||'unknown',
      arguments:['--auto','--amino','--anysymbol','--quiet']
    };
  }

  async function runFastTree(alignmentText){
    const text=await postText('/api/fasttree',alignmentText,{timeoutMs:210000,retries:2,label:'FastTree'});
    let tree;
    try{tree=A2CA.parseNewick(text);}
    catch(error){throw new Error(`FastTree returned an invalid Newick tree: ${error.message}`);}
    const meta=await A2CA.getAppMeta().catch(()=>null);
    return {
      tree,
      treeText:text.trim()+'\n',
      resultType:'server-fasttree',
      toolVersion:meta?.tools?.fasttree?.version||'unknown',
      arguments:['-quiet']
    };
  }

  A2CA.services=Object.freeze({postText,runMafft,runFastTree});
})(window);
