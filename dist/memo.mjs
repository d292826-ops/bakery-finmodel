import {SCENARIOS} from './model.mjs';
import {factorValue,FACTORS} from './sensitivity-model.mjs';
import {SOLUTIONS,analyzeMemo,experimentModel} from './memo-model.mjs';
const number=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const money=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const rub=v=>Number.isFinite(v)?`${money.format(v)} ₽`:'—';
const pct=v=>Number.isFinite(v)?`${number.format(v*100)}%`:'—';
const signed=v=>Number.isFinite(v)?`${v>0?'+':''}${rub(v)}`:'—';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tone=v=>v<0?'negative':v>0?'positive':'neutral';
const payback=model=>!model?.valid?'—':model.metrics.paybackMonth?`${model.metrics.paybackMonth}-й месяц`:'Не окупается за горизонт';
const helpText={
 guide:['Как работать с запиской','1. Выберите сценарий и месяц вверху. 2. Прочитайте вывод и проверьте устойчивость. 3. Выберите решения и укажите бюджет. 4. Сравните результат с исходным сценарием. Подсказки i объясняют расчёты; ссылки ведут к подробным отчётам.'],
 conclusion:['Как формируется вывод','Вывод зависит от чистой прибыли выбранного месяца и результата снижения посещаемости на заданный процент. «Устойчив к выбранному тесту» означает только прохождение этого теста, а не общую оценку инвестиционной привлекательности.'],
 profit:['Чистая прибыль','Тот же показатель строки 44 ОПиУ, что на других вкладках: результат после расходов, амортизации и налога. Это плановый расчёт, а не фактически полученная прибыль.'],
 target:['Цель по прибыли','Введите желаемую чистую прибыль за месяц. Модель подбирает минимальное целое число посетителей для этой цели, сохраняя конверсию, чек и остальные параметры выбранного сценария. Это требование к объёму продаж, а не прогноз спроса.'],
 breakeven:['Порог безубыточности','Минимальное целое число посетителей, при котором чистая прибыль неотрицательна. Подбор выполняется существующей моделью в диапазоне от 0 до 1 000 000 посетителей/мес. Если цель в этом диапазоне недостижима, число не показывается. Рост мощностей и новые сотрудники автоматически не добавляются.'],
 stress:['Проверка снижения продаж','В тесте уменьшается только посещаемость. Конверсия, средний чек и затраты сохраняют правила выбранного сценария. Процент снижения — ваше допущение, а не оценка вероятности.'],
 cash:['Почему деньги отличаются от прибыли','Сравнивается прибыль и денежный поток выбранного месяца до CAPEX. Амортизация не является выплатой, а состав и сроки денежных выплат отличаются от расходов. В этой модели часть разницы вызвана упрощениями исходной таблицы: подробности раскрыты ниже.'],
 experiment:['Как проверяются решения','Все отмеченные изменения применяются одновременно поверх выбранного сценария. Эффекты продаж перемножаются, поэтому итог не равен простой сумме отдельных выгод. Исходные параметры не меняются. При выборе другого сценария пакет проверяется на новой базе.'],
 budget:['Бюджет внедрения','Дополнительные регулярные расходы в ₽/мес. Они один раз добавляются к маркетингу в ОПиУ и ДДС экспериментального расчёта, начиная с первого месяца и на весь горизонт. Разовые вложения здесь не моделируются. Укажите реальные расходы до оценки выгоды.'],
 actions:['План действий','Флажки помогают отметить выполненные шаги в этом открытом окне. Они не подтверждают достижение финансового результата. Сверяйте результаты тестов с фактическими продажами и расходами.']
};
const help=key=>`<button type="button" class="s-help" data-memo-help="${key}" aria-label="Подсказка: ${helpText[key][0]}">i</button>`;
const metric=(id,label,value,hint,style='')=>`<article class="metric"><p>${label}</p><strong id="${id}" class="${style}">${value}</strong><span>${hint}</span></article>`;

export function createMemo(root,getContext){
 const $=s=>root.querySelector(s);
 const state={target:50000,stress:10,budget:0,selected:new Set(),shifts:Object.fromEntries(SOLUTIONS.map(s=>[s.key,s.shift]))};
 let origin=null;
 root.innerHTML=`<div class="m-toolbar"><p id="m-context"></p><button type="button" class="s-button" data-memo-help="guide">Как читать записку</button></div>
 <nav class="m-jumps" aria-label="Разделы аналитической записки"><button data-memo-section="m-summary">Вывод</button><button data-memo-section="m-resilience">Устойчивость</button><button data-memo-section="m-money">Прибыль и деньги</button><button data-memo-section="m-solutions">Решения</button><button data-memo-section="m-plan">План действий</button></nav>
 <div id="m-invalid" role="alert" hidden></div><div id="m-content">
 <section class="m-summary" id="m-summary"><div class="m-summary-heading"><span class="eyebrow">ВЫВОД ПО СЦЕНАРИЮ</span>${help('conclusion')}</div><h2 id="m-verdict"></h2><p id="m-verdict-text"></p><a href="#reports">Посмотреть исходные отчёты →</a></section>
 <div class="m-metrics" id="m-metrics"></div>
 <section class="chart-panel m-panel" id="m-resilience"><div class="s-panel-heading"><div><h2>Какой запас у проекта ${help('breakeven')}</h2><p>Проверьте снижение посещаемости и задайте цель по чистой прибыли.</p></div><a href="#sensitivity">Открыть чувствительность →</a></div>
 <div class="m-resilience-grid"><div><label class="field"><span>Снижение посещаемости <em>%</em> ${help('stress')}</span><input id="m-stress" type="number" min="0" max="100" step="any" value="10" data-unit="%"></label><div id="m-stress-result" aria-live="polite"></div></div><div><label class="field"><span>Целевая чистая прибыль <em>₽/мес.</em> ${help('target')}</span><input id="m-target" type="number" min="0" step="any" value="50000" data-unit="₽/мес."></label><div id="m-target-result" aria-live="polite"></div></div></div><p class="m-assumption">Конверсия, чек и остальные параметры сохраняются. Требуемый объём нужно сопоставить со спросом и производственной мощностью.</p></section>
 <section class="chart-panel m-panel" id="m-money"><div class="s-panel-heading"><div><h2>Прибыль и окупаемость: что стоит за цифрами ${help('cash')}</h2><p>Связь ОПиУ и ДДС за выбранный месяц, до инвестиций в оборудование.</p></div></div><div id="m-cash-summary"></div><details class="m-details"><summary>Раскрыть разницу между прибылью и денежным потоком</summary><div class="table-scroll" tabindex="0" aria-label="Сверка прибыли и денежного потока"><table id="m-bridge"></table></div></details>
 <div class="m-method-risk"><h3>Что проверить перед инвестиционным решением</h3><p>В исходном ДДС нет отдельных выплат за упаковку, санитарию и логистику; отсроченная часть оплаты сырья не погашается в следующих месяцах. В ОПиУ ФОТ учитывается без множителя 1,34, который применяется в ДДС, а амортизация рассчитана только по первой позиции оборудования.</p><p>Рекомендация: сначала сверить эти суммы и сроки с реальным бюджетом. Текущие NPV и срок окупаемости зависят от сохранённой методики и сами по себе не подтверждают готовность проекта к запуску.</p><a href="#reports">Проверить ОПиУ и ДДС →</a></div></section>
 <section class="chart-panel m-panel" id="m-solutions"><div class="s-panel-heading"><div><h2>Решения, которые можно проверить ${help('experiment')}</h2><p>Гипотезы для теста. Выберите одну или несколько, задайте изменения и расходы на внедрение.</p></div><button type="button" class="text-button" id="m-reset">Сбросить пакет</button></div><div id="m-solution-list" class="m-solutions-grid">${SOLUTIONS.map(s=>`<article class="m-solution"><label class="m-solution-toggle"><input type="checkbox" data-memo-solution="${s.key}"><span>${s.title}</span></label><label class="field"><span>Изменение <em>% к сценарию</em></span><input type="number" min="-100" step="any" value="${s.shift}" data-memo-shift="${s.key}" data-unit="% к сценарию" aria-label="${s.title}: изменение, % к сценарию"></label><p class="m-solution-value" data-memo-value="${s.key}"></p><p class="m-gain" data-memo-gain="${s.key}"></p><details class="m-details"><summary>Как проверить на практике</summary><p>${s.action}</p><p>${s.check}</p></details></article>`).join('')}</div>
 <div class="m-experiment-footer"><label class="field"><span>Бюджет внедрения <em>₽/мес.</em> ${help('budget')}</span><input id="m-budget" type="number" min="0" step="any" value="0" data-unit="₽/мес."></label><p>Общий бюджет учитывается один раз. Рост продаж не гарантирован; стоимость и длительность теста определяете вы.</p></div><div id="m-experiment" aria-live="polite"></div><p class="m-assumption">Пакет действует с первого месяца на весь горизонт. Отдельные эффекты приведены до бюджета; итог — после бюджета. Основная модель не изменяется.</p></section>
 <section class="chart-panel m-panel" id="m-recommendations"><h2>Приоритеты по текущему расчёту</h2><ol id="m-recommendations-list" class="m-recommendations"></ol></section>
 <section class="chart-panel m-panel" id="m-plan"><div class="s-panel-heading"><h2>План проверки решений ${help('actions')}</h2><span id="m-progress" role="status">0 из 4 выполнено</span></div><div class="m-plan-list">${[
 ['Сверить бюджет и методику','Проверить выплаты за сырьё, упаковку и логистику, начисления ФОТ, состав оборудования и реальный маркетинговый бюджет.'],
 ['Собрать фактическую базу','Зафиксировать посещаемость, конверсию, чек, списания и расходы за сопоставимый период.'],
 ['Провести ограниченный тест','Выбрать одну гипотезу, указать её бюджет и сравнить прибыль с исходным периодом. Контролировать качество, число покупок и нагрузку.'],
 ['Обновить сценарии по результатам','Внести подтверждённые значения на вкладке «Сценарии» и повторно проверить прибыль, денежный поток и потребность в финансировании.']
 ].map(([title,text],i)=>`<label class="m-plan-item"><input type="checkbox" data-memo-task="${i}"><span><strong>${title}</strong><small>${text}</small></span></label>`).join('')}</div></section>
 <details class="m-details m-sources"><summary>Основания выводов и границы анализа</summary><p>Числа взяты из текущих параметров и действующих расчётов ОПиУ и ДДС. Чистая прибыль — строка 44; рентабельность — строка 45; денежный поток — строка 61. Разница до CAPEX = денежный поток + инвестиции − чистая прибыль. Цели и безубыточность подбираются повторными расчётами модели по посещаемости. Суммы не округляются до вывода на экран.</p><p>Чувствительность оценивает последствия допущений. При анализе объёма продаж важно проверять постоянство структуры продаж и поведения затрат в рассматриваемом диапазоне. Методическая основа: <a href="https://www.accaglobal.com/gb/en/student/exam-support-resources/fundamentals-exams-study-resources/f5/technical-articles/CVP-analysis.html" target="_blank" rel="noopener noreferrer">ACCA — Cost-volume-profit analysis</a>. Рыночный спрос, мощность пекарни и реализуемость решений этим расчётом не подтверждаются.</p><p>Записка обновляется при смене сценария, месяца и исходных параметров. Эксперименты и отметки плана сохраняются только до перезагрузки страницы.</p></details></div>
 <dialog class="s-dialog m-dialog" aria-labelledby="m-help-title" aria-describedby="m-help-text"><button type="button" class="s-dialog-close" aria-label="Закрыть подсказку">×</button><h2 id="m-help-title"></h2><p id="m-help-text"></p></dialog>`;
 const dialog=$('dialog');
 root.addEventListener('click',e=>{
  const hint=e.target.closest('[data-memo-help]');if(hint){origin=hint;const [title,text]=helpText[hint.dataset.memoHelp];$('#m-help-title').textContent=title;$('#m-help-text').textContent=text;dialog.showModal();}
  const jump=e.target.closest('[data-memo-section]');if(jump)$(`#${jump.dataset.memoSection}`).scrollIntoView({behavior:'instant',block:'start'});
 });
 $('.s-dialog-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>origin?.focus({preventScroll:true}));
 for(const key of ['stress','target','budget'])$(`#m-${key}`).oninput=e=>{state[key]=e.target.value.trim()===''?NaN:Number(e.target.value);render();};
 root.querySelectorAll('[data-memo-solution]').forEach(input=>input.onchange=()=>{input.checked?state.selected.add(input.dataset.memoSolution):state.selected.delete(input.dataset.memoSolution);render();});
 root.querySelectorAll('[data-memo-shift]').forEach(input=>input.oninput=()=>{state.shifts[input.dataset.memoShift]=input.value.trim()===''?NaN:Number(input.value);render();});
 root.querySelectorAll('[data-memo-task]').forEach(input=>input.onchange=()=>{$('#m-progress').textContent=`${root.querySelectorAll('[data-memo-task]:checked').length} из 4 выполнено`;});
 $('#m-reset').onclick=()=>{state.selected.clear();state.budget=0;$('#m-budget').value=0;for(const s of SOLUTIONS){state.shifts[s.key]=s.shift;$(`[data-memo-shift="${s.key}"]`).value=s.shift;$(`[data-memo-solution="${s.key}"]`).checked=false;}render();};
 function render(){
  const c=getContext(),a=analyzeMemo(c.params,c.deltas,c.month,state.target,state.stress),invalid=$('#m-invalid');
  invalid.hidden=a.valid;$('#m-content').hidden=!a.valid;
  $('#m-context').textContent=`${SCENARIOS.find(s=>s.id===c.active).label} сценарий · ${document.querySelector('#month-select').selectedOptions[0]?.textContent??''} · Плановые показатели`;
  if(!a.valid){invalid.textContent=a.errors.map(e=>e.message).join(' ');return;}
  const m=a.m,stress=a.stressModel?.valid?a.stressModel.months[c.month]:null;
  $('#m-verdict').textContent=m.netProfit<0?'Текущий сценарий убыточен':m.netProfit===0?'Проект находится на границе безубыточности':!stress?'Прибыль положительная; стресс-тест не задан':stress.netProfit<0?'Прибыль есть, но запас устойчивости мал':'Прибыль сохраняется в выбранном стресс-тесте';
  $('#m-summary').dataset.status=m.netProfit<=0||stress?.netProfit<0?'attention':'positive';
  $('#m-verdict-text').textContent=`При выручке ${rub(m.revenue)} чистая прибыль составляет ${rub(m.netProfit)} в месяц${m.netMargin!==null?`, рентабельность — ${pct(m.netMargin)}`:''}. ${stress?`Снижение посещаемости на ${number.format(state.stress)}% меняет прибыль до ${rub(stress.netProfit)}.`:'Укажите снижение посещаемости от 0 до 100%, чтобы проверить устойчивость.'} ${m.netProfit<0?'Сначала сократите разрыв до безубыточности и подтвердите экономику продаж.':stress?.netProfit<0?'Приоритет — увеличить запас прибыли и проверить фактические расходы.':'Далее проверьте денежные выплаты и достижимость предполагаемых продаж.'}`;
  const gap=a.breakEven?m.traffic-a.breakEven.traffic:null;
  $('#m-metrics').innerHTML=metric('m-net-profit',`Чистая прибыль ${help('profit')}`,rub(m.netProfit),'За выбранный месяц',tone(m.netProfit))+metric('m-profit-margin','Рентабельность',pct(m.netMargin),'Чистая прибыль / выручка',tone(m.netMargin))+metric('m-breakeven','Безубыточность',a.breakEven?number.format(a.breakEven.traffic):'Не найдена','Посетителей/мес. · при текущем чеке и конверсии')+metric('m-payback','Окупаемость',payback(a.model),`По ДДС · горизонт ${c.params.horizon} мес.`);
  $('#m-stress').setAttribute('aria-invalid',String(!a.stressValid));$('#m-stress-result').innerHTML=stress?`<p class="m-result-label">При посещаемости ${number.format(stress.traffic)} посетителей/мес.</p><strong class="m-result ${tone(stress.netProfit)}" id="m-stress-profit">${rub(stress.netProfit)}</strong><p>Чистая прибыль в месяц. ${gap!==null?gap>=0?`В исходном сценарии запас до порога безубыточности — ${number.format(gap)} посетителей/мес.${m.traffic>0?` (${pct(gap/m.traffic)} текущего трафика)`:''}.`:`В исходном сценарии до безубыточности не хватает ${number.format(-gap)} посетителей/мес.`:'Порог безубыточности в диапазоне подбора не найден.'}</p>`:'<p class="s-error">Укажите снижение посещаемости от 0 до 100%.</p>';
  const targetValid=Number.isFinite(state.target)&&state.target>=0;$('#m-target').setAttribute('aria-invalid',String(!targetValid));
  $('#m-target-result').innerHTML=!targetValid?'<p class="s-error">Укажите неотрицательную цель в ₽/мес.</p>':a.target?`<p class="m-result-label">Для цели ${rub(state.target)} в месяц требуется</p><strong class="m-result" id="m-target-traffic">${number.format(a.target.traffic)} <small>посетителей/мес.</small></strong><p>Выручка — ${rub(a.target.revenue)} в месяц. ${m.netProfit>=state.target?'Текущий сценарий уже достигает цели.':`Это на ${number.format(Math.max(0,a.target.traffic-m.traffic))} посетителей больше текущего сценария.`}</p>`:'<p class="s-error">Цель не достигается при посещаемости до 1 000 000 в месяц. Проверьте конверсию, чек и долю переменных расходов.</p>';
  $('#m-cash-summary').innerHTML=`<div class="m-cash-pair"><div><span>Чистая прибыль</span><strong>${rub(m.netProfit)}</strong></div><div><span>Поток до CAPEX</span><strong>${rub(a.bridge.operatingCash)}</strong></div><div><span>Разница</span><strong>${signed(a.bridge.gap)}</strong></div></div><p>Расчётная потребность в финансировании проекта — <strong>${rub(a.model.metrics.investmentNeed)}</strong>. Это максимальный дефицит накопленного потока; запас на непредвиденные расходы в него не добавлен.</p>`;
  $('#m-bridge').innerHTML=`<thead><tr><th scope="col">Переход от прибыли к денежному потоку</th><th scope="col">₽/мес.</th></tr></thead><tbody><tr><th scope="row">Чистая прибыль</th><td>${rub(m.netProfit)}</td></tr>${a.bridge.components.map(r=>`<tr><th scope="row">${r.label}</th><td class="${tone(r.value)}">${signed(r.value)}</td></tr>`).join('')}<tr class="row-total"><th scope="row">Денежный поток до CAPEX</th><td>${rub(a.bridge.operatingCash)}</td></tr><tr><th scope="row">CAPEX выбранного месяца</th><td>${signed(-m.capex)}</td></tr><tr class="row-strong"><th scope="row">Чистый денежный поток, строка 61 ДДС</th><td>${rub(m.netCashFlow)}</td></tr></tbody>`;
  renderExperiment(c,a);
 }
 function renderExperiment(c,a){
  const changes={},evaluated=[];
  for(const s of SOLUTIONS){
   const shift=state.shifts[s.key],test=experimentModel(c.params,c.deltas,{[s.key]:shift}),factor=FACTORS.find(f=>f.key===s.key),base=factorValue(c.params,c.deltas,s.key);
   if(state.selected.has(s.key))changes[s.key]=shift;
   const gain=test.valid?test.months[c.month].netProfit-a.m.netProfit:null;
   evaluated.push({...s,gain,shift});
   $(`[data-memo-shift="${s.key}"]`).setAttribute('aria-invalid',String(!test.valid));
   $(`[data-memo-value="${s.key}"]`).textContent=`${number.format(base)} → ${test.valid?number.format(base*(1+shift/100)):'—'} ${factor.unit}`;
   $(`[data-memo-gain="${s.key}"]`).innerHTML=test.valid?`<strong class="${tone(gain)}">${signed(gain)}</strong><span>к прибыли за месяц · отдельно, до бюджета</span>`:`<span class="s-error">${esc(test.errors.map(e=>e.message).join(' '))}</span>`;
   $(`[data-memo-solution="${s.key}"]`).closest('article').classList.toggle('chosen',state.selected.has(s.key));
  }
  const result=experimentModel(c.params,c.deltas,changes,state.budget);
  $('#m-budget').setAttribute('aria-invalid',String(!Number.isFinite(state.budget)||state.budget<0));
  if(!result.valid)$('#m-experiment').innerHTML=`<p class="s-error">${esc(result.errors.map(e=>e.message).join(' '))}</p>`;
  else{
   const m=result.months[c.month],gain=m.netProfit-a.m.netProfit;
   $('#m-experiment').innerHTML=`<h3>Итог пакета: ${state.selected.size} ${state.selected.size===1?'решение':state.selected.size===0?'решений':'решения'}</h3><div class="m-experiment-cards">${metric('m-package-profit','Чистая прибыль',rub(m.netProfit),'₽/мес. · после бюджета',tone(m.netProfit))+metric('m-package-gain','Эффект пакета',signed(gain),'₽/мес. · к выбранному сценарию',tone(gain))+metric('m-package-payback','Окупаемость',payback(result),'По действующей методике ДДС')}</div><p class="m-package-verdict">${!state.selected.size?state.budget>0?'Учтён только дополнительный бюджет: выберите решения, чтобы проверить эффект.':'Отметьте решения выше, чтобы сравнить их совместный эффект.':gain>0?`Пакет увеличивает расчётную прибыль на ${rub(gain)} в месяц. ${m.netProfit<0?'Однако проект остаётся убыточным.':'Проверьте достижимость изменений в ограниченном тесте.'}`:gain<0?'Пакет ухудшает прибыль с учётом бюджета. Пересмотрите затраты или состав решений.':'Пакет не меняет чистую прибыль. Проверьте величины изменений и бюджет.'}</p>`;
  }
  const best=evaluated.filter(s=>s.gain>0).sort((a,b)=>b.gain-a.gain)[0];
  const stress=a.stressModel?.valid?a.stressModel.months[c.month]:null;
  const priorities=[
   ['Сначала подтвердить расходы и денежные выплаты',`Сверьте упрощения ДДС и начисления ОПиУ с реальным бюджетом. Расчётная окупаемость «${payback(a.model)}» зависит от этих допущений.`],
   [a.m.netProfit<0?'Вернуть проект к безубыточности':stress?.netProfit<0?'Увеличить запас прибыли':'Подтвердить результат фактическими продажами',a.m.netProfit<0?`Убыток составляет ${rub(-a.m.netProfit)} в месяц. ${a.breakEven?`Ориентир при неизменных чеке и конверсии — ${number.format(a.breakEven.traffic)} посетителей/мес.`:'Одного роста посещаемости в пределах диапазона подбора недостаточно.'}`:stress?.netProfit<0?`Снижение посещаемости на ${number.format(state.stress)}% даёт убыток ${rub(-stress.netProfit)} в месяц. Проверьте меры роста прибыли до увеличения постоянных обязательств.`:'Проверьте посещаемость, конверсию, средний чек и фактическую себестоимость за сопоставимый период.'],
   [best?`Первый тест: ${best.title.toLowerCase()}`:'Пересмотреть выбранные гипотезы',best?`При изменении на ${number.format(best.shift)}% эта гипотеза даёт наибольший расчётный эффект среди четырёх проверяемых решений: ${signed(best.gain)}/мес. до бюджета. ${best.action} Выбор основан на эффекте, а сложность внедрения нужно оценить отдельно.`:'При заданных величинах ни одна из четырёх гипотез отдельно не увеличивает прибыль. Измените допущения и проверьте их обоснованность.']
  ];
  $('#m-recommendations-list').innerHTML=priorities.map(([title,text])=>`<li><h3>${esc(title)}</h3><p>${esc(text)}</p></li>`).join('');
 }
 return {render,activate:render,deactivate(){if(dialog.open)dialog.close();}};
}
