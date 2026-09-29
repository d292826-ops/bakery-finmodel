import {calculate, ZERO_DELTAS, DELTA_KEYS} from './model.mjs';

// Sensitivity changes inputs only. All P&L formulas remain in calculate().
export const FACTORS = Object.freeze([
 {key:'traffic',label:'Посещаемость',unit:'посетителей/мес.'},
 {key:'conversion',label:'Конверсия в покупку',unit:'%'},
 {key:'averageCheck',label:'Средний чек',unit:'₽/покупку'},
 {key:'rawMaterialRate',label:'Затраты на сырьё',unit:'% от выручки'},
 {key:'payroll',label:'Общий ФОТ',unit:'₽/мес.'},
 {key:'rent',label:'Аренда',unit:'₽/мес.'},
 {key:'utilities',label:'Коммунальные расходы',unit:'₽/мес.'},
 {key:'marketing',label:'Маркетинг',unit:'₽/мес.'},
 {key:'otherExpenses',label:'Прочие расходы',unit:'₽/мес.'},
 {key:'aggregatorRate',label:'Комиссия агрегаторов',unit:'% от выручки доставки'}
]);
export function factorValue(params,deltas,key){
 const value=key==='payroll'?params.payroll1+params.payroll2+params.payroll3:params[key];
 return value*(1+(deltas[key]??0)/100);
}
export function sensitivityPoint(params,deltas=ZERO_DELTAS,shocks={},month=0){
 const baseline=calculate(params,deltas);
 const fail=message=>({valid:false,errors:[{message}],profit:null,margin:null});
 if(!baseline.valid)return {...baseline,profit:null,margin:null};
 if(!Number.isInteger(month)||month<0||month>=baseline.months.length)return fail('Месяц вне горизонта расчёта.');
 const changed={...params},changedDeltas={...deltas};
 for(const [key,shift] of Object.entries(shocks)){
  if(!FACTORS.some(f=>f.key===key)||!Number.isFinite(shift)||shift< -100)return fail('Изменение должно быть числом не меньше −100%.');
  const multiplier=1+shift/100;
  if(DELTA_KEYS.includes(key))changedDeltas[key]=deltas[key]+shift+deltas[key]*shift/100;
  else changed[key]*=multiplier;
 }
 // Keep scenario deltas separate: shocks compound with the chosen scenario.
 const model=Object.keys(shocks).length?calculate(changed,changedDeltas):baseline;
 if(!model.valid)return {...model,profit:null,margin:null};
 const result=model.months[month],original=baseline.months[month];
 return {valid:true,errors:[],profit:result.netProfit,margin:result.netMargin,revenue:result.revenue,delta:result.netProfit-original.netProfit,values:Object.fromEntries(FACTORS.map(f=>[f.key,factorValue(changed,changedDeltas,f.key)]))};
}
export function tornadoRows(params,deltas,magnitude,month=0){
 return FACTORS.map(f=>{
  const lower=sensitivityPoint(params,deltas,{[f.key]:-magnitude},month);
  const upper=sensitivityPoint(params,deltas,{[f.key]:magnitude},month);
  return {...f,lower,upper,impact:Math.max(lower.valid?Math.abs(lower.delta):0,upper.valid?Math.abs(upper.delta):0)};
 }).sort((a,b)=>b.impact-a.impact);
}
