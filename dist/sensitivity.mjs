import {FACTORS,factorValue,sensitivityPoint,tornadoRows} from './sensitivity-model.mjs';
import {SCENARIOS} from './model.mjs';

const number=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const money=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rub=v=>Number.isFinite(v)?`${money.format(v)} ₽`:'—';
const signed=v=>Number.isFinite(v)?`${v>0?'+':''}${rub(v)}`:'—';
const shiftLabel=v=>`${v>0?'+':''}${number.format(v)}%`;
const tone=v=>v<0?'negative':v>0?'positive':'neutral';
const tips={
 base:['Отправная точка','Выберите сценарий и месяц. Исходная прибыль совпадает со строкой «Чистая прибыль» в отчёте за этот месяц. Сейчас в модели нет сезонности, поэтому месяцы дают одинаковую прибыль.'],
 change:['Как задаётся изменение','Изменение считается относительно значения выбранного сценария. +10% к конверсии 25% дают 27,5%, а не 35%. При нулевом исходном значении относительное изменение тоже даёт ноль.'],
 tornado:['Как читать влияние факторов','Каждый фактор меняется отдельно, остальные остаются на уровне выбранного сценария. Слева от нуля — снижение прибыли, справа — рост. Сверху факторы с наибольшим абсолютным влиянием. Нажмите на строку, чтобы изучить фактор на графике.'],
 curve:['Как читать график','Каждая точка — чистая прибыль при заданном изменении одного параметра. Ниже горизонтальной линии нуля пекарня убыточна. Вертикальная пунктирная линия — исходное значение. Точные суммы и недоступные точки приведены в таблице под графиком.'],
 matrix:['Как читать матрицу','Одновременно меняются два фактора: один по строкам, другой по столбцам. В ячейке — чистая прибыль за месяц. Выделенный центр соответствует исходному сценарию. Это отдельный эксперимент: изменение в карточках здесь не применяется.'],
 scope:['Что означает чувствительность','Анализ показывает последствия заданного изменения, а не вероятность события. Он использует действующую методику прибыли, включая амортизацию. Эксперименты на этой странице не меняют основную модель и настройки сценариев.'],
 margin:['Рентабельность продаж','Чистая прибыль после изменения, делённая на новую выручку. При нулевой выручке показатель не определён и отображается прочерком.']
};
const help=(key)=>`<button type="button" class="s-help" data-help="${key}" aria-label="Подсказка: ${esc(tips[key][0])}">i</button>`;
const options=()=>FACTORS.map(f=>`<option value="${f.key}">${f.label} · ${f.unit}</option>`).join('');
const steps=[
 ['#s-settings','Начните со сценария','Выберите сценарий и месяц. Их значения станут отправной точкой анализа.'],
 ['#s-tornado-panel','Найдите сильные факторы','На диаграмме каждый фактор изменяется отдельно. Самые сильные факторы расположены сверху.'],
 ['#s-curve-panel','Проверьте один параметр','Выберите параметр и величину изменения справа от карточек. График и таблица покажут, когда прибыль становится отрицательной.'],
 ['#s-matrix-panel','Сравните два фактора','Выберите разные параметры для строк и столбцов. Каждая ячейка покажет результат их одновременного изменения.'],
 ['#s-reset','Экспериментируйте свободно','Изменения здесь не меняют основную модель. «Сбросить анализ» возвращает настройки анализа к исходным. Повторить экскурсию можно кнопкой «Как пользоваться».']
];

export function createSensitivity(root,getContext,setSelection){
 const $=s=>root.querySelector(s);
 const initial={factor:'traffic',shift:0,magnitude:10,range:20,x:'averageCheck',y:'traffic'};
 let state={...initial},tourStep=null,dialogOrigin=null,tourSeen=false;
 try{tourSeen=sessionStorage.getItem('bakery-sensitivity-tour')==='seen';}catch{}
 root.innerHTML=`<div class="s-toolbar"><p>Как изменения продаж и расходов влияют на прибыль за месяц ${help('scope')}</p><button type="button" class="s-button" id="s-tour">Как пользоваться</button></div>
 <div class="s-workspace"><div><div class="s-cards" id="s-cards" aria-live="polite"></div><div class="s-baseline-note" id="s-baseline-note"></div></div>
 <aside class="parameters" id="s-settings"><div class="section-heading"><h2>Настройки анализа</h2>${help('base')}</div>
 <div class="field-row"><label class="field"><span>Сценарий</span><select id="s-scenario">${SCENARIOS.map(s=>`<option value="${s.id}">${s.label}</option>`).join('')}</select></label><label class="field"><span>Месяц</span><select id="s-month"></select></label></div>
 <label class="field"><span>Исследуемый параметр</span><select id="s-factor">${options()}</select></label>
 <div class="s-label"><label for="s-shift">Изменение <em>% к сценарию</em></label>${help('change')}</div>
 <input id="s-shift" type="number" step="any" min="-100" value="0" data-unit="% к сценарию" aria-describedby="s-value-change s-point-error">
 <div class="s-presets" aria-label="Быстрый выбор изменения">${[-20,-10,0,10,20].map(v=>`<button type="button" data-shift="${v}">${shiftLabel(v)}</button>`).join('')}</div>
 <p class="s-value-change" id="s-value-change"></p><p class="s-error" id="s-point-error" role="status"></p>
 <button type="button" class="text-button" id="s-reset">Сбросить анализ</button></aside></div>
 <section class="chart-panel s-panel" id="s-tornado-panel"><div class="s-panel-heading"><div><h2>Какие факторы влияют сильнее ${help('tornado')}</h2><p>Изменение чистой прибыли, ₽/мес. Каждый фактор проверяется отдельно.</p></div><div class="s-magnitude"><label for="s-magnitude">Отклонение ± <span>%</span></label><select id="s-magnitude"><option value="5">5%</option><option value="10" selected>10%</option><option value="20">20%</option><option value="custom">Своё</option></select><label class="s-custom" id="s-custom-wrap" hidden><span>Своё ±, %</span><input id="s-custom" type="number" min="0.01" max="100" step="any" value="10" data-unit="%"></label></div></div>
 <p class="s-error" id="s-magnitude-error" role="status"></p><div class="s-legend"><span><i class="s-lower"></i>Уменьшение параметра</span><span><i class="s-upper"></i>Увеличение параметра</span></div><div id="s-tornado"></div></section>
 <section class="chart-panel s-panel" id="s-curve-panel"><div class="s-panel-heading"><div><h2>Прибыль и выбранный параметр ${help('curve')}</h2><p id="s-curve-caption"></p></div><label class="s-range">Диапазон, %<select id="s-range"><option value="10">−10 … +10</option><option value="20" selected>−20 … +20</option><option value="40">−40 … +40</option></select></label></div><div id="s-curve"></div><div class="table-scroll" tabindex="0" aria-label="Точные значения чувствительности"><table class="s-table" id="s-point-table"></table></div></section>
 <section class="chart-panel s-panel" id="s-matrix-panel"><div class="s-panel-heading"><div><h2>Два параметра одновременно ${help('matrix')}</h2><p>Чистая прибыль, ₽/мес. Зелёный — прибыль, красный — убыток.</p></div></div><div class="s-matrix-controls"><label class="field"><span>По строкам</span><select id="s-matrix-y">${options()}</select></label><label class="field"><span>По столбцам</span><select id="s-matrix-x">${options()}</select></label></div><div class="table-scroll" tabindex="0" aria-label="Матрица двух параметров, прокрутка по столбцам"><table id="s-matrix" class="s-table s-matrix"></table></div></section>
 <dialog class="s-dialog" aria-labelledby="s-dialog-title" aria-describedby="s-dialog-text"><button type="button" class="s-dialog-close" aria-label="Закрыть подсказку">×</button><p id="s-dialog-counter"></p><h2 id="s-dialog-title"></h2><p id="s-dialog-text"></p><div class="s-dialog-actions"><button type="button" class="text-button" id="s-skip">Пропустить</button><div><button type="button" class="s-button" id="s-back">Назад</button><button type="button" class="s-button s-primary" id="s-next">Далее</button></div></div></dialog>`;
 const dialog=$('dialog');
 const markSeen=()=>{tourSeen=true;try{sessionStorage.setItem('bakery-sensitivity-tour','seen');}catch{}};
 function clearHighlight(){root.querySelectorAll('.s-tour-target').forEach(n=>n.classList.remove('s-tour-target'));}
 function closeDialog(){dialog.close();}
 dialog.addEventListener('close',()=>{clearHighlight();tourStep=null;dialogOrigin?.focus({preventScroll:true});});
 $('.s-dialog-close').onclick=closeDialog;
 $('#s-skip').onclick=closeDialog;
 function showDialog(title,text,counter=''){
  $('#s-dialog-title').textContent=title;$('#s-dialog-text').textContent=text;$('#s-dialog-counter').textContent=counter;
  $('.s-dialog-actions').hidden=tourStep===null;
  if(!dialog.open){dialogOrigin=document.activeElement;dialog.showModal();}
 }
 function showStep(){
  clearHighlight();const [selector,title,text]=steps[tourStep];const target=$(selector);
  target.classList.add('s-tour-target');target.scrollIntoView({behavior:'instant',block:'center'});
  $('#s-back').disabled=tourStep===0;$('#s-next').textContent=tourStep===steps.length-1?'Готово':'Далее';
  showDialog(title,text,`Шаг ${tourStep+1} из ${steps.length}`);
 }
 function startTour(){markSeen();tourStep=0;showStep();}
 $('#s-tour').onclick=startTour;
 $('#s-back').onclick=()=>{tourStep--;showStep();};
 $('#s-next').onclick=()=>{if(tourStep===steps.length-1)closeDialog();else{tourStep++;showStep();}};
 root.addEventListener('click',e=>{
  const hint=e.target.closest('[data-help]');if(hint){tourStep=null;showDialog(...tips[hint.dataset.help]);}
  const preset=e.target.closest('[data-shift]');if(preset){state.shift=Number(preset.dataset.shift);$('#s-shift').value=state.shift;render();}
  const factor=e.target.closest('[data-factor]');if(factor){state.factor=factor.dataset.factor;$('#s-factor').value=state.factor;render();}
 });
 $('#s-factor').onchange=e=>{state.factor=e.target.value;render();};
 $('#s-shift').oninput=e=>{state.shift=e.target.value.trim()===''?NaN:Number(e.target.value);render();};
 $('#s-scenario').onchange=e=>setSelection({active:e.target.value});
 $('#s-month').onchange=e=>setSelection({month:Number(e.target.value)});
 $('#s-magnitude').onchange=e=>{const custom=e.target.value==='custom';$('#s-custom-wrap').hidden=!custom;state.magnitude=custom?Number($('#s-custom').value):Number(e.target.value);render();};
 $('#s-custom').oninput=e=>{state.magnitude=e.target.value.trim()===''?NaN:Number(e.target.value);render();};
 $('#s-range').onchange=e=>{state.range=Number(e.target.value);render();};
 for(const axis of ['x','y'])$(`#s-matrix-${axis}`).onchange=e=>{state[axis]=e.target.value;const other=axis==='x'?'y':'x';if(state[other]===state[axis])state[other]=FACTORS.find(f=>f.key!==state[axis]).key;render();};
 $('#s-reset').onclick=()=>{state={...initial};$('#s-factor').value=state.factor;$('#s-shift').value=0;$('#s-magnitude').value='10';$('#s-custom').value=10;$('#s-custom-wrap').hidden=true;$('#s-range').value='20';render();};
 const point=(shocks={})=>{const c=getContext();return sensitivityPoint(c.params,c.deltas,shocks,c.month);};
 const errorText=p=>p.errors.map(e=>e.message).join(' ');
 const card=(id,label,value,hint,style='')=>`<article class="metric"><p>${label}</p><strong id="${id}" class="${style}">${value}</strong><span>${hint}</span></article>`;
 function render(){
  const c=getContext(),baseline=point(),test=point({[state.factor]:state.shift}),factor=FACTORS.find(f=>f.key===state.factor);
  $('#s-scenario').value=c.active;
  const periodSelect=document.querySelector('#month-select');$('#s-month').innerHTML=periodSelect.innerHTML;$('#s-month').value=c.month;
  $('#s-cards').innerHTML=card('s-base-profit','Исходная чистая прибыль',rub(baseline.profit),'₽/мес. · выбранный сценарий',tone(baseline.profit))+card('s-test-profit','После изменения',rub(test.profit),'₽/мес. · один выбранный параметр',tone(test.profit))+card('s-profit-delta','Изменение прибыли',signed(test.delta),'₽/мес. · относительно исходного результата',tone(test.delta))+card('s-profit-margin',`Рентабельность продаж ${help('margin')}`,test.margin==null?'—':`${number.format(test.margin*100)}%`,'Чистая прибыль / выручка',tone(test.margin));
  const scenario=SCENARIOS.find(s=>s.id===c.active).label;
  $('#s-baseline-note').textContent=`${scenario} сценарий · ${periodSelect.selectedOptions[0]?.textContent??''}. Карточки показывают изменение только параметра «${factor.label}».`;
  const original=factorValue(c.params,c.deltas,state.factor);
  $('#s-value-change').textContent=`${factor.label}: ${number.format(original)} → ${test.valid?number.format(test.values[state.factor]):'—'} ${factor.unit}.${original===0?' Нулевое исходное значение остаётся нулевым. Чтобы проверить другое значение, измените базу в «Сценариях».':''}`;
  $('#s-point-error').textContent=test.valid?'':errorText(test);$('#s-shift').setAttribute('aria-invalid',String(!test.valid));
  root.querySelectorAll('[data-shift]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.shift)===state.shift)));
  const magnitudeValid=Number.isFinite(state.magnitude)&&state.magnitude>0&&state.magnitude<=100;
  $('#s-magnitude-error').textContent=magnitudeValid?'':'Укажите отклонение больше 0 и не больше 100%.';
  $('#s-custom').setAttribute('aria-invalid',String(!magnitudeValid));
  if(baseline.valid&&magnitudeValid)renderTornado(tornadoRows(c.params,c.deltas,state.magnitude,c.month));
  else $('#s-tornado').innerHTML='<p class="s-empty">Проверьте параметры для расчёта влияния факторов.</p>';
  $('#s-curve-caption').textContent=`${factor.label} · ${factor.unit}. Изменение относительно сценария, шаг 5%.`;
  const points=Array.from({length:state.range*2/5+1},(_,i)=>{const shift=-state.range+i*5;return {shift,...point({[state.factor]:shift})};});
  renderCurve(points,test,baseline);
  $('#s-point-table').innerHTML=`<thead><tr><th scope="col">Изменение, %</th><th scope="col">Значение, ${esc(factor.unit)}</th><th scope="col">Чистая прибыль, ₽/мес.</th></tr></thead><tbody>${points.map(p=>`<tr class="${p.shift===0?'s-origin':''}"><th scope="row">${shiftLabel(p.shift)}${p.shift===0?' · исходное':''}</th><td>${p.valid?number.format(p.values[state.factor]):'—'}</td><td class="${p.valid?tone(p.profit):'s-unavailable'}">${p.valid?rub(p.profit):`Недоступно<small>${esc(errorText(p))}</small>`}</td></tr>`).join('')}</tbody>`;
  renderMatrix();
 }
 function renderTornado(rows){
  const maximum=Math.max(1,...rows.map(r=>r.impact));
  $('#s-tornado').innerHTML=`<div class="s-tornado-axis"><span>Снижение прибыли ←</span><span>→ Рост прибыли</span></div>${rows.map(r=>`<button type="button" class="s-tornado-row ${state.factor===r.key?'selected':''}" data-factor="${r.key}" aria-label="Исследовать: ${r.label}"><span class="s-factor-name">${r.label}<small>${r.unit}</small></span><span class="s-bars">${[['lower',r.lower],['upper',r.upper]].map(([side,p])=>`<span class="s-bar-line"><span class="s-bar-track">${p.valid?`<i class="s-${side}" style="left:${p.delta<0?50-Math.abs(p.delta)/maximum*48:50}%;width:${Math.abs(p.delta)/maximum*48}%"></i>`:''}</span><span class="s-bar-value ${p.valid?tone(p.delta):'s-unavailable'}">${p.valid?signed(p.delta):'Недоступно'}</span></span>`).join('')}</span><span class="s-sr-only">Уменьшение на ${state.magnitude}%: ${r.lower.valid?signed(r.lower.delta):esc(errorText(r.lower))}. Увеличение на ${state.magnitude}%: ${r.upper.valid?signed(r.upper.delta):esc(errorText(r.upper))}.</span>${!r.lower.valid||!r.upper.valid?`<span class="s-row-error">${esc(errorText(!r.lower.valid?r.lower:r.upper))}</span>`:''}</button>`).join('')}`;
 }
 function renderCurve(points,test,baseline){
  const valid=points.filter(p=>p.valid);
  if(!valid.length){$('#s-curve').innerHTML='<p class="s-empty">Проверьте исходные параметры для построения графика.</p>';return;}
  const width=Math.max(290,$('#s-curve').clientWidth||700),height=310,left=78,right=24,top=26,bottom=52;
  const included=test.valid&&Math.abs(state.shift)<=state.range?[...valid,test]:valid;
  let low=Math.min(0,...included.map(p=>p.profit)),high=Math.max(0,...included.map(p=>p.profit));
  const spread=high-low||1;low-=spread*.08;high+=spread*.08;
  const x=v=>left+(v+state.range)/(state.range*2)*(width-left-right),y=v=>top+(high-v)/(high-low)*(height-top-bottom);
  let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="График чистой прибыли. Точные значения в таблице ниже."><title>Чистая прибыль при изменении параметра</title><text x="${left}" y="15" fill="#657874" font-size="12">тыс. ₽/мес.</text>`;
  for(let i=0;i<5;i++){const value=low+(high-low)*i/4;svg+=`<line x1="${left}" x2="${width-right}" y1="${y(value)}" y2="${y(value)}" stroke="#e3e9e6"/><text x="${left-8}" y="${y(value)+4}" text-anchor="end" fill="#657874" font-size="12">${number.format(value/1000)}</text>`;}
  svg+=`<line x1="${left}" x2="${width-right}" y1="${y(0)}" y2="${y(0)}" stroke="#a63e35" stroke-dasharray="5 4"/><line x1="${x(0)}" x2="${x(0)}" y1="${top}" y2="${height-bottom}" stroke="#82948c" stroke-dasharray="4 4"/>`;
  let path='',previousValid=false;
  for(const p of points){if(p.valid){path+=`${previousValid?'L':'M'}${x(p.shift)},${y(p.profit)} `;previousValid=true;}else previousValid=false;}
  svg+=`<path d="${path}" fill="none" stroke="#26705e" stroke-width="3"/>`;
  for(const p of valid)svg+=`<circle cx="${x(p.shift)}" cy="${y(p.profit)}" r="${p.shift===0?5:3}" fill="${p.shift===0?'#182f2c':'#26705e'}"><title>${shiftLabel(p.shift)}: ${rub(p.profit)}</title></circle>`;
  if(test.valid&&Math.abs(state.shift)<=state.range)svg+=`<circle cx="${x(state.shift)}" cy="${y(test.profit)}" r="7" fill="#b7763a" stroke="white" stroke-width="2"><title>Выбранное изменение ${shiftLabel(state.shift)}: ${rub(test.profit)}</title></circle>`;
  for(const v of [-state.range,0,state.range])svg+=`<text x="${x(v)}" y="${height-28}" text-anchor="${v<0?'start':v>0?'end':'middle'}" fill="#657874" font-size="12">${shiftLabel(v)}</text>`;
  svg+=`<text x="${width/2}" y="${height-6}" text-anchor="middle" fill="#657874" font-size="12">Изменение параметра, %</text></svg>`;
  $('#s-curve').innerHTML=svg+`<p class="s-graph-note">Пунктирная горизонталь — нулевая прибыль. ${test.valid&&Math.abs(state.shift)<=state.range?'Оранжевая точка — выбранное изменение.':test.valid?'Выбранное изменение за пределами графика; результат показан в карточках.':''}</p>`;
 }
 function renderMatrix(){
  for(const axis of ['x','y']){const select=$(`#s-matrix-${axis}`);select.value=state[axis];[...select.options].forEach(o=>o.disabled=o.value===state[axis==='x'?'y':'x']);}
  const shifts=[-20,-10,0,10,20],fx=FACTORS.find(f=>f.key===state.x),fy=FACTORS.find(f=>f.key===state.y),c=getContext();
  const effective=(key,s)=>`${number.format(factorValue(c.params,c.deltas,key)*(1+s/100))}`;
  const cells=shifts.map(y=>shifts.map(x=>point({[state.x]:x,[state.y]:y}))),max=Math.max(1,...cells.flat().filter(p=>p.valid).map(p=>Math.abs(p.profit)));
  $('#s-matrix').innerHTML=`<caption>${fy.label} (${fy.unit}) × ${fx.label} (${fx.unit}). Центр — исходный сценарий.</caption><thead><tr><th scope="col">${fy.label} ↓<br>${fx.label} →</th>${shifts.map(s=>`<th scope="col">${shiftLabel(s)}<small>${effective(state.x,s)} ${fx.unit}</small></th>`).join('')}</tr></thead><tbody>${shifts.map((y,i)=>`<tr><th scope="row">${shiftLabel(y)}<small>${effective(state.y,y)} ${fy.unit}</small></th>${shifts.map((x,j)=>{const p=cells[i][j],origin=x===0&&y===0,alpha=p.valid ? 0.05+0.17*Math.abs(p.profit)/max : 0;return `<td ${origin?'data-matrix-origin="true"':''} class="${origin?'s-origin ':''}${p.valid?tone(p.profit):'s-unavailable'}" style="background:${p.valid?`rgba(${p.profit<0?'166,62,53':'38,112,94'},${alpha})`:'#f3f5f6'}">${p.valid?rub(p.profit):`Недоступно<small>${esc(errorText(p))}</small>`}${origin?'<small>Исходный результат</small>':''}</td>`;}).join('')}</tr>`).join('')}</tbody>`;
 }
 return {render,activate(){render();if(!tourSeen)startTour();},deactivate(){if(dialog.open)closeDialog();},resize(){if(!root.hidden)render();}};
}
