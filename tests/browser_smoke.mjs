import { chromium } from 'playwright';

const baseUrl=process.env.A2CA_BASE_URL||'http://127.0.0.1:8765';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
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
} finally {
  await browser.close();
}
