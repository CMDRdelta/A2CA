import { chromium } from 'playwright';

const baseUrl=process.env.A2CA_BASE_URL||'http://127.0.0.1:8765';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();

  // Public license route must expose the repository LICENSE directly.
  const licenseResponse=await page.request.get(`${baseUrl}/LICENSE`);
  if(!licenseResponse.ok())throw new Error(`/LICENSE returned HTTP ${licenseResponse.status()}`);
  const licenseText=await licenseResponse.text();
  if(!licenseText.includes('PolyForm Noncommercial License 1.0.0'))throw new Error('/LICENSE did not return the PolyForm license text.');

  // Landing page: current version copy and cache-busted first-party assets.
  await page.goto(`${baseUrl}/resources/upload.html?new=1`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('[data-a2ca-version]')?.textContent==='2.0.44');
  const heading=(await page.textContent('.start-version-card h2'))||'';
  if(!heading.includes('Web version 2.0.44')||/open beta/i.test(heading))throw new Error(`Unexpected landing-page version heading: ${heading}`);
  for(const selector of ['link[rel="stylesheet"]','script[src="a2ca-core.js?v=2.0.44"]','img[src="assets/introduction.png?v=2.0.44"]']){
    if(!(await page.$(selector)))throw new Error(`Missing cache-busted landing asset: ${selector}`);
  }

  // BLAST page: no user email field, common footer is present, and a valid protein query enables the run button.
  await page.goto(`${baseUrl}/resources/upload_single.html`,{waitUntil:'domcontentloaded'});
  if(!(await page.$('footer[aria-label="A2CA version and usage information"]')))throw new Error('Common A2CA footer is missing from upload_single.html.');
  if((await page.getAttribute('footer a[href="/LICENSE"]','href'))!=='/LICENSE')throw new Error('Common footer does not link to /LICENSE.');
  if(await page.$('#ncbiEmail'))throw new Error('The removed NCBI email field is still present.');
  await page.fill('#queryText','MSTNPKPQRKTKRNTNRRPQDVKFPGGGQIVGGVYLLPRRGPRLG');
  await page.waitForFunction(()=>!document.getElementById('runBlastBtn')?.disabled);
  const blastStatus=(await page.textContent('#queryValidation'))||'';
  if(!/Ready for NCBI BLAST/.test(blastStatus))throw new Error(`BLAST query did not become ready without an email field: ${blastStatus}`);

  // FASTA workflow still completes through the real MAFFT/FastTree endpoints.
  await page.goto(`${baseUrl}/resources/upload_fasta.html`,{waitUntil:'domcontentloaded'});
  const fasta=`>seq1\nMSTNPKPQRKTKRNTNRRPQDVKFPGGGQIVGGVYLLPRRGPRLG\n>seq2\nMSTNPKPQRKTKRNTNRRPQDVKFPGGGQIVGGIYLLPRRGPRLG\n>seq3\nMSTNPKPQRKTKRNTNRRPQDVKFPGGGQIVAGVYLLPRRGPRLG\n`;
  await page.fill('#fastaText',fasta);
  await page.click('#runPipelineBtn');
  await page.waitForFunction(()=>{
    const el=document.getElementById('pipelineStatus');
    return el&&(/Ready:/.test(el.textContent||'')||/Error:/.test(el.textContent||''));
  },{timeout:180000});
  const status=(await page.textContent('#pipelineStatus'))||'';
  if(!status.includes('Ready:'))throw new Error(`FASTA browser workflow failed: ${status}`);
  if(await page.isDisabled('#continueBtn'))throw new Error('Continue button remained disabled after FASTA pipeline completion.');

  // Imported sessions open analysis, keep project/file naming independent, and New analysis clears the file input.
  await page.goto(`${baseUrl}/resources/upload.html?new=1`,{waitUntil:'domcontentloaded'});
  const session={
    format:'A2CA_SESSION_FILE',
    formatVersion:1,
    appVersion:'2.0.44',
    savedAt:new Date().toISOString(),
    data:{
      alignmentText:fasta,
      treeText:'(seq1:0.1,seq2:0.1,seq3:0.1);',
      alignmentFileName:'test.fasta',
      treeFileName:'test.nwk',
      structureText:'',
      structureFileName:'',
      structureFormat:'',
      selectedStructureChain:'',
      structurePdbId:'',
      structureMatches:[],
      inputWorkflow:'precomputed',
      analysisState:{selectedSequence:'seq1',selectedPositions:[],projectName:''}
    }
  };
  await page.setInputFiles('#sessionFileInput',{
    name:'test-session.a2ca',
    mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(session))
  });
  await page.waitForFunction(()=>document.getElementById('appFrame')?.src.includes('analysis.html'),{timeout:30000});
  const frame=page.frames().find(candidate=>candidate.url().includes('/resources/analysis.html'));
  if(!frame)throw new Error('Session import did not open analysis.html in the app frame.');
  await frame.waitForSelector('#treePlot svg',{timeout:30000});

  await frame.fill('#sessionProjectName','Project Alpha');
  await frame.fill('#downloadPrefix','tree fig');
  await frame.click('#correlationModule > summary');
  await frame.fill('#correlationDownloadPrefix','corr fig');
  if(await frame.inputValue('#downloadProjectName')!=='Project Alpha')throw new Error('Tree download project field did not mirror the session project name.');
  if(await frame.inputValue('#correlationDownloadProjectName')!=='Project Alpha')throw new Error('Correlation download project field did not mirror the session project name.');
  if(await frame.inputValue('#downloadPrefix')!=='tree fig'||await frame.inputValue('#correlationDownloadPrefix')!=='corr fig')throw new Error('Project-name changes modified independent file-name fields.');
  if(!(await frame.getAttribute('#downloadProjectName','readonly'))&&!(await frame.$eval('#downloadProjectName',el=>el.readOnly)))throw new Error('Tree project-name field is not readonly.');

  const downloadPromise=page.waitForEvent('download');
  await frame.click('#downloadImageBtn');
  const download=await downloadPromise;
  const filename=download.suggestedFilename();
  if(!/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_Project_Alpha_tree_fig_tree\.svg$/.test(filename)){
    throw new Error(`Unexpected tree download filename: ${filename}`);
  }

  await frame.click('#newAnalysisBtn');
  await page.waitForFunction(()=>!document.getElementById('startView')?.hidden&&document.getElementById('appFrame')?.hidden,{timeout:10000});
  if(await page.inputValue('#sessionFileInput')!=='')throw new Error('New analysis did not clear the imported session file input.');
  if(!(await page.$eval('#sessionImportStatus',el=>el.hidden)))throw new Error('New analysis did not clear the imported session status.');
}finally{
  await browser.close();
}
