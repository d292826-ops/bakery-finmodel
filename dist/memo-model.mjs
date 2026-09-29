import {calculate,ZERO_DELTAS,DELTA_KEYS} from './model.mjs';
import {FACTORS} from './sensitivity-model.mjs';

export const SOLUTIONS=[
 {key:'traffic',title:'Привлечь больше посетителей',shift:5,action:'Провести короткий тест локального продвижения и измерить дополнительные визиты и покупки.',check:'Рост посещаемости сам по себе не гарантирует рост покупок. Сравните конверсию и учтите расходы на продвижение.'},
 {key:'averageCheck',title:'Увеличить средний чек',shift:5,action:'Проверить наборы «напиток + выпечка» и дополнительные позиции к заказу на небольшой группе покупателей.',check:'Сравните прибыль с заказа и число покупок. Рост чека в модели не снижает конверсию автоматически.'},
 {key:'rawMaterialRate',title:'Снизить долю сырья',shift:-5,action:'Разобрать списания и выход продукции по основным позициям; проверить закупочные условия и размеры партий.',check:'Снижайте потери, сохраняя качество. Изменение −5% от доли 35% означает 33,25% выручки, а не 30%.'},
 {key:'rent',title:'Пересмотреть аренду',shift:-5,action:'Обсудить с арендодателем ставку или условия; сначала оценить возможность остаться в текущем помещении.',check:'Экономия зависит от переговоров. Переезд и его разовые затраты в этот тест не включены.'}
];
export function experimentModel(params,deltas=ZERO_DELTAS,changes={},budget=0){
 const original=calculate(params,deltas);
 if(!original.valid)return original;
 const fail=message=>({valid:false,errors:[{message}],months:[],metrics:null});
 if(!Number.isFinite(budget)||budget<0)return fail('Бюджет внедрения должен быть неотрицательной суммой в ₽/мес.');
 const p={...params},d={...deltas};
 for(const [key,shift] of Object.entries(changes)){
  if(!FACTORS.some(f=>f.key===key)||!Number.isFinite(shift)||shift< -100)return fail('Изменение параметра должно быть числом не меньше −100%.');
  if(DELTA_KEYS.includes(key))d[key]=d[key]+shift+d[key]*shift/100;
  else p[key]*=1+shift/100;
 }
 // Recurring implementation cost is included once in the existing marketing row
 // in both P&L and cash flow. No new accounting formulas or source edits.
 p.marketing+=budget;
 return calculate(p,d);
}
export function trafficForProfit(params,deltas=ZERO_DELTAS,target=0,month=0){
 const baseline=calculate(params,deltas);
 if(!baseline.valid||!Number.isFinite(target)||target<0||!Number.isInteger(month)||month<0||month>=baseline.months.length)return null;
 // Search absolute effective visitors/month, keeping every other scenario input.
 const evaluate=traffic=>calculate({...params,traffic},{...deltas,traffic:0});
 const limit=1000000,zero=evaluate(0),cap=evaluate(limit);
 if(!zero.valid||!cap.valid)return null;
 if(zero.months[month].netProfit>=target)return {traffic:0,revenue:0,profit:zero.months[month].netProfit,limit};
 if(cap.months[month].netProfit<target||cap.months[month].netProfit<=zero.months[month].netProfit)return null;
 let low=0,high=limit;
 for(let i=0;i<50;i++){const mid=(low+high)/2,m=evaluate(mid);if(!m.valid)return null;if(m.months[month].netProfit>=target)high=mid;else low=mid;}
 const traffic=Math.ceil(high),m=evaluate(traffic).months[month];
 return {traffic,revenue:m.revenue,profit:m.netProfit,limit};
}
export function cashBridge(m){
 const components=[
  {label:'Амортизация: расход без денежной выплаты',value:m.depreciation},
  {label:'Сырьё: разница между расходом и выплатами',value:m.rawMaterials-m.supplierPayments},
  {label:'Упаковка, санитария и логистика: нет отдельных выплат в ДДС',value:m.packaging+m.sanitation+m.logistics},
  {label:'Дополнительные выплаты ФОТ в ДДС',value:m.payroll-m.payrollPayments}
 ];
 return {components,operatingCash:m.netCashFlow+m.capex,gap:m.netCashFlow+m.capex-m.netProfit};
}
export function analyzeMemo(params,deltas=ZERO_DELTAS,month=0,target=50000,stress=10){
 const model=calculate(params,deltas);
 if(!model.valid)return {valid:false,errors:model.errors};
 if(!Number.isInteger(month)||!model.months[month])return {valid:false,errors:[{message:'Месяц вне горизонта расчёта.'}]};
 const m=model.months[month],breakEven=trafficForProfit(params,deltas,0,month);
 const stressValid=Number.isFinite(stress)&&stress>=0&&stress<=100;
 const stressModel=stressValid?experimentModel(params,deltas,{traffic:-stress}):null;
 const solutions=SOLUTIONS.map(s=>{const test=experimentModel(params,deltas,{[s.key]:s.shift});return {...s,model:test,gain:test.valid?test.months[month].netProfit-m.netProfit:null};}).sort((a,b)=>(b.gain??-Infinity)-(a.gain??-Infinity));
 return {valid:true,model,m,breakEven,target:trafficForProfit(params,deltas,target,month),stressModel,stressValid,bridge:cashBridge(m),solutions};
}
