// Simulated SDK tests. These prove routing logic, not real model execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { modelConfig, deviceOptions, parseResult } from '../docs/src/model-config.mjs';
import { buildPrompt } from '../docs/src/prompts.mjs';
const source=(await readFile(new URL('../docs/src/engine.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'').replace(/let debugToken = null;[\s\S]*?let app = null;/,'let debugToken = null; let app = null;');
const valid={letter_type:'Test fixture',who_from:'Example',plain_summary:'Synthetic fixture, not model output.',reassurance:'Check original.',actions:[],amounts:[],urgency:'routine',possible_scam:false};
function setup({local=false,failLocal=false,invalidLocal=false}={}) {
 const calls=[];
 const context={location:{hostname:'example.invalid'},self:{},console:{warn:()=>{}},modelConfig,deviceOptions,parseResult,buildPrompt,firebaseConfig:{},appCheckSiteKey:null,initializeApp:()=>({}),getAI:()=>({}),GoogleAIBackend:class{},InferenceMode:{ONLY_ON_DEVICE:'device',ONLY_IN_CLOUD:'cloud'},getGenerativeModel:(_,config)=>({initializeDeviceModel:async()=>{calls.push('initialize');if(failLocal)throw Error('Synthetic local failure')},generateContent:async()=>{calls.push(config.mode);return {response:{text:()=>JSON.stringify(invalidLocal&&config.mode==='device'?{}:valid)}}}})};
 if(local){context.self.LanguageModel={};context.LanguageModel={availability:async()=>'available'}}
 vm.createContext(context);vm.runInContext(source+';globalThis.explain=explainLetter',context);
 return {calls,explain:context.explain};
}
test('simulation: cloud is never called after decline',async()=>{const {calls,explain}=setup();await assert.rejects(explain({text:'fixture'},{shouldUseCloud:async()=>false}),e=>e.code==='cloud-declined');assert.deepEqual(calls,[])});
test('simulation: cloud is called only after approval',async()=>{const {calls,explain}=setup();const r=await explain({text:'fixture'},{shouldUseCloud:async()=>{assert.deepEqual(calls,[]);return true}});assert.equal(r.path,'cloud');assert.deepEqual(calls,['cloud'])});
test('simulation: local success makes no cloud call and asks no consent',async()=>{const {calls,explain}=setup({local:true});const r=await explain({text:'fixture'},{shouldUseCloud:async()=>{throw Error('Unexpected consent')}});assert.equal(r.path,'on-device');assert.deepEqual(calls,['initialize','device'])});
test('simulation: local failure does not silently fall back to cloud',async()=>{const {calls,explain}=setup({local:true,failLocal:true});await assert.rejects(explain({text:'fixture'},{shouldUseCloud:async()=>false}),e=>e.code==='cloud-declined');assert.deepEqual(calls,['initialize'])});
test('simulation: invalid local output is not presented as success',async()=>{const {calls,explain}=setup({local:true,invalidLocal:true});await assert.rejects(explain({text:'fixture'},{shouldUseCloud:async()=>false}),e=>e.code==='cloud-declined');assert.deepEqual(calls,['initialize','device'])});
test('simulation: missing consent gate blocks cloud',async()=>{const {calls,explain}=setup();await assert.rejects(explain({text:'fixture'}),e=>e.code==='cloud-needed');assert.deepEqual(calls,[])});
test('simulation: empty input does not invoke any model',async()=>{const {calls,explain}=setup();await assert.rejects(explain({}),/Nothing to explain/);assert.deepEqual(calls,[])});
