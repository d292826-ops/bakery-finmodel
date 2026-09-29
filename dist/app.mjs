import {createMemo} from './memo.mjs';
import {createSensitivity} from './sensitivity.mjs';
import {DEFAULTS,ZERO_DELTAS,DELTA_KEYS,SCENARIOS,FIELD_LABELS,PNL_ROWS,CASH_ROWS,SCENARIO_ROWS,calculate,validate} from './model.mjs';

const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
const state={params:{...DEFAULTS},deltas:Object.fromEntries(SCENARIOS.map(s=>[s.id,{...ZERO_DELTAS}])),active:'base',month:0,view:'overview'};
const num=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}),dec=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}),pct=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number.isFinite(v)?`${num.format(v)} ₽`:'—';
const percent=v=>Number.isFinite(v)?`${pct.format(v*100)}%`:'—';
const amount=v=>Number.isFinite(v)?dec.format(v):'—';
const tone=v=>v<0?'negative':v>0?'positive':'neutral';
const dateLabel=(date,long=false)=>new Intl.DateTimeFormat('ru-RU',{month:long?'long':'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`)).replace(' г.','');
const shortMonth=date=>new Intl.DateTimeFormat('ru-RU',{month:'short',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`)).replace('.','');
const compact=v=>Math.abs(v)>=1e6?`${pct.format(v/1e6)} млн`:Math.abs(v)>=1000?`${pct.format(v/1000)} тыс.`:num.format(v);
let models={};
let sensitivity;
let memo;

function field(key,label,unit='',help='',attrs={}){
 const type=key==='startDate'?'date':'number',min=key==='discountRate'?-99.99:key==='horizon'||key==='usefulLife'?1:0,max=key==='horizon'?24:['conversion','retailShare','deliveryShare','rawMaterialRate','aggregatorRate','taxRate'].includes(key)?100:null;
 const helpId=`help-${attrs.scope??'overview'}-${key}`;const actualUnit=unit||(type==='date'?'дд.мм.гггг':'');
 return `<label class="field"><span>${label}${actualUnit?` <em>${actualUnit}</em>`:''}</span><input data-param="${key}" data-unit="${esc(actualUnit)}" type="${type}" value="${esc(state.params[key])}" ${type==='number'?`step="${attrs.step??(key==='horizon'?1:'any')}" min="${min}" ${max!==null?`max="${max}"`:''}`:''} ${help?`aria-describedby="${helpId}"`:''}>${help?`<small id="${helpId}">${help}</small>`:''}</label>`;
}
function inputGroup(title,content,open=false){return `<details class="input-group" ${open?'open':''}><summary>${title}</summary>${content}</details>`;}
function bindParameterInputs(root){
 [...root.querySelectorAll('[data-param]')].forEach(input=>input.addEventListener('input',()=>{
  const key=input.dataset.param;state.params[key]=input.type==='date'?input.value:input.value.trim()===''?NaN:Number(input.value);
  all(`[data-param="${key}"]`).forEach(peer=>{if(peer!==input)peer.value=input.value;});render();
 }));
}
function buildInputs(){
 $('#parameter-fields').innerHTML=
 field('traffic','Трафик','посетителей / мес.')+field('conversion','Конверсия','%')+field('averageCheck','Средний чек','₽')+
 inputGroup('Продажи и себестоимость',field('retailShare','Доля розницы','%')+field('deliveryShare','Доля доставки','%')+'<div id="mix-status" class="small-status"></div>'+field('aggregatorRate','Комиссия агрегаторов','% доставки')+field('rawMaterialRate','Сырьё','% выручки'))+
 inputGroup('Постоянные расходы',field('payroll1','ФОТ — группа 1','₽ / мес.')+field('payroll2','ФОТ — группа 2','₽ / мес.')+field('payroll3','ФОТ — группа 3','₽ / мес.')+'<div id="payroll-total" class="input-total"></div>'+field('rent','Аренда','₽ / мес.')+field('utilities','Коммунальные','₽ / мес.')+field('marketing','Маркетинг','₽ / мес.','Фиксированная сумма, как в исходной формуле.')+field('otherExpenses','Прочие расходы','₽ / мес.'))+
 inputGroup('Оборудование и оплаты',[1,2,3,4,5,6].map(i=>field(`equipment${i}`,`Оборудование ${i}`,'₽',i===1?'Эта позиция используется в исходной амортизации.':'')).join('')+'<div id="equipment-total" class="input-total"></div>'+field('usefulLife','Срок амортизации','мес.')+field('paymentDelay','Отсрочка поставщиков','дней','В расчёте сохранена исходная формула оплаты.'))+
 inputGroup('Период и ставки',field('startDate','Дата старта')+field('horizon','Горизонт','мес.','От 1 до 24 месяцев.')+field('taxRate','Ставка УСН','% выручки')+field('discountRate','Ставка дисконтирования','% годовых'));
 bindParameterInputs($('#parameter-fields'));
}
function buildScenarioControls(){
 const f=(key,label,unit,help='')=>field(key,label,unit,help,{scope:'scenarios'});
 const baseFields=f('traffic','Трафик','посетителей / мес.')+f('conversion','Конверсия в покупку','% посетителей')+f('averageCheck','Средний чек','₽ / покупку')+f('rawMaterialRate','Доля сырья в выручке','% выручки')+f('deliveryShare','Доля доставки','% выручки')+f('aggregatorRate','Комиссия агрегаторов','% выручки доставки')+f('rent','Аренда','₽ / мес.')+f('utilities','Коммунальные услуги','₽ / мес.')+f('taxRate','Ставка УСН','% выручки');
 const detailFields=inputGroup('ФОТ: изменить составляющие',`<div class="scenario-base-grid">${[1,2,3].map(i=>f(`payroll${i}`,`ФОТ — группа ${i}`,'₽ / мес.')).join('')}</div>`)+inputGroup('Оборудование и амортизация',`<div class="scenario-base-grid">${[1,2,3,4,5,6].map(i=>f(`equipment${i}`,`Оборудование ${i}`,'₽')).join('')}${f('usefulLife','Срок амортизации','мес.')}</div>`)+inputGroup('Другие расходы, период и ставки',`<div class="scenario-base-grid">${f('marketing','Маркетинг','₽ / мес.')}${f('otherExpenses','Прочие расходы','₽ / мес.')}${f('retailShare','Доля розницы','% выручки')}${f('paymentDelay','Отсрочка поставщиков','дней')}${f('discountRate','Ставка дисконтирования','% годовых')}${f('horizon','Горизонт','мес.')}${f('startDate','Дата старта','дд.мм.гггг')}</div>`);
 $('#scenarios').innerHTML=`<div id="scenario-payback" class="scenario-payback" aria-live="polite"></div><section class="scenario-base-panel"><div class="section-heading"><h2>Базовые параметры</h2><button type="button" class="text-button" id="reset-scenarios">Восстановить базовый набор</button></div><p class="scenario-summary">Общая база для трёх сценариев. Поля синхронизированы с вкладкой «Обзор».</p><div class="scenario-base-grid">${baseFields}</div><div id="scenario-base-derived" class="scenario-base-derived"></div>${detailFields}</section><div class="section-heading"><h2>Сценарные допущения</h2></div><p class="scenario-summary">Изменения к базе задаются в процентах: +10% к конверсии 25% дают 27,5%. При нулевых изменениях сценарии совпадают.</p><div class="scenario-controls">${SCENARIOS.map(s=>`<article class="scenario-card ${s.id}" data-scenario-card="${s.id}"><h2>${s.label}</h2><p>Дельты относительно базовых параметров</p>${DELTA_KEYS.map(k=>`<label class="field"><span>${k==='rawMaterialRate'?'Доля сырья':k==='payroll'?'ФОТ':FIELD_LABELS[k]}<em>% к базе</em></span><input type="number" min="-100" step="any" value="${state.deltas[s.id][k]}" data-unit="% к базе" data-scenario="${s.id}" data-delta="${k}" aria-label="${s.label}: ${k==='payroll'?'ФОТ':FIELD_LABELS[k]}, изменение в процентах к базе"></label>`).join('')}<div class="scenario-error" data-scenario-error="${s.id}" role="status"></div></article>`).join('')}</div><div id="scenario-results"></div>`;
 bindParameterInputs($('#scenarios'));
 all('[data-delta]').forEach(input=>input.addEventListener('input',()=>{state.deltas[input.dataset.scenario][input.dataset.delta]=input.value.trim()===''?NaN:Number(input.value);render();}));
 $('#reset-scenarios').addEventListener('click',resetModel);
}
function metric(label,value,hint,style='',word=false){return `<article class="metric"><p>${label}</p><strong class="${style}${word?' word-value':''}">${value}</strong><span>${hint}</span></article>`;}
function renderCards(model){
 const m=model.valid?model.months[state.month]:null,k=model.metrics;
 $('#month-cards').innerHTML=metric('Выручка',money(m?.revenue),'Трафик × конверсия × чек')+metric('EBITDA',money(m?.ebitda),'Операционный результат',tone(m?.ebitda))+metric('Чистая прибыль',money(m?.netProfit),'После расходов и налогов',tone(m?.netProfit))+metric('Чистая рентабельность',percent(m?.netMargin),m?.revenue===0?'Не определена при нулевой выручке':'Чистая прибыль / выручка',tone(m?.netMargin))+metric('Остаток денег',money(m?.closingCash),'На конец выбранного месяца',tone(m?.closingCash));
 $('#project-cards').innerHTML=metric('NPV',money(k?.npv),`Дисконтирование: ${pct.format(state.params.discountRate)}% годовых`,tone(k?.npv))+metric('Потребность в инвестициях',money(k?.investmentNeed),'Максимальный дефицит денежных средств')+metric('Окупаемость',!model.valid?'—':k.paybackMonth?`${k.paybackMonth}-й месяц`:'Не окупается',!model.valid?'Проверьте входные параметры':k.paybackMonth?dateLabel(model.months[k.paybackMonth-1].date,true):`В пределах ${state.params.horizon} мес.`,k?.paybackMonth?'positive':'neutral',true)+metric('IRR, годовая',!model.valid?'—':k.annualIrr===null?'Не рассчитывается':percent(k.annualIrr),k?.annualIrr==null?'Требуются потоки с разными знаками':'Доходность денежных потоков',tone(k?.annualIrr),k?.annualIrr==null);
 const warnings=[];
 if(model.valid&&!model.mixValid)warnings.push('Доли розницы и доставки не дают 100%. Проверьте параметры каналов.');
 if(model.valid&&state.params.paymentDelay>30)warnings.push('Отсрочка больше 30 дней: исходная упрощённая формула может давать отрицательные выплаты поставщикам.');
 if(m?.closingCash<0)warnings.push(`К концу выбранного месяца дефицит денег составляет <strong>${money(-m.closingCash)}</strong>.`);
 $('#cash-note').innerHTML=warnings.map(w=>`<div class="notice">${w}</div>`).join('');
}
function reportTable(title,subtitle,rows,model){
 if(!model.valid)return `<div class="table-panel"><div class="table-title"><h2>${title}</h2><p>Проверьте входные параметры для расчёта.</p></div></div>`;
 return `<div class="table-panel"><div class="table-title"><h2>${title}</h2><p>${subtitle}</p></div><div class="table-scroll" tabindex="0" aria-label="${title}, прокрутка по месяцам"><table><thead><tr><th scope="col">Показатель</th>${model.months.map((m,i)=>`<th scope="col" class="${i===state.month?'selected-col':''}">${esc(dateLabel(m.date))}</th>`).join('')}</tr></thead><tbody>${rows.map(([row,key,label,style])=>`<tr class="${style?`row-${style}`:''}"><th scope="row" title="Финмодель, строка ${row}">${label}</th>${model.months.map((m,i)=>`<td class="${m[key]<0?'negative ':''}${i===state.month?'selected-col':''}">${style==='rate'?percent(m[key]):amount(m[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}
function renderReports(model){
 const scenario=SCENARIOS.find(s=>s.id===state.active).label;
 $('#reports').innerHTML=reportTable('БЛОК 2: ОТЧЕТ О ПРИБЫЛЯХ И УБЫТКАХ',`${scenario} сценарий · Все суммы в рублях`,PNL_ROWS,model)+reportTable('БЛОК 3: ОТЧЕТ О ДВИЖЕНИИ ДЕНЕЖНЫХ СРЕДСТВ',`${scenario} сценарий · Все суммы в рублях`,CASH_ROWS,model);
}
function renderScenarios(){
 for(const s of SCENARIOS){const error=$(`[data-scenario-error="${s.id}"]`);error.textContent=models[s.id].valid?'':models[s.id].errors.map(e=>e.message).join(' ');}
 const sourceBase=calculate(state.params);const summary=sourceBase.valid?sourceBase.months[0]:null;
 $('#scenario-base-derived').innerHTML=`<div><span>ФОТ, итого</span><strong>${money(summary?.payroll)} / мес.</strong></div><div><span>Амортизация</span><strong>${money(summary?.depreciation)} / мес.</strong></div><div><span>CAPEX</span><strong>${money(sourceBase.metrics?.totalCapex)}</strong></div>`;
 $('#scenario-payback').innerHTML=SCENARIOS.map(s=>{const model=models[s.id],k=model.metrics,paid=!!k?.paybackMonth;return `<article class="scenario-payback-card ${s.id}" data-payback-scenario="${s.id}"><span>${s.label} сценарий</span><p>Окупаемость</p><strong class="${paid?'positive':'neutral'}" data-payback-value>${!model.valid?'—':paid?`${k.paybackMonth}-й месяц`:'Не окупается'}</strong><small>${!model.valid?'Проверьте параметры':paid?`В пределах ${state.params.horizon} мес. · ${dateLabel(model.months[k.paybackMonth-1].date,true)}`:`За горизонт ${state.params.horizon} мес.`}</small></article>`;}).join('');
 const validModel=Object.values(models).find(m=>m.valid),caption=validModel?dateLabel(validModel.months[state.month].date,true):'Проверьте параметры';
 const rowHTML=SCENARIO_ROWS.map(([,key,label,type])=>`<tr class="${type?`row-${type}`:''}"><th scope="row">${key==='traffic'?'Трафик':label}<span class="row-unit">${type==='rate'?'%':key==='traffic'?'посетителей / мес.':key==='averageCheck'?'₽ / покупку':'₽ / мес.'}</span></th>${SCENARIOS.map(s=>{const val=models[s.id].valid?models[s.id].months[state.month][key]:null;return `<td class="${tone(val)}">${type==='rate'?percent(val):key==='traffic'?Number.isFinite(val)?num.format(val):'—':amount(val)}</td>`;}).join('')}</tr>`).join('');
 const projectRows=[['npv','NPV','money'],['investmentNeed','Потребность в инвестициях','money'],['paybackMonth','Месяц окупаемости','month'],['annualIrr','IRR, годовая','rate']].map(([key,label,type])=>`<tr class="row-total"><th scope="row">${label}</th>${SCENARIOS.map(s=>{const val=models[s.id].metrics?.[key];const text=!models[s.id].valid?'—':type==='month'?(val?`${val}-й месяц`:'Не окупается'):type==='rate'?(val==null?'Не рассчитывается':percent(val)):amount(val);return `<td class="${key==='npv'?tone(val):''}">${text}</td>`;}).join('')}</tr>`).join('');
 $('#scenario-results').innerHTML=`<div class="table-panel"><div class="table-title"><h2>Расчёт по сценариям</h2><p>${esc(caption)} · Операционные результаты за месяц, инвестиционные показатели за весь горизонт</p></div><div class="table-scroll" tabindex="0" aria-label="Результаты трёх сценариев"><table><thead><tr><th scope="col">Показатель</th>${SCENARIOS.map(s=>`<th scope="col">${s.label}</th>`).join('')}</tr></thead><tbody>${rowHTML}${projectRows}</tbody></table></div></div>`;
}
const COLORS={revenue:'#26705e',ebitda:'#b9823e',netProfit:'#617eaa',inflows:'#26705e',outflows:'#c48655',cumulativeCashFlow:'#a95345'};
function chartPanel(id,title,subtitle,legend){return `<article class="chart-panel"><h2>${title}</h2><p class="chart-subtitle">${subtitle}</p><div id="${id}" class="chart-canvas"></div>${legend?`<div class="legend">${legend.map(([key,label])=>`<span><i style="background:${COLORS[key]}"></i>${label}</span>`).join('')}</div>`:''}</article>`;}
function createChart(container,months,series,kind='line'){
 const width=Math.max(280,Math.round(container.clientWidth)),height=255,left=67,right=12,top=13,bottom=36,plotW=width-left-right,plotH=height-top-bottom;
 const values=months.flatMap(m=>series.map(s=>m[s[0]]));let low=Math.min(0,...values),high=Math.max(0,...values);if(high===low){high=low+1;}const span=high-low;high+=span*.07;if(low<0)low-=span*.07;
 const y=v=>top+(high-v)/(high-low)*plotH;const x=i=>left+(months.length===1?plotW/2:i/(months.length-1)*plotW);
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(series.map(s=>s[1]).join(', '))}, по месяцам"><title>${esc(series.map(s=>s[1]).join(', '))}</title>`;
 for(let i=0;i<5;i++){const v=low+(high-low)*i/4,yy=y(v);svg+=`<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" stroke="#e5ebe8"/><text x="${left-9}" y="${yy+4}" text-anchor="end" fill="#73847e" font-size="12">${esc(compact(v))}</text>`;}
 svg+=`<line x1="${left}" y1="${y(0)}" x2="${width-right}" y2="${y(0)}" stroke="#a4b5ac" stroke-dasharray="4 4"/>`;
 const ticks=[...new Set([0,Math.round((months.length-1)/2),months.length-1])];
 for(const i of ticks){const m=months[i];svg+=`<text x="${x(i)}" y="${height-11}" text-anchor="${i===0?'start':i===months.length-1?'end':'middle'}" fill="#73847e" font-size="12">${esc(shortMonth(m.date))} ${m.date.slice(2,4)}</text>`;}
 if(kind==='bar'){
  const slot=plotW/months.length,bw=Math.max(2,Math.min(15,slot*.34));
  for(let i=0;i<months.length;i++){const xx=left+slot*(i+.5);series.forEach(([key,label],j)=>{const val=months[i][key],yy=y(val);svg+=`<rect x="${xx+(j-.5)*bw-bw/2}" y="${Math.min(yy,y(0))}" width="${bw-1}" height="${Math.max(.6,Math.abs(y(0)-yy))}" rx="2" fill="${COLORS[key]}"><title>${esc(dateLabel(months[i].date))} · ${label}: ${amount(val)} ₽</title></rect>`;});}
 }else{
  series.forEach(([key,label])=>{
   const points=months.map((m,i)=>`${x(i)},${y(m[key])}`).join(' ');
   if(key==='cumulativeCashFlow'&&months.length>1)svg+=`<polygon points="${x(0)},${y(0)} ${points} ${x(months.length-1)},${y(0)}" fill="${COLORS[key]}" opacity=".07"/>`;
   svg+=`<polyline points="${points}" fill="none" stroke="${COLORS[key]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
   months.forEach((m,i)=>{svg+=`<circle cx="${x(i)}" cy="${y(m[key])}" r="${i===state.month?4.5:months.length===1?4:2.5}" fill="${COLORS[key]}" stroke="white" stroke-width="1.2"><title>${esc(dateLabel(m.date))} · ${label}: ${amount(m[key])} ₽</title></circle>`;});
  });
 }
 svg+='</svg>';container.innerHTML=svg;
}
function renderCharts(model){
 const charts=$('#charts');if(!model.valid){charts.innerHTML='';return;}
 const period=dateLabel(model.months[state.month].date,true);
 charts.innerHTML=chartPanel('profit-chart','Выручка и прибыль','Динамика по месяцам, ₽',[['revenue','Выручка'],['ebitda','EBITDA'],['netProfit','Чистая прибыль']])+chartPanel('expense-chart','Состав расходов',period,null)+chartPanel('cash-chart','Поступления и выплаты','Денежные потоки по месяцам, ₽',[['inflows','Поступления'],['outflows','Выплаты']])+chartPanel('cumulative-chart','Накопленный денежный поток','Положение относительно нуля, ₽',[['cumulativeCashFlow','Накопленный поток']]);
 if(state.view!=='overview')return;
 createChart($('#profit-chart'),model.months,[['revenue','Выручка'],['ebitda','EBITDA'],['netProfit','Чистая прибыль']]);
 createChart($('#cash-chart'),model.months,[['inflows','Поступления'],['outflows','Выплаты']],'bar');
 createChart($('#cumulative-chart'),model.months,[['cumulativeCashFlow','Накопленный поток']]);
 const m=model.months[state.month];const expenseKeys=['rawMaterials','packaging','sanitation','logistics','aggregatorFee','payroll','rent','utilities','marketing','otherExpenses','depreciation','financeExpense','tax'];
 const rows=PNL_ROWS.filter(([,key])=>expenseKeys.includes(key)).map(([,key,label])=>({label,val:m[key]})).sort((a,b)=>b.val-a.val),max=Math.max(1,...rows.map(r=>r.val));
 $('#expense-chart').innerHTML=`<div class="expenses-list">${rows.map(r=>`<div class="expense-row"><span>${r.label}</span><div class="expense-bar"><i style="width:${Math.max(0,r.val/max*100)}%"></i></div><span class="expense-value" title="${amount(r.val)} ₽">${money(r.val)}</span></div>`).join('')}</div>`;
}
function updatePeriods(){
 const horizon=Number.isInteger(state.params.horizon)&&state.params.horizon>=1&&state.params.horizon<=24?state.params.horizon:24;
 state.month=Math.min(state.month,horizon-1);
 const date=/^\d{4}-\d{2}-\d{2}$/.test(state.params.startDate)?state.params.startDate:DEFAULTS.startDate;const [year,month]=date.split('-').map(Number);
 const dates=Array.from({length:horizon},(_,i)=>new Date(Date.UTC(year,month-1+i,1)).toISOString().slice(0,10));
 $('#month-select').innerHTML=dates.map((d,i)=>`<option value="${i}" ${i===state.month?'selected':''}>${dateLabel(d,true)}</option>`).join('');
 $('#month-caption').textContent=dateLabel(dates[state.month],true);$('#horizon-caption').textContent=`${horizon} мес. · ${SCENARIOS.find(s=>s.id===state.active).label}`;
}
function render(){
 updatePeriods();models=Object.fromEntries(SCENARIOS.map(s=>[s.id,calculate(state.params,state.deltas[s.id]) ]));
 const model=models[state.active],errors=model.errors;const box=$('#validation');box.hidden=!errors.length;box.textContent=errors.map(e=>e.message).join(' ');
 const underlying=validate(state.params);all('[data-param]').forEach(el=>el.setAttribute('aria-invalid',String(underlying.some(e=>e.field===el.dataset.param))));
 const payroll=state.params.payroll1+state.params.payroll2+state.params.payroll3,totalEquipment=[1,2,3,4,5,6].reduce((s,i)=>s+state.params[`equipment${i}`],0);
 $('#payroll-total').textContent=`Итого ФОТ: ${money(payroll)} / мес.`;$('#equipment-total').textContent=`Всего оборудования: ${money(totalEquipment)}`;
 const mix=Math.abs((state.params.retailShare+state.params.deliveryShare)/100-1)<.01;$('#mix-status').textContent=mix?'Доли каналов: 100%':'Доли каналов должны давать 100%';$('#mix-status').className=`small-status ${mix?'positive':'negative'}`;
 renderCards(model);renderReports(model);renderScenarios();renderCharts(model);if(state.view==='sensitivity')sensitivity?.render();if(state.view==='memo')memo?.render();
}
function keepActiveTabVisible(){const nav=$('.tabs'),tab=nav.querySelector('.active');if(!tab)return;const n=nav.getBoundingClientRect(),t=tab.getBoundingClientRect();if(t.right>n.right)nav.scrollLeft+=t.right-n.right;else if(t.left<n.left)nav.scrollLeft-=n.left-t.left;}
function switchView(view,updateHash=true){if(!['overview','reports','scenarios','sensitivity','memo'].includes(view))return;state.view=view;all('.view').forEach(el=>el.hidden=el.id!==view);all('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===view);if(b.dataset.tab===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});$('#page-title').textContent={overview:'Экономика вашей пекарни',reports:'Финансовые отчёты',scenarios:'Сценарный анализ',sensitivity:'Анализ чувствительности чистой прибыли',memo:'Аналитическая записка'}[view];if(updateHash&&location.hash!==`#${view}`)location.hash=view;if(view==='overview')renderCharts(models[state.active]);if(view==='sensitivity')sensitivity?.activate();else sensitivity?.deactivate();if(view==='memo')memo?.activate();else memo?.deactivate();keepActiveTabVisible();}
function syncInputs(){all('[data-param]').forEach(el=>el.value=state.params[el.dataset.param]);all('[data-delta]').forEach(el=>el.value=state.deltas[el.dataset.scenario][el.dataset.delta]);$('#active-scenario').value=state.active;}
function resetModel(){state.params={...DEFAULTS};state.deltas=Object.fromEntries(SCENARIOS.map(s=>[s.id,{...ZERO_DELTAS}]));state.active='base';state.month=0;syncInputs();render();}
$('#methodology-content').innerHTML=`<p><strong>Основа расчёта.</strong> Листы «Финмодель» и «Сценарный анализ» предоставленной таблицы. Исправлены ссылки, подписи месяцев и диапазоны расчёта горизонта. Сценарии используют те же ОПиУ и ДДС, что основной отчёт.</p><ul><li>Трафик считается за месяц, маркетинг — фиксированной суммой в рублях за месяц. Это сохраняет поведение исходных формул. В исходных данных их период и единицы не уточнены.</li><li>Упаковка — 3%, санитария — 2%, логистика — 5% выручки, как в формулах ОПиУ. Отдельные значения на листе параметров не заменяют эти коэффициенты.</li><li>В ОПиУ ФОТ учитывается без дополнительных взносов, в ДДС выплаты ФОТ умножаются на 1,34.</li><li>Амортизация = стоимость первой позиции оборудования / срок использования. Все шесть позиций входят в инвестиции первого месяца.</li><li>Оплата сырья = себестоимость сырья × (1 − отсрочка / 30). Погашение отложенной части в следующих месяцах, упаковка, санитария и логистика отдельно в ДДС не добавлены: сохранена исходная методика.</li><li>NPV: первый денежный поток не дисконтируется. Последующие дисконтируются по месячной ставке (1 + годовая ставка)<sup>1/12</sup> − 1.</li><li>Потребность в инвестициях — максимальный отрицательный накопленный поток. Окупаемость — первый месяц со строго положительным накопленным потоком. IRR выводится в годовом выражении.</li><li>При нулевой выручке рентабельность не определена и отображается прочерком. Некорректные входные значения не заменяются нулями.</li></ul><p>Изменения действуют в текущем открытом окне. «Сбросить» восстанавливает базовый набор: трафик 15 000 посетителей в месяц, конверсию 25%, средний чек 250 ₽ и нулевые сценарные изменения.</p>`;
buildInputs();buildScenarioControls();
sensitivity=createSensitivity($('#sensitivity'),()=>({params:state.params,deltas:state.deltas[state.active],active:state.active,month:state.month}),selection=>{Object.assign(state,selection);$('#active-scenario').value=state.active;render();});
memo=createMemo($('#memo'),()=>({params:state.params,deltas:state.deltas[state.active],active:state.active,month:state.month}));
all('[data-tab]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.tab)));
$('#month-select').addEventListener('change',e=>{state.month=Number(e.target.value);render();});
$('#active-scenario').addEventListener('change',e=>{state.active=e.target.value;render();});
$('#reset').addEventListener('click',resetModel);
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.view==='overview')renderCharts(models[state.active]);sensitivity?.resize();keepActiveTabVisible();},120);});
render();
window.addEventListener('hashchange',()=>switchView(location.hash.slice(1)||'overview',false));
switchView(['overview','reports','scenarios','sensitivity','memo'].includes(location.hash.slice(1))?location.hash.slice(1):'overview',false);

// Optional imperative WebMCP surface shares exactly the UI state and actions.
function readback(){const model=models[state.active];return {scenario:state.active,month:state.month+1,valid:model.valid,errors:model.errors,parameters:{...state.params},metrics:model.metrics,selectedMonth:model.valid?model.months[state.month]:null};}
function validateObject(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw new Error('Некорректные или неизвестные поля.');}
export const modelActions={
 read:()=>readback(),
 updateParameters(parameters){validateObject(parameters,Object.keys(DEFAULTS));for(const [k,v] of Object.entries(parameters))if(k==='startDate'?typeof v!=='string':typeof v!=='number')throw new Error('Некорректный тип значения.');const next={...state.params,...parameters};const check=SCENARIOS.flatMap(s=>validate(next,state.deltas[s.id]));if(check.length)throw new Error(check.map(e=>e.message).join(' '));state.params=next;syncInputs();render();return readback();},
 configureScenarios(input){validateObject(input,['scenarios','active','month']);const next=structuredClone(state.deltas);if(input.scenarios){validateObject(input.scenarios,SCENARIOS.map(s=>s.id));for(const [id,delta] of Object.entries(input.scenarios)){validateObject(delta,DELTA_KEYS);for(const v of Object.values(delta))if(typeof v!=='number')throw new Error('Изменения сценариев должны быть числами.');next[id]={...next[id],...delta};}}
  if(input.active!==undefined&&!SCENARIOS.some(s=>s.id===input.active))throw new Error('Неизвестный сценарий.');if(input.month!==undefined&&(!Number.isInteger(input.month)||input.month<1||input.month>state.params.horizon))throw new Error('Месяц вне горизонта.');const check=SCENARIOS.flatMap(s=>validate(state.params,next[s.id]));if(check.length)throw new Error(check.map(e=>e.message).join(' '));state.deltas=next;if(input.active)state.active=input.active;if(input.month)state.month=input.month-1;syncInputs();render();return readback();}
};
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController(),parameterProperties=Object.fromEntries(Object.keys(DEFAULTS).map(k=>[k,{type:k==='startDate'?'string':'number',description:FIELD_LABELS[k]}])),deltaProperties=Object.fromEntries(DELTA_KEYS.map(k=>[k,{type:'number',minimum:-100}]));
 const tools=[{name:'get_bakery_financial_model',title:'Получить расчёт пекарни',description:'Получить текущие параметры, выбранный месяц и рассчитанные показатели без изменения состояния.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>modelActions.read()},{name:'update_bakery_financial_inputs',title:'Изменить параметры пекарни',description:'Изменить базовые параметры и пересчитать карточки, отчёты и сценарии. Проценты задаются как 25 для 25%.',inputSchema:{type:'object',properties:{parameters:{type:'object',properties:parameterProperties,additionalProperties:false}},required:['parameters'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>modelActions.updateParameters(input.parameters)},{name:'configure_bakery_scenarios',title:'Настроить сценарии пекарни',description:'Изменить сценарные дельты в процентах, активный сценарий и месяц. Пересчитывает ту же модель, что видимый интерфейс.',inputSchema:{type:'object',properties:{scenarios:{type:'object',properties:Object.fromEntries(SCENARIOS.map(s=>[s.id,{type:'object',properties:deltaProperties,additionalProperties:false}])),additionalProperties:false},active:{type:'string',enum:SCENARIOS.map(s=>s.id)},month:{type:'integer',minimum:1,maximum:24}},additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>modelActions.configureScenarios(input)}];
 for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
