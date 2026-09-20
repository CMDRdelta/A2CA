'use strict';
(function(){
  const $=id=>document.getElementById(id);

  function start(session){
    if(!session||!session.alignmentText||!session.treeText){
      $('missingData').hidden=false;
      return;
    }

    const analysisState=session.analysisState||{};
    let customProperties=analysisState.customProperties||A2CA.deepClone(A2CA.DEFAULT_PROPERTIES);
    let mode=analysisState.customParameterMode==='custom'?'custom':'default';
    $('parameterApp').hidden=false;

    function activeProperties(){return mode==='custom'?customProperties:A2CA.DEFAULT_PROPERTIES;}

    function objectPropertyTable(obj){
      const aas=Object.keys(obj);
      if(!aas.length)return '<p class="muted">No data available.</p>';
      return A2CA.htmlTable(aas.map(aa=>Object.assign({AA:aa},obj[aa])));
    }

    function persist(auditText){
      const old=session.analysisState||{};
      const names=A2CA.propertyNames(activeProperties());
      let selectedParameter=old.selectedParameter||names[0]||'';
      if(!names.includes(selectedParameter))selectedParameter=names[0]||'';
      const data={
        ...session,
        analysisState:{
          ...old,
          customParameterMode:mode,
          customProperties,
          selectedParameter,
          audit:auditText||old.audit||'Amino acid parameter settings updated.'
        }
      };
      session=data;
      A2CA.session.publish(data);
    }

    function render(message){
      $('parameterStatus').className='status good';
      $('parameterStatus').textContent=message||`Active property source: ${mode==='custom'?'custom parameter file':'default amino acid parameters'}.`;
      $('propertyTable').innerHTML=objectPropertyTable(activeProperties());
    }

    $('loadParameterBtn').onclick=async()=>{
      try{
        customProperties=A2CA.parseParameterCsv(await A2CA.readFile($('ParameterFile')));
        mode='custom';
        persist('Custom amino acid parameter file loaded.');
        render('Custom parameter file loaded and activated.');
      }catch(e){
        $('parameterStatus').className='status bad';
        $('parameterStatus').textContent='Error: '+e.message;
      }
    };

    $('useDefaultBtn').onclick=()=>{
      mode='default';
      persist('Default amino acid parameters activated.');
      render('Default amino acid parameters are active.');
    };

    render();
  }

  A2CA.session.request().then(start);
})();
