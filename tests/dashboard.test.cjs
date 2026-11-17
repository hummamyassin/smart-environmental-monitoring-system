// Recovery-authored tests. Firebase is simulated; these are not cloud/hardware tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../web-dashboard/frontend/script.js'), 'utf8');
function setup(config) {
  const nodes = new Map();
  function element() {
    return {textContent:'', innerHTML:'', style:{}, children:[],
      classList:{add(){},remove(){},toggle(){}},
      append(...children){this.children.push(...children)},
      prepend(child){this.children.unshift(child)},
      removeChild(child){this.children.splice(this.children.indexOf(child),1)},
      get lastChild(){return this.children.at(-1)}, addEventListener(){}};
  }
  let success, failure, initialized = 0;
  const timers = new Set();
  const context = vm.createContext({
    window: {SEMS_FIREBASE_CONFIG:config},
    document:{addEventListener(){},createElement:element,
      getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)}},
    console:{error(){}}, Date, Math,
    setInterval(fn){timers.add(fn);return fn},clearInterval(fn){timers.delete(fn)},
    firebase:{
      initializeApp(){initialized++},
      database(){
        return {ref(p){
          assert.equal(p,'sensors/latest');
          return {on(event,ok,err){assert.equal(event,'value');success=ok;failure=err}};
        }};
      }
    },
    Chart:class {constructor(el,opts){this.data=opts.data} update(){}}
  });
  vm.runInContext(source,context);
  const run = expression => vm.runInContext(expression,context);
  run('cacheDom(); initCharts();');
  return {run,nodes,timers,success:data=>success({val:()=>data}),failure:message=>failure({message}),get initialized(){return initialized}};
}
const config={apiKey:'fixture-key',databaseURL:'https://fixture.invalid'};
const reading={temperature:24,humidity:55,airQuality:700,dust:0.02,sound:450,fan:false,dhtOk:true,mqWarmupDone:true,timestamp:5000};
test('missing configuration uses labelled fallback without contacting Firebase',()=>{
  const s=setup();s.run('startFirebaseLiveData()');
  assert.equal(s.initialized,0);assert.equal(s.nodes.get('connLabel').textContent,'FALLBACK DATA');
  assert.equal(s.run('state.cycleCount'),1);assert.equal(s.timers.size,1);
});
test('current firmware payload maps to live cards and bounded charts',()=>{
  const s=setup(config);s.run('startFirebaseLiveData()');
  for(let i=0;i<30;i++)s.success({...reading,temperature:24+i/10});
  assert.equal(s.nodes.get('connLabel').textContent,'FIREBASE LIVE');
  assert.equal(s.nodes.get('val-air').textContent,'700');
  assert.equal(s.run('state.meta.timestamp'),5000);
  assert.equal(s.run('state.history.temp.length'),20);
  assert.equal(s.run('state.cycleCount'),30);
});
test('empty snapshot after live data relabels fallback and resumes live cleanly',()=>{
  const s=setup(config);s.run('startFirebaseLiveData()');s.success(reading);s.success(null);
  assert.equal(s.nodes.get('connLabel').textContent,'FALLBACK DATA');
  assert.equal(s.run('firebaseConnected'),false);assert.equal(s.timers.size,1);
  s.success(null);assert.equal(s.timers.size,1);
  s.success(reading);assert.equal(s.timers.size,0);
  assert.equal(s.nodes.get('connLabel').textContent,'FIREBASE LIVE');
});
test('read error enters fallback and error text is not inserted as HTML',()=>{
  const s=setup(config);s.run('startFirebaseLiveData()');s.success(reading);
  s.failure('<img src=x onerror=alert(1)>');
  assert.equal(s.nodes.get('connLabel').textContent,'FALLBACK DATA');
  const entries=s.nodes.get('eventLogList').children;
  assert.ok(entries.some(e=>e.children.some(c=>c.textContent.includes('<img'))));
  assert.ok(entries.every(e=>e.innerHTML===''));
});
test('threshold boundaries and uploaded fan state are respected',()=>{
  const s=setup(config);s.run('startFirebaseLiveData()');
  assert.equal(s.run('getLevel(24.9,25,28)'),'safe');
  assert.equal(s.run('getLevel(25,25,28)'),'warn');
  assert.equal(s.run('getLevel(28,25,28)'),'danger');
  assert.equal(s.run('getHumLevel(50)'),'warn');
  s.success({...reading,temperature:40,fan:false});
  assert.equal(s.nodes.get('badge-temp').textContent,'DANGER');
  assert.equal(s.nodes.get('badge-fan').textContent,'OFF');
});
