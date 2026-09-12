const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
function setup(fetch) {
  let time = Date.now();
  const ctx = vm.createContext({ fetch, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    apiStatus: {}, console: { log() {}, error() {}, warn() {} }, Date: { now: () => time }, localStorage: {}, document: { getElementById() { return null; }, addEventListener() {} } });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../fiat.js'), 'utf8'), ctx);
  vm.runInContext(source.slice(0, source.indexOf('// PWA 添加到主屏幕功能')), ctx);
  return { run: code => vm.runInContext(code, ctx), ctx, tick: ms => { time += ms; } };
}
const reply = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });

test('legacy logos migrate only the trusted coin-image path; unsafe URLs are rejected', () => {
  const {run} = setup();
  assert.equal(run(`normalizeTokenLogo('https://assets.coingecko.com/coins/images/5/large/dogecoin.png?v=2')`), 'https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?v=2');
  assert.equal(run(`normalizeTokenLogo('https://assets.coingecko.com/reports/a.png')`), 'https://assets.coingecko.com/reports/a.png');
  for (const input of ['', 'javascript:alert(1)', 'http://example.com/a.png', 'https://user:pass@example.com/a.png']) {
    assert.equal(run(`normalizeTokenLogo(${JSON.stringify(input)})`), '');
  }
});
test('one batch, request deduplication, per-ID quotes and fresh cache reuse', async () => {
  const calls=[];
  const {run} = setup(async url => { calls.push(url); return reply({'same-a':{usd:2},'same-b':{usd:7}}); });
  const [a,b] = await Promise.all([run(`getCoinGeckoPrices(['same-a','same-b'])`),run(`getCoinGeckoPrices(['same-b','same-a'])`)]);
  assert.equal(calls.length,1);
  assert.equal(new URL(calls[0]).searchParams.get('ids'),'same-a,same-b');
  assert.equal(a.prices['same-a'],2); assert.equal(b.prices['same-b'],7);
  await run(`getCoinGeckoPrices(['same-a'])`);assert.equal(calls.length,1);
});
test('network failure uses bounded real cache, then expires without invented prices', async () => {
  let fail=false;
  const {run,tick} = setup(async()=>{if(fail)throw Error('offline');return reply({dogecoin:{usd:.25}});});
  await run(`getCoinGeckoPrices(['dogecoin'])`);fail=true;tick(61000);
  let r=await run(`getCoinGeckoPrices(['dogecoin'])`);
  assert.equal(r.prices.dogecoin,.25);assert.equal(r.staleIds[0],'dogecoin');
  tick(16*60000);r=await run(`getCoinGeckoPrices(['dogecoin'])`);
  assert.equal(r.prices.dogecoin,undefined);assert.equal(r.missingIds[0],'dogecoin');
});
test('429 imposes cooldown across search and price calls', async()=>{
  let calls=0;const {run,tick}=setup(async()=>{calls++;return reply({},429,{'Retry-After':'90'});});
  await run(`getCoinGeckoPrices(['dogecoin'])`);
  await assert.rejects(run(`fetchCoinGeckoJson('search',{query:'doge'})`),e=>e.status===429);
  assert.equal(calls,1);tick(91000);await run(`getCoinGeckoPrices(['dogecoin'])`);assert.equal(calls,2);
});
test('invalid, zero and outdated quotes never enter conversion prices',async()=>{
  const {run}=setup(async()=>reply({a:{usd:0},b:{usd:'12'},c:{usd:-2},d:{usd:4,last_updated_at:1},e:{usd:5}}));
  const r=await run(`getCoinGeckoPrices(['a','b','c','d','e'])`);
  assert.deepEqual(Object.keys(r.prices),['e']);assert.equal(r.missingIds.length,4);
});
test('malformed response does not overwrite cached price and marks it stale',async()=>{
  let calls=0;const {run}=setup(async()=>reply(++calls===1?{dogecoin:{usd:.2}}:{}));
  await run(`getCoinGeckoPrices(['dogecoin'])`);
  const r=await run(`getCoinGeckoPrices(['dogecoin'],{forceRefresh:true})`);
  assert.equal(r.prices.dogecoin,.2);assert.equal(r.staleIds[0],'dogecoin');
});
test('memory cache survives unavailable or quota-limited localStorage',()=>{
  const {run,ctx}=setup();ctx.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('quota');}};
  run(`localStorageAvailable=true;writeCache('x',{price:2})`);
  assert.equal(run(`readCache('x',60000).data.price`),2);
});
test('share rows include normalized custom-token logo',()=>{
  const {run,ctx}=setup();
  ctx.document.getElementById=id=>id==='amount1'?{value:'2'}:id==='currency1'?{value:'CUSTOM',querySelector(){return {getAttribute(key){return {'data-display-text':'DOGE','data-token-logo':'https://assets.coingecko.com/coins/images/5/large/dogecoin.png'}[key];}};}}:null;
  vm.runInContext(source.slice(source.indexOf('function getShareRows()'),source.indexOf('function formatShareTimestamp()')),ctx);
  const rows=run('getShareRows()');assert.equal(rows[0].logoType,'image');assert.equal(rows[0].label,'DOGE');assert.ok(rows[0].logo.startsWith('https://coin-images.coingecko.com/'));
});

test('all preset and active custom quotes share a batch; missing prices leave other conversions usable',async()=>{
  const calls=[];const {ctx,run}=setup(async url=>{calls.push(url);return reply({bitcoin:{usd:100000},ethereum:{usd:2000},solana:{usd:100},binancecoin:{usd:500},okb:{usd:50},'same-a':{usd:2},'same-b':{usd:7}});});
  ctx.customTokens=new Map([['CG:same-a',{id:'same-a'}],['CG:same-b',{id:'same-b'}]]);
  ctx.window={};ctx.setInterval=()=>1;ctx.convert=()=>{};ctx.updateApiStatusDisplay=()=>{};
  ctx.document.getElementById=id=>id.startsWith('amount')?{value:''}:id==='currency1'||id==='currency2'?{value:'CUSTOM',querySelector(){return {getAttribute(){return id==='currency1'?'CG:same-a':'CG:same-b';}};}}:{value:'USD'};
  vm.runInContext(source.slice(source.indexOf('async function loadRates({'),source.indexOf('// 检测 localStorage 是否可用')),ctx);
  run(`getFiatRates=async()=>({fiatData:{rates:{CNY:7,HKD:7.8,TWD:32,JPY:150,KRW:1300,SGD:1.3,AED:3.67,MYR:4.3}},source:'realtime'})`);
  await run('loadRates()');assert.equal(calls.length,1);assert.equal(run(`usdPrices['CG:same-a']`),2);assert.equal(run(`usdPrices['CG:same-b']`),7);assert.equal(run('usdPrices.IPHONE_DUO'),2000);
  run(`getCoinGeckoPrices=async()=>({prices:{},staleIds:[],missingIds:['bitcoin']});getFiatRates=async()=>{throw Error('offline')}`);
  await run('loadRates()');assert.equal(run('usdPrices.USD'),1);assert.equal(run('usdPrices.BTC'),undefined);assert.equal(run(`usdPrices['CG:same-a']`),undefined);assert.equal(run('usdPrices.IPHONE18_PRO'),1199);
});

test('restored token ID avoids symbol collisions; saved estimated quotes are discarded',()=>{
  const {ctx,run}=setup();ctx.customTokens=new Map();ctx.updateSelectDisplay=()=>{};
  const attrs={};const els={};for(let i=1;i<=6;i++){els['amount'+i]={value:''};els['currency'+i]={value:'USD',setAttribute(){},querySelector(){return {setAttribute(k,v){attrs[i+':'+k]=v;}};}};}ctx.document.getElementById=id=>els[id];
  const state={currency1:'CUSTOM',amount1:'2',customToken1:{tokenKey:'BTC',tokenLogo:'https://assets.coingecko.com/coins/images/5/large/dogecoin.png'},customTokens:[['BTC',{id:'unrelated-token',symbol:'BTC',price:50,isEstimated:true}]]};
  ctx.localStorage={getItem:()=>JSON.stringify(state)};
  vm.runInContext(source.slice(source.indexOf('function restoreState()'),source.indexOf('function convert(sourceIndex)')),ctx);
  run('restoreState()');assert.equal(attrs['1:data-token-key'],'CG:unrelated-token');assert.equal(ctx.customTokens.get('CG:unrelated-token').price,null);assert.ok(attrs['1:data-token-logo'].startsWith('https://coin-images.coingecko.com/'));
});

test('removed products restore their dollar value without changing active products',()=>{
  const {ctx,run}=setup();ctx.customTokens=new Map();ctx.updateSelectDisplay=()=>{};
  const els={};for(let i=1;i<=6;i++){els['amount'+i]={value:''};els['currency'+i]={value:'USD',setAttribute(){}};}
  ctx.document.getElementById=id=>els[id];
  ctx.localStorage={getItem:()=>JSON.stringify({currency1:'MACBOOK',amount1:'2',currency2:'IPHONE17',amount2:'3',currency3:'KFC',amount3:'4'})};
  vm.runInContext(source.slice(source.indexOf('function restoreState()'),source.indexOf('function convert(sourceIndex)')),ctx);
  run('restoreState()');
  assert.equal(els.currency1.value,'USD');assert.equal(els.amount1.value,'1,998');
  assert.equal(els.currency2.value,'USD');assert.equal(els.amount2.value,'2,397');
  assert.equal(els.currency3.value,'KFC');assert.equal(els.amount3.value,'4');
  assert.equal(run(`ASSET_CONFIG.some(asset=>asset.symbol==='MACBOOK')`),false);
});

test('share export keeps good logos and skips failed logos; successful images are reused',async()=>{
  let calls=0;const {ctx,run}=setup(async url=>{calls++;if(url==='broken.png')throw Error('network failure');return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/png'}});});
  ctx.URL={createObjectURL:()=> 'blob:test',revokeObjectURL(){}};
  ctx.Image=class {set src(value){if(value)queueMicrotask(()=>this.onload());}};
  vm.runInContext(source.slice(source.indexOf('const shareLogoCache ='),source.indexOf('// 行是否有可绘制的 logo')),ctx);
  const result=await run(`preloadShareLogoBitmaps([{logoType:'image',logo:'good.png'},{logoType:'image',logo:'broken.png'}])`);
  assert.ok(result.get('good.png'));assert.equal(result.get('broken.png'),null);
  await run(`preloadShareLogoBitmaps([{logoType:'image',logo:'good.png'}])`);assert.equal(calls,2);
});

test('out-of-order searches and responses after closing the modal cannot replace current results',async()=>{
  const {ctx,run}=setup();const pending={};let displayed=[];
  const nodes={tokenSearchInput:{value:'old'},loadingIndicator:{style:{}},searchResults:{replaceChildren(){},prepend(){}}};
  ctx.document.getElementById=id=>nodes[id];ctx.currentSelectId='currency1';ctx.tokenSearchSessionCache=new Map();
  vm.runInContext(source.slice(source.indexOf('let tokenSearchVersion ='),source.indexOf('// 搜索防抖')),ctx);
  run('let searchTimeout;');ctx.getLocalTokenResults=()=>[];
  run(`fetchCoinGeckoJson=(path,params)=>new Promise(resolve=>pending[params.query]=resolve);displaySearchResults=coins=>record(coins)`);
  ctx.pending=pending;ctx.record=coins=>{displayed=coins;};
  const first=run('searchTokens()');nodes.tokenSearchInput.value='new';run('invalidateTokenSearch()');const second=run('searchTokens()');
  pending.new({coins:[{id:'new',name:'New',symbol:'NEW'}]});await second;
  pending.old({coins:[{id:'old',name:'Old',symbol:'OLD'}]});await first;assert.equal(displayed[0].id,'new');
  nodes.tokenSearchInput.value='closing';const third=run('searchTokens()');ctx.currentSelectId=null;run('invalidateTokenSearch()');pending.closing({coins:[{id:'closing',name:'Close',symbol:'CLOSE'}]});await third;assert.equal(displayed[0].id,'new');
});

test('fiat catalog validates rates and searches Chinese, English, aliases and currency codes',()=>{
  const {run}=setup();
  run(`updateFiatCatalog({USD:1,EUR:.9,MYR:4.2,GBP:.8,ZAR:18,ZERO:0,JPY:0,BAD:-1,NAN:'2','<x>':1})`);
  assert.equal(run('fiatCatalog.length'),5);
  for(const query of ['欧元','euro','eur']) assert.equal(run(`findFiatCurrencies(${JSON.stringify(query)})[0].code`),'EUR');
  assert.equal(run(`findFiatCurrencies('马币')[0].code`),'MYR');
  assert.equal(run(`getFiatLogo('EUR')`),'assets/logos/fiat/european_union.svg');
  assert.ok(run(`getFiatLogo('XDR')`).startsWith('data:image/svg+xml;'));
  assert.equal(run(`getFiatLogo('<x>')`),'');
});

test('custom fiat quotes refresh independently of crypto and disappear when unavailable',async()=>{
  const {ctx,run}=setup(async()=>reply({}));
  ctx.customTokens=new Map();ctx.window={};ctx.setInterval=()=>1;ctx.convert=()=>{};ctx.updateApiStatusDisplay=()=>{};
  ctx.document.getElementById=id=>id.startsWith('amount')?{value:''}:{value:'FIAT:EUR'};
  vm.runInContext(source.slice(source.indexOf('async function loadRates({'),source.indexOf('// 检测 localStorage 是否可用')),ctx);
  run(`getCoinGeckoPrices=async()=>({prices:{bitcoin:100000},staleIds:[],missingIds:[]});getFiatRates=async()=>({fiatData:{rates:{USD:1,EUR:.8,BTC:2}},source:'realtime'})`);
  await run('loadRates()');
  assert.equal(run(`usdPrices['FIAT:EUR']`),1.25);
  assert.equal(run('usdPrices.BTC'),100000);assert.equal(run(`usdPrices['FIAT:BTC']`),.5);
  assert.equal(run(`getConversionRate('FIAT:EUR','USD')`),1.25);
  run(`getFiatRates=async()=>({fiatData:{rates:{EUR:.5}},source:'stale-cache'})`);
  await run('loadRates()');assert.equal(run(`usdPrices['FIAT:EUR']`),2);assert.equal(run('fiatCatalogStale'),true);
  run(`getFiatRates=async()=>{throw Error('offline')}`);
  await run('loadRates()');assert.equal(run(`usdPrices['FIAT:EUR']`),undefined);assert.equal(run('fiatCatalog.length'),0);
});

test('saved custom fiat is recreated before selection and retains its share logo',()=>{
  const {ctx,run}=setup();ctx.customTokens=new Map();ctx.updateSelectDisplay=()=>{};
  const els={};for(let i=1;i<=6;i++){
    let value='USD';const options=[{value:'USD'}];
    els['amount'+i]={value:''};
    els['currency'+i]={options,setAttribute(){},get value(){return value},set value(v){value=options.some(o=>o.value===v)?v:''},querySelector(){return {appendChild:o=>options.push(o)}}};
  }
  ctx.document.createElement=()=>({});ctx.document.getElementById=id=>els[id];
  ctx.localStorage={getItem:()=>JSON.stringify({currency1:'FIAT:EUR',amount1:'123'})};
  vm.runInContext(source.slice(source.indexOf('function restoreState()'),source.indexOf('function convert(sourceIndex)')),ctx);
  run('restoreState()');assert.equal(els.currency1.value,'FIAT:EUR');assert.equal(els.amount1.value,'123');
  run(`ensureFiatOption(document.getElementById('currency1'),'EUR')`);assert.equal(els.currency1.options.length,2);
  vm.runInContext(source.slice(source.indexOf('function getShareRows()'),source.indexOf('function formatShareTimestamp()')),ctx);
  const row=run('getShareRows()[0]');assert.equal(row.label,'EUR');assert.equal(row.logoType,'image');assert.equal(row.logo,'assets/logos/fiat/european_union.svg');
});

test('choosing a custom target fiat preserves the last entered source field',()=>{
  const {ctx,run}=setup();
  const options=[];const select={value:'USD',options,setAttribute(){},querySelector(){return {appendChild:o=>options.push(o)}}};
  ctx.document.createElement=()=>({});ctx.document.getElementById=()=>select;
  ctx.updateSelectDisplay=()=>{};ctx.saveState=()=>{};
  let sourceField;ctx.convert=index=>{sourceField=index;};
  run(`closeCustomFiatModal=()=>{fiatPickerSelectId=null;};updateFiatCatalog({EUR:.8});usdPrices={'FIAT:EUR':1.25};lastInputField=1;fiatPickerSelectId='currency2';selectCustomFiat('EUR')`);
  assert.equal(select.value,'FIAT:EUR');assert.equal(sourceField,1);
});

test('touch fiat picker leaves search unfocused and ignores stale opening callbacks',()=>{
  const {ctx,run}=setup();let coarse=true;const focused=[];const frames=[];
  const close={focus:()=>focused.push('close')};
  const modal={style:{},setAttribute(){},querySelector:()=>close};
  const input={value:'',focus:()=>focused.push('search')};
  const select={parentElement:{querySelector:()=>null}};
  ctx.window={matchMedia:()=>({matches:coarse})};ctx.requestAnimationFrame=fn=>frames.push(fn);
  ctx.document.getElementById=id=>id==='customFiatModal'?modal:id==='fiatSearchInput'?input:select;
  ctx.closeAllDropdowns=()=>{};ctx.syncModalScrollLock=()=>{};
  run(`renderFiatResults=()=>{};updateFiatCatalog({USD:1});openCustomFiatModal('currency1')`);
  frames.shift()();assert.deepEqual(focused,['close']);
  coarse=false;run(`openCustomFiatModal('currency1')`);frames.shift()();assert.deepEqual(focused,['close','search']);
  run(`openCustomFiatModal('currency1');closeCustomFiatModal();openCustomFiatModal('currency1')`);
  frames.shift()();assert.equal(focused.length,2);
  frames.shift()();assert.equal(focused.length,3);
});
