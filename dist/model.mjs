// Source: approved mapping of Финмодель and Сценарный анализ, 2026-09-29.
// Preserve the workbook's business rules; only references, periods and scenario
// consistency are corrected. Money is never rounded during calculation.
export const SOURCE_DEFAULTS = Object.freeze({startDate:'2025-09-04',horizon:24,traffic:500,conversion:25,averageCheck:250,rawMaterialRate:35,marketing:0.5,retailShare:80,deliveryShare:20,aggregatorRate:20,payroll1:120000,payroll2:90000,payroll3:80000,rent:60*1700,utilities:12000,otherExpenses:10000,equipment1:95000,equipment2:60000,equipment3:600000,equipment4:105500,equipment5:81000,equipment6:120000,usefulLife:7*12,paymentDelay:20,taxRate:6,discountRate:30});
// User-requested base case: payback within 24 months, without changing formulas.
export const DEFAULTS = Object.freeze({...SOURCE_DEFAULTS,traffic:15000});
export const DELTA_KEYS=['traffic','conversion','averageCheck','rawMaterialRate','payroll'];
export const ZERO_DELTAS=Object.freeze(Object.fromEntries(DELTA_KEYS.map(k=>[k,0])));
export const SCENARIOS=[{id:'optimistic',label:'Оптимистичный',color:'#26705e'},{id:'base',label:'Базовый',color:'#617eaa'},{id:'pessimistic',label:'Пессимистичный',color:'#b77542'}];
export const PNL_ROWS=[
 [24,'revenue','Выручка','strong'],[25,'rawMaterials','Себестоимость сырья'],[26,'packaging','Себестоимость упаковки'],[27,'sanitation','Санитария'],[28,'logistics','Логистика сырья'],[29,'cogs','Себестоимость итого','total'],[30,'grossProfit','Валовая прибыль','total'],[31,'grossMargin','Валовая рентабельность','rate'],[32,'aggregatorFee','Комиссии агрегаторов'],[33,'payroll','ФОТ'],[34,'rent','Аренда'],[35,'utilities','Коммунальные'],[36,'marketing','Маркетинг'],[37,'otherExpenses','Прочие расходы'],[38,'opex','OPEX итого','total'],[39,'ebitda','EBITDA','strong'],[40,'depreciation','Амортизация'],[41,'ebit','EBIT','total'],[42,'financeExpense','Финансовые расходы'],[43,'tax','Налоги УСН'],[44,'netProfit','Чистая прибыль','strong'],[45,'netMargin','Чистая рентабельность','rate']];
export const CASH_ROWS=[
 [50,'openingCash','Остаток на начало'],[51,'receipts','Поступления от продаж'],[52,'capex','Инвестиции'],[53,'supplierPayments','Выплаты поставщикам'],[54,'payrollPayments','Выплаты ФОТ'],[55,'premisesPayments','Аренда и коммунальные'],[56,'marketingPayments','Маркетинг'],[57,'otherPayments','Прочие расходы'],[58,'taxPayments','Налоги'],[59,'inflows','Итого приток','total'],[60,'outflows','Итого отток','total'],[61,'netCashFlow','Чистый денежный поток','strong'],[62,'closingCash','Остаток на конец','total'],[63,'cumulativeCashFlow','Накопленный поток','strong']];
export const SCENARIO_ROWS=[
 [27,'traffic','Трафик, посетителей'],[28,'conversion','Конверсия в покупку','rate'],[29,'averageCheck','Средний чек'],[30,'revenue','Выручка всего','strong'],[31,'deliveryShare','Доля доставки','rate'],[32,'deliveryRevenue','Выручка доставки'],[33,'retailRevenue','Выручка розницы'],[34,'cogs','Себестоимость итого','total'],[35,'aggregatorFee','Комиссия агрегаторов'],[36,'payroll','ФОТ'],[37,'rent','Аренда'],[38,'utilities','Коммунальные услуги'],[null,'marketing','Маркетинг'],[null,'otherExpenses','Прочие расходы'],[null,'ebitda','EBITDA','total'],[39,'depreciation','Амортизация'],[40,'ebit','EBIT','total'],[41,'tax','Налог'],[42,'netProfit','Чистая прибыль','strong'],[43,'netCashFlow','Чистый денежный поток','strong']];
export const FIELD_LABELS={startDate:'Дата старта',horizon:'Горизонт',traffic:'Трафик',conversion:'Конверсия',averageCheck:'Средний чек',rawMaterialRate:'Сырьё',marketing:'Маркетинг',retailShare:'Доля розницы',deliveryShare:'Доля доставки',aggregatorRate:'Комиссия агрегаторов',payroll1:'ФОТ, группа 1',payroll2:'ФОТ, группа 2',payroll3:'ФОТ, группа 3',rent:'Аренда',utilities:'Коммунальные услуги',otherExpenses:'Прочие расходы',equipment1:'Оборудование 1',equipment2:'Оборудование 2',equipment3:'Оборудование 3',equipment4:'Оборудование 4',equipment5:'Оборудование 5',equipment6:'Оборудование 6',usefulLife:'Срок амортизации',paymentDelay:'Отсрочка поставщиков',taxRate:'Ставка налога',discountRate:'Ставка дисконтирования'};
export function validate(p,d=ZERO_DELTAS){
 const errors=[];
 for(const k of Object.keys(DEFAULTS)){
  if(k==='startDate')continue;
  if(!Number.isFinite(p[k]))errors.push({field:k,message:`${FIELD_LABELS[k]}: укажите число.`});
  else if(k==='discountRate' ? p[k]<=-100 : p[k]<0)errors.push({field:k,message:`${FIELD_LABELS[k]}: недопустимое значение.`});
 }
 const [y,mo,day]=String(p.startDate).split('-').map(Number);const date=new Date(Date.UTC(y,mo-1,day));
 if(!/^\d{4}-\d{2}-\d{2}$/.test(p.startDate)||date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==day)errors.push({field:'startDate',message:'Укажите корректную дату старта.'});
 if(!Number.isInteger(p.horizon)||p.horizon<1||p.horizon>24)errors.push({field:'horizon',message:'Горизонт должен быть целым числом от 1 до 24 месяцев.'});
 if(!(p.usefulLife>0))errors.push({field:'usefulLife',message:'Срок амортизации должен быть больше нуля.'});
 for(const k of ['conversion','rawMaterialRate','retailShare','deliveryShare','aggregatorRate','taxRate'])if(p[k]>100)errors.push({field:k,message:`${FIELD_LABELS[k]}: значение не должно превышать 100%.`});
 for(const k of DELTA_KEYS)if(!Number.isFinite(d[k])||d[k]<-100)errors.push({field:`delta.${k}`,message:`Сценарное изменение «${k}» должно быть числом не меньше −100%.`});
 for(const k of ['conversion','rawMaterialRate'])if(p[k]*(1+d[k]/100)>100)errors.push({field:`delta.${k}`,message:`${FIELD_LABELS[k]} с учётом сценария превышает 100%.`});
 return errors;
}
export function monthlyIrr(flows){
 if(flows.length<2||!flows.some(v=>v<0)||!flows.some(v=>v>0))return null;
 const npv=r=>flows.reduce((s,c,t)=>s+c/Math.pow(1+r,t),0);
 let lo=-0.999999,hi=1,fl=npv(lo),fh=npv(hi);
 for(let i=0;i<48&&Math.sign(fl)===Math.sign(fh);i++){hi=hi*2+1;fh=npv(hi);}
 if(!Number.isFinite(fl)||!Number.isFinite(fh)||Math.sign(fl)===Math.sign(fh))return null;
 for(let i=0;i<200;i++){const mid=(lo+hi)/2;const fm=npv(mid);if(Math.abs(fm)<1e-8)return mid;if(Math.sign(fm)===Math.sign(fl)){lo=mid;fl=fm;}else hi=mid;}
 return (lo+hi)/2;
}
export function calculate(p,d=ZERO_DELTAS){
 const errors=validate(p,d);if(errors.length)return {valid:false,errors,months:[],metrics:null};
 const traffic=p.traffic*(1+d.traffic/100),conversion=p.conversion/100*(1+d.conversion/100),averageCheck=p.averageCheck*(1+d.averageCheck/100),rawMaterialRate=p.rawMaterialRate/100*(1+d.rawMaterialRate/100),payroll=(p.payroll1+p.payroll2+p.payroll3)*(1+d.payroll/100);
 const deliveryShare=p.deliveryShare/100,retailShare=p.retailShare/100;
 const revenue=traffic*conversion*averageCheck;
 const rawMaterials=revenue*rawMaterialRate,packaging=revenue*.03,sanitation=revenue*.02,logistics=revenue*.05,cogs=rawMaterials+packaging+sanitation+logistics;
 const grossProfit=revenue-cogs,grossMargin=revenue===0?null:grossProfit/revenue,deliveryRevenue=revenue*deliveryShare,retailRevenue=revenue-deliveryRevenue,aggregatorFee=deliveryRevenue*p.aggregatorRate/100;
 const opex=payroll+p.rent+p.utilities+p.marketing+p.otherExpenses,ebitda=grossProfit-aggregatorFee-opex,depreciation=p.equipment1/p.usefulLife,ebit=ebitda-depreciation,financeExpense=0,tax=Math.max(0,revenue*p.taxRate/100),netProfit=ebit-financeExpense-tax,netMargin=revenue===0?null:netProfit/revenue;
 const totalCapex=[1,2,3,4,5,6].reduce((s,i)=>s+p[`equipment${i}`],0);
 const receipts=revenue-aggregatorFee,supplierPayments=rawMaterials*(1-p.paymentDelay/30),payrollPayments=payroll*1.34,premisesPayments=p.rent+p.utilities,marketingPayments=p.marketing,otherPayments=p.otherExpenses,taxPayments=tax,inflows=receipts;
 const [year,month]=p.startDate.split('-').map(Number);let cumulative=0;
 const months=Array.from({length:p.horizon},(_,i)=>{
  const date=new Date(Date.UTC(year,month-1+i,1));const capex=i===0?totalCapex:0,outflows=capex+supplierPayments+payrollPayments+premisesPayments+marketingPayments+otherPayments+taxPayments,netCashFlow=inflows-outflows,openingCash=cumulative;
  cumulative+=netCashFlow;
  return {index:i+1,date:date.toISOString().slice(0,10),traffic,conversion,averageCheck,rawMaterialRate,deliveryShare,retailShare,revenue,rawMaterials,packaging,sanitation,logistics,cogs,grossProfit,grossMargin,deliveryRevenue,retailRevenue,aggregatorFee,payroll,rent:p.rent,utilities:p.utilities,marketing:p.marketing,otherExpenses:p.otherExpenses,opex,ebitda,depreciation,ebit,financeExpense,tax,netProfit,netMargin,openingCash,receipts,capex,supplierPayments,payrollPayments,premisesPayments,marketingPayments,otherPayments,taxPayments,inflows,outflows,netCashFlow,closingCash:openingCash+netCashFlow,cumulativeCashFlow:cumulative};
 });
 const flows=months.map(m=>m.netCashFlow),monthlyDiscount=Math.pow(1+p.discountRate/100,1/12)-1;
 const npv=flows.reduce((s,c,i)=>s+c/Math.pow(1+monthlyDiscount,i),0),investmentNeed=Math.max(0,-Math.min(...months.map(m=>m.cumulativeCashFlow))),paybackIndex=months.findIndex(m=>m.cumulativeCashFlow>0),irr=monthlyIrr(flows),annualIrr=irr===null?null:Math.pow(1+irr,12)-1;
 const metrics={npv,investmentNeed,paybackMonth:paybackIndex===-1?null:paybackIndex+1,annualIrr:Number.isFinite(annualIrr)?annualIrr:null,monthlyDiscount,totalCapex};
 if(months.some(m=>Object.values(m).some(v=>typeof v==='number'&&!Number.isFinite(v)))||!Number.isFinite(npv)||!Number.isFinite(investmentNeed))return {valid:false,errors:[{field:'',message:'Значения слишком велики для расчёта. Уменьшите входные параметры.'}],months:[],metrics:null};
 return {valid:true,errors:[],months,metrics,mixValid:Math.abs(retailShare+deliveryShare-1)<0.01};
}
