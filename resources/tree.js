'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const embedded=window.parent!==window;
  const params=new URLSearchParams(location.search);
  const allowedReturns=new Set(['upload_precomputed.html','upload_fasta.html','reference.html','analysis.html']);
  const returnPage=allowedReturns.has(params.get('return'))?params.get('return'):'analysis.html';
  let currentSession=null;

  function requestSession(){
    if(!embedded)return Promise.resolve(A2CA.loadSession());
    return new Promise(resolve=>{
      let settled=false;
      const handler=event=>{
        if(!A2CA.isTrustedParentMessage(event,'A2CA_SESSION'))return;
        if(settled)return;settled=true;window.removeEventListener('message',handler);resolve(event.data.data||A2CA.loadSession());
      };
      window.addEventListener('message',handler);
      A2CA.postToParent('A2CA_REQUEST_SESSION');
      setTimeout(()=>{if(settled)return;settled=true;window.removeEventListener('message',handler);resolve(A2CA.loadSession());},500);
    });
  }

  function configureBackLink(){
    const back=$('treeBackBtn');
    back.href=returnPage;
    back.textContent=returnPage==='analysis.html'?'Back to analysis':'Back';
  }

  function niceScaleLength(maxX){
    if(!(maxX>0))return 1;
    const raw=maxX/5;
    const pow=Math.pow(10,Math.floor(Math.log10(raw)));
    const norm=raw/pow;
    const nice=norm>=5?5:norm>=2?2:1;
    return nice*pow;
  }

  function renderTree(tree){
    const leaves=A2CA.assignTreeCoordinates(tree);
    const all=A2CA.walkTree(tree);
    const n=leaves.length;
    const width=1440,left=70,right=34,top=58,bottom=82;
    const rowStep=n<=12?42:n<=25?34:n<=50?27:n<=90?21:n<=150?16:13;
    const font=n<=15?17:n<=35?14:n<=70?12:n<=120?10:8.5;
    const height=Math.max(560,top+bottom+Math.max(1,n-1)*rowStep);
    const labelChar=font*.58;
    const maxLabel=Math.max(...leaves.map(l=>Math.min(420,Math.max(80,String(l.name||'').length*labelChar+12))),100);
    const treeWidth=Math.max(420,width-left-right-maxLabel-28);
    const maxX=Math.max(...all.map(x=>x.x),1);
    const sx=treeWidth/maxX,sy=(height-top-bottom)/Math.max(n-1,1);
    const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet" font-family="Arial, Helvetica, sans-serif">`];
    if(tree.children&&tree.children.length){
      const ys=tree.children.map(c=>top+c.y*sy);
      if(ys.length>1)parts.push(`<line x1="${left}" y1="${Math.min(...ys)}" x2="${left}" y2="${Math.max(...ys)}" stroke="black" stroke-width="0.9"/>`);
      const rootY=top+tree.y*sy;
      parts.push(`<line x1="${left-20}" y1="${rootY}" x2="${left}" y2="${rootY}" stroke="black" stroke-width="0.9"/>`);
    }
    A2CA.drawEdges(tree,parts,sx,sy,{left,top});
    for(const leaf of leaves){
      const x=left+leaf.x*sx+5;
      parts.push(`<text x="${x}" y="${top+leaf.y*sy+font*.35}" font-size="${font}" fill="#1f2933">${A2CA.escapeHtml(leaf.name)}</text>`);
    }
    const scale=niceScaleLength(maxX);
    const scalePx=scale*sx;
    const sx0=left,sy0=height-38;
    parts.push(`<line x1="${sx0}" y1="${sy0}" x2="${sx0+scalePx}" y2="${sy0}" stroke="#1f2933" stroke-width="1.5"/>`);
    parts.push(`<line x1="${sx0}" y1="${sy0-4}" x2="${sx0}" y2="${sy0+4}" stroke="#1f2933" stroke-width="1.5"/>`);
    parts.push(`<line x1="${sx0+scalePx}" y1="${sy0-4}" x2="${sx0+scalePx}" y2="${sy0+4}" stroke="#1f2933" stroke-width="1.5"/>`);
    parts.push(`<text x="${sx0+scalePx/2}" y="${sy0+19}" text-anchor="middle" font-size="12" fill="#526171">${Number(scale.toPrecision(3))}</text>`);
    parts.push('</svg>');
    $('treeView').innerHTML=parts.join('');
  }

  function render(session){
    currentSession=session||null;
    if(!session||!session.treeText){$('missingData').hidden=false;return;}
    try{
      const tree=A2CA.parseNewick(session.treeText);
      $('treeApp').hidden=false;
      $('treeSummary').textContent=`${session.treeFileName||'Loaded tree'} – ${A2CA.leaves(tree).length} terminal nodes.`;
      renderTree(tree);
    }catch(e){
      $('missingData').hidden=false;
      $('missingData').innerHTML=`<h2>Tree could not be restored</h2><p>${A2CA.escapeHtml(e.message)}</p><a class="button-link" href="upload.html">Go to upload</a>`;
    }
  }

  $('downloadTreeBtn').addEventListener('click',()=>{
    if(!currentSession?.treeText)return;
    const source=String(currentSession.treeFileName||'tree').replace(/\.[^.]+$/,'');
    const safe=source.replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'')||'tree';
    A2CA.downloadText(`A2CA_${safe}.nwk`,'text/plain;charset=utf-8',currentSession.treeText);
  });

  configureBackLink();
  requestSession().then(render);
})();
