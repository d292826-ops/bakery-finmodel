import assert from 'node:assert/strict';
import {DEFAULTS,ZERO_DELTAS,calculate} from './dist/model.mjs';
import {analyzeMemo,experimentModel,trafficForProfit,cashBridge} from './dist/memo-model.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const p={...DEFAULTS},d={...ZERO_DELTAS},snapshot=JSON.stringify({p,d});
const a=analyzeMemo(p,d);
assert.equal(a.valid,true);near(a.m.netProfit,6743.547619047618);
near(a.stressModel.months[0].netProfit,-35443.95238095238);
assert.equal(a.breakEven.traffic,14761);assert.equal(a.target.traffic,16539);
for(const target of [0,50000,1000000])for(const month of [0,23]){
 const result=trafficForProfit(p,{...d,traffic:-100,conversion:10},target,month);
 assert.ok(result);const scenario={...d,traffic:0,conversion:10};
 assert.ok(calculate({...p,traffic:result.traffic},scenario).months[month].netProfit>=target);
 assert.ok(calculate({...p,traffic:result.traffic-1},scenario).months[month].netProfit<target);
}
for(const m of a.model.months){const bridge=cashBridge(m);near(m.netProfit+bridge.components.reduce((sum,r)=>sum+r.value,0),bridge.operatingCash);near(bridge.operatingCash-m.capex,m.netCashFlow);}
const original=calculate(p,d),empty=experimentModel(p,d);
assert.deepEqual(original,empty);
const combo=experimentModel(p,d,{traffic:5,averageCheck:5},10000);
near(combo.months[0].revenue,937500*1.05*1.05);
near(combo.months[0].netProfit,39985.73511904769);
const noBudget=experimentModel(p,d,{traffic:5,averageCheck:5});
near(noBudget.months[0].netProfit-combo.months[0].netProfit,10000);
near(noBudget.months[0].netCashFlow-combo.months[0].netCashFlow,10000);
near(combo.months[0].marketing,10000.5);
assert.equal(trafficForProfit({...p,conversion:0},d,50000),null);
assert.equal(trafficForProfit({...p,rawMaterialRate:95},d,50000),null);
assert.equal(trafficForProfit(p,d,1e12),null);
assert.equal(trafficForProfit(p,d,-1),null);
assert.equal(experimentModel(p,d,{},-1).valid,false);
assert.equal(experimentModel(p,d,{rawMaterialRate:300}).valid,false);
assert.equal(analyzeMemo({...p,traffic:NaN},d).valid,false);
assert.equal(analyzeMemo(p,d,0,50000,101).stressValid,false);
assert.equal(analyzeMemo(p,d,0,NaN,10).target,null);
assert.equal(analyzeMemo({...p,traffic:0},d).m.netMargin,null);
assert.equal(JSON.stringify({p,d}),snapshot);
console.log(JSON.stringify({passed:true,breakEvenTraffic:a.breakEven.traffic,target50000Traffic:a.target.traffic,stressProfit:a.stressModel.months[0].netProfit,comboAfter10000Budget:combo.months[0].netProfit,cashBridge:a.bridge.operatingCash}));
