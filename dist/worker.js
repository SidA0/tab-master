import {analyzeStep} from './analyzer.js';
self.onmessage=event=>{
  try { const result=analyzeStep(event.data); self.postMessage({ok:true,result}); }
  catch(error) { self.postMessage({ok:false,error:error.message}); }
};
