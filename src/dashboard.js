const get = id => document.getElementById(id);
const data = JSON.parse(get("dashboard-data").textContent);
const numbers = new Intl.NumberFormat("pt-BR");
const currency = new Intl.NumberFormat("pt-BR", {style:"currency", currency:"BRL"});
const dayFormat = new Intl.DateTimeFormat("pt-BR", {day:"2-digit", month:"2-digit", timeZone:"UTC"});
const fullDate = new Intl.DateTimeFormat("pt-BR", {dateStyle:"short", timeZone:"UTC"});
const stamp = new Intl.DateTimeFormat("pt-BR", {dateStyle:"short", timeStyle:"short", timeZone:"America/Sao_Paulo"});
const money = cents => currency.format(cents / 100);
const percent = (value, denominator) => denominator ? numbers.format(Math.round(1000 * value / denominator) / 10) + "%" : "—";
const per = (total, count) => count ? money(total / count) : "—";
const stages = ["Impressões", "Cliques no link", "Visualizações da página", "Checkouts iniciados"];
const pages = {geral:"Visão Geral", meta:"Meta Ads", relatorio:"Relatórios"};
const days = [...new Set([...data.meta, ...data.sales].map(row => row[0]))].sort();
const campaigns = [...new Set(data.meta.map(row => row[1]))].sort();


function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  if (className) node.className = className;
  return node;
}
function totals(rows, start, count) {
  return rows.reduce((sum, row) => {
    for (let i = 0; i < count; i++) sum[i] += row[start + i];
    return sum;
  }, Array(count).fill(0));
}
function grouped(rows, index) {
  const result = new Map();
  for (const row of rows) {
    if (!result.has(row[index])) result.set(row[index], []);
    result.get(row[index]).push(row);
  }
  return result;
}
function table(id, headers, entries) {
  const head = element("thead");
  const header = element("tr");
  for (const label of headers) {
    const cell = element("th", label);
    cell.scope = "col";
    header.append(cell);
  }
  head.append(header);
  const body = element("tbody");
  for (const [values, detail] of entries) {
    const row = element("tr");
    for (const value of values) row.append(element("td", value));
    if (detail) row.firstChild.replaceChildren(...detail);
    body.append(row);
  }
  if (!entries.length) {
    const row = element("tr");
    const cell = element("td", "Nenhum dado no período selecionado.");
    cell.colSpan = headers.length;
    row.append(cell);
    body.append(row);
  }
  get(id).replaceChildren(head, body);
}
function renderFunnel(meta, sales, mode) {
  const [spend, impressions, clicks, views, checkouts] = meta;
  const [orders, revenue] = sales;
  const roas = spend ? numbers.format(Math.round(revenue / spend * 100) / 100) + "x" : "—";
  const steps = [
    ["Gasto Total", money(spend), "var(--red)", []],
    ["Impressões", numbers.format(impressions), "var(--cyan)", [["CPM", per(spend * 1000, impressions)]]],
    ["Cliques", numbers.format(clicks), "var(--blue)", [["CPC", per(spend, clicks)], ["CTR", percent(clicks, impressions)]]],
    ["Page Views", numbers.format(views), "var(--purple)", [["CPV", per(spend, views)], ["CR", percent(views, clicks)]]],
    ["Checkouts", numbers.format(checkouts), "var(--yellow)", [["CPIC", per(spend, checkouts)], ["VisCHK", percent(checkouts, views)]]],
    ["Vendas", numbers.format(orders), "#ec4899", [["CAC", per(spend, orders), "pill"], ["ConvCHK", percent(orders, checkouts)]]],
    ["Faturamento", money(revenue), "var(--green)", [["ROAS", roas, "pill roas"], ["Ticket Médio", per(revenue, orders)]]]
  ];
  get("funnel").replaceChildren(...steps.map(([label, value, color, details], index) => {
    const stage = element("div", undefined, "stage" + ([0, 6].includes(index) ? " highlight" : ""));
    stage.style.setProperty("--stage-color", color);
    const main = element("div", undefined, "stage-main");
    main.append(element("span", label), element("strong", value));
    const secondary = element("div", undefined, "stage-secondary");
    for (const [name, metric, className] of details) {
      const item = element("div");
      item.append(element("span", name), element("b", metric, className));
      secondary.append(item);
    }
    stage.append(main, secondary);
    return stage;
  }));
  get("funnel-note").textContent = mode === "meta"
    ? "Vendas e faturamento atribuídos ao Meta Ads por UTM. As demais etapas vêm do gerenciador."
    : "Vendas e faturamento de todas as origens. Gasto e etapas de tráfego vêm do Meta Ads; CAC, ROAS e conversões relacionam essas bases.";
}

const charts = new Map();
const ratio = (value, denominator, factor = 1) => denominator ? value / denominator * factor : null;
const color = name => getComputedStyle(document.documentElement).getPropertyValue("--" + name).trim();
function makeChart(id, daily, datasets, scales) {
  charts.get(id)?.destroy();
  const muted = color("muted"), grid = color("line");
  charts.set(id, new Chart(get(id), {
    type:"line",
    data:{labels:daily.map(row => dayFormat.format(new Date(row[0]))), datasets},
    options:{
      responsive:true, maintainAspectRatio:false, animation:false,
      interaction:{intersect:false, mode:"index"},
      elements:{line:{borderWidth:2,tension:.25},point:{radius:3,hoverRadius:5}},
      plugins:{legend:{labels:{color:color("ink"),usePointStyle:true,boxWidth:9,boxHeight:9,font:{size:11}}},
        tooltip:{callbacks:{label:context=>{
          const value = context.parsed.y;
          const axis = context.dataset.yAxisID;
          return context.dataset.label + ": " + (value === null ? "—" : axis === "money" ? currency.format(value) : axis === "roas" ? numbers.format(value) + "x" : axis === "percent" ? numbers.format(Math.round(value * 100) / 100) + "%" : numbers.format(value));
        }}}},
      scales:{x:{grid:{display:false},ticks:{color:muted,font:{size:10},maxRotation:50,minRotation:35}}, ...Object.fromEntries(Object.entries(scales).map(([key, settings]) => [key, {
        beginAtZero:true,grid:{color:grid,drawOnChartArea:key === Object.keys(scales)[0]},border:{display:false},
        ticks:{color:muted,font:{size:10},maxTicksLimit:7,...settings.ticks},...settings
      }]))}
    }
  }));
}
function line(label, values, shade, axis) {
  return {label,data:values,borderColor:shade,backgroundColor:shade,yAxisID:axis};
}
function renderChart(daily, mode) {
  get("chart-note").textContent = "Vendas (barras) · Gasto (vermelho) · Faturamento (verde) · ROAS (eixo próprio). " +
    (mode === "meta" ? "Vendas atribuídas ao Meta Ads." : "Vendas e faturamento totais.");
  get("conversion-scope").textContent = mode === "meta" ? "Pedidos atribuídos ao Meta Ads" : "Pedidos de todas as origens";
  if (typeof Chart !== "function") {
    get("chart-fallback").hidden = false;
    return;
  }
  get("chart-fallback").hidden = true;
  const dark = document.documentElement.dataset.theme === "dark";
  const currencyTicks = {callback:value=>numbers.format(value),color:color("muted"),font:{size:10}};
  const percentTicks = {callback:value=>numbers.format(value)+"%",color:color("muted"),font:{size:10}};
  makeChart("trend", daily, [
    line("ROAS", daily.map(row=>ratio(row[2][1],row[1][0])), dark ? "#f4f7fb" : "#252b36", "roas"),
    line("Gasto", daily.map(row=>row[1][0]/100), color("red"), "money"),
    line("Faturamento", daily.map(row=>row[2][1]/100), color("green"), "money"),
    {...line("Vendas",daily.map(row=>row[2][0]),color("blue"),"orders"),type:"bar",borderRadius:2,maxBarThickness:24}
  ], {orders:{position:"left",ticks:{precision:0,color:color("muted"),font:{size:10}}},
    money:{position:"right",ticks:currencyTicks},roas:{position:"right",ticks:{callback:value=>numbers.format(value)+"x",color:color("muted"),font:{size:10}}}});
  makeChart("cost-chart", daily, [
    line("CPM",daily.map(row=>ratio(row[1][0]/100,row[1][1],1000)),color("yellow"),"money"),
    line("CTR",daily.map(row=>ratio(row[1][2],row[1][1],100)),color("cyan"),"percent")
  ],{money:{position:"left",ticks:{...currencyTicks,callback:value=>currency.format(value)}},percent:{position:"right",ticks:percentTicks}});
  makeChart("connect-chart", daily, [
    line("CR",daily.map(row=>ratio(row[1][3],row[1][2],100)),color("blue"),"percent"),
    line("VisCHK",daily.map(row=>ratio(row[1][4],row[1][3],100)),color("green"),"percent")
  ],{percent:{ticks:percentTicks}});
  makeChart("conversion-chart", daily, [
    line("ConvLP",daily.map(row=>ratio(row[2][0],row[1][3],100)),color("yellow"),"percent"),
    line("ConvCHK",daily.map(row=>ratio(row[2][0],row[1][4],100)),color("green"),"percent")
  ],{percent:{ticks:percentTicks}});
}
function dailyValues(metrics, sales) {
  const [spend, impressions, clicks, views, checkouts] = metrics;
  const [orders, revenue] = sales;
  return [money(spend), per(spend*1000,impressions),percent(clicks,impressions),percent(views,clicks),
    percent(checkouts,views),percent(orders,checkouts),numbers.format(orders),money(revenue),per(spend,orders),
    spend ? numbers.format(Math.round(revenue/spend*100)/100)+"x" : "—"];
}
function renderDaily(daily, summary, sales) {
  const weekday = new Intl.DateTimeFormat("pt-BR",{weekday:"short",timeZone:"UTC"});
  const headings = ["Data","Dia","Gasto","CPM","CTR","CR","VisCHK","ConvCHK","Vendas","Faturamento","CAC","ROAS"];
  table("trend-table", headings, [...daily].reverse().map(([day, metrics, sales]) => {
    const button = element("button",fullDate.format(new Date(day)),"date-link");
    button.type="button";
    button.addEventListener("click",()=>{get("start").value=day;get("end").value=day;render();});
    return [["",weekday.format(new Date(day)),...dailyValues(metrics,sales)],[button]];
  }));
  const foot = element("tfoot"), row = element("tr");
  ["Total Geral","",...dailyValues(summary,sales)].forEach(value=>row.append(element("td",value)));
  foot.append(row);get("trend-table").append(foot);
  const maxSpend = Math.max(1,...daily.map(row=>row[1][0]));
  const maxRevenue = Math.max(1,...daily.map(row=>row[2][1]));
  [...get("trend-table").tBodies[0].rows].forEach((row,index)=>{
    const source=[...daily].reverse()[index];
    if (!source) return;
    row.cells[2].style.backgroundColor="rgb(239 68 68 / "+(.08+.3*source[1][0]/maxSpend)+")";
    row.cells[9].style.backgroundColor="rgb(34 197 94 / "+(.08+.3*source[2][1]/maxRevenue)+")";
  });
}

const entityMetrics = [
  {id:"spend",label:"Gasto",unit:"money",value:(m,s)=>m[0]/100},
  {id:"cpm",label:"CPM",unit:"money",value:(m,s)=>ratio(m[0]/100,m[1],1000)},
  {id:"ctr",label:"CTR",unit:"percent",value:(m,s)=>ratio(m[2],m[1],100)},
  {id:"cr",label:"CR",unit:"percent",value:(m,s)=>ratio(m[3],m[2],100)},
  {id:"vischk",label:"VisCHK",unit:"percent",value:(m,s)=>ratio(m[4],m[3],100)},
  {id:"convchk",label:"ConvCHK",unit:"percent",value:(m,s)=>ratio(s[0],m[4],100)},
  {id:"orders",label:"Vendas",unit:"orders",value:(m,s)=>s[0]},
  {id:"cac",label:"CAC",unit:"money",value:(m,s)=>ratio(m[0]/100,s[0])},
  {id:"revenue",label:"Faturamento",unit:"money",value:(m,s)=>s[1]/100},
  {id:"ticket",label:"Ticket",unit:"money",value:(m,s)=>ratio(s[1]/100,s[0])},
  {id:"roas",label:"ROAS",unit:"roas",value:(m,s)=>ratio(s[1],m[0])}
];
const entityLevels = [
  {id:"campaigns",title:"Campanhas",singular:"Campanha",level:1},
  {id:"adsets",title:"Conjuntos (Ad Sets)",singular:"Conjunto",level:2},
  {id:"ads",title:"Anúncios",singular:"Anúncio",level:3}
];
const entityState = Object.fromEntries(entityLevels.map(item=>[item.id,{selected:new Set(),metrics:new Set(["spend"]),total:false}]));
const seriesColors = ["#2f6bff","#16d66b","#ffb020","#9d5cff","#ff3b47","#1fd5ec","#ff4d8d","#9be015","#ff8a1f","#6d7bff"];
function metricText(value, unit) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (unit === "money") return currency.format(value);
  if (unit === "percent") return numbers.format(Math.round(value*100)/100)+"%";
  if (unit === "roas") return numbers.format(Math.round(value*100)/100)+"x";
  return numbers.format(value);
}
function entityKey(row, level) { return JSON.stringify(row.slice(1,level+1)); }
function entityGroups(rows, level, sales) {
  const groups = new Map();
  const knownKeys = new Set(data.meta.map(row=>entityKey(row,level)));
  for (const row of rows) {
    const key=entityKey(row,level);
    if (!groups.has(key)) groups.set(key,{key,path:row.slice(1,level+1),rows:[],sales:[]});
    groups.get(key).rows.push(row);
  }
  for (const sale of sales) {
    if (sale.slice(1,level+1).some(name=>!name)) continue;
    const key=entityKey(sale,level);
    if (!knownKeys.has(key)) continue;
    if (!groups.has(key)) groups.set(key,{key,path:sale.slice(1,level+1),rows:[],sales:[]});
    groups.get(key).sales.push(sale);
  }
  return [...groups.values()].sort((a,b)=>totals(b.rows,4,5)[0]-totals(a.rows,4,5)[0] || a.key.localeCompare(b.key));
}
function entityMeasures(group) { return [totals(group.rows,4,5),totals(group.sales,4,2)]; }
function renderEntityAnalysis(meta, within) {
  const root=get("entity-analysis");
  if (!root.childElementCount) {
    const introduction=element("div",undefined,"entity-introduction");
    introduction.append(element("h2","Campanhas, conjuntos e anúncios"),element("p",
      "Clique no cabeçalho para escolher a métrica ou em um valor para ver aquele item no gráfico. Ctrl/⌘ + clique compara métricas. Selecione linhas para comparar itens; campanhas filtram conjuntos e anúncios, e conjuntos filtram anúncios.","note"));
    root.append(introduction);
    for (const config of entityLevels) {
      const card=element("section",undefined,"entity-card");
      card.id=config.id+"-panel";
      const heading=element("div",undefined,"entity-heading");
      heading.append(element("h2",config.title));
      const clear=element("button","Limpar seleção","entity-clear");
      clear.type="button";
      clear.addEventListener("click",()=>{entityState[config.id].selected.clear();entityState[config.id].total=false;render();});
      heading.append(clear);
      const scroller=element("div",undefined,"table-scroll entity-scroll");
      const tableNode=element("table");tableNode.id=config.id+"-table";scroller.append(tableNode);
      const chartHeader=element("div",undefined,"entity-chart-header");
      const title=element("h3");title.id=config.id+"-chart-title";
      const status=element("p",undefined,"note");status.id=config.id+"-chart-status";status.setAttribute("role","status");
      chartHeader.append(title,status);
      const chartBox=element("div",undefined,"chart entity-chart");
      const canvas=element("canvas");canvas.id=config.id+"-chart";canvas.setAttribute("role","img");chartBox.append(canvas);
      card.append(heading,scroller,chartHeader,chartBox);
      root.append(card);
    }
    root.append(element("p","Vendas e faturamento vêm da aba Vendas. Campanhas exigem correspondência da UTM; conjuntos e anúncios exigem utm_content identificando o anúncio, usando utm_medium para distinguir conjuntos quando necessário. Vendas sem vínculo inequívoco não são distribuídas entre itens.","note attribution-footnote"));
  }
  const entitySales=(data.salesEntities || []).filter(within);
  const dailyDays=days.filter(day=>within([day]));
  let scopedMeta=meta;
  let scopedSales=entitySales.filter(row=>!get("campaign").value || row[1]===get("campaign").value);
  for (const config of entityLevels) {
    const state=entityState[config.id];
    const groups=entityGroups(scopedMeta,config.level,scopedSales);
    const keys=new Set(groups.map(group=>group.key));
    for (const key of state.selected) if (!keys.has(key)) state.selected.delete(key);
    renderEntityTable(config,groups);
    renderEntityChart(config,groups,dailyDays);
    if (state.selected.size) {
      scopedMeta=scopedMeta.filter(row=>state.selected.has(entityKey(row,config.level)));
      scopedSales=scopedSales.filter(row=>state.selected.has(entityKey(row,config.level)));
    }
  }
}
function renderEntityTable(config,groups) {
  const state=entityState[config.id], node=get(config.id+"-table");
  const head=element("thead"), header=element("tr");
  const nameCell=element("th");nameCell.scope="col";
  const selectAll=element("input");selectAll.type="checkbox";
  selectAll.setAttribute("aria-label","Selecionar todos: "+config.title);
  selectAll.checked=groups.length>0 && groups.every(group=>state.selected.has(group.key));
  selectAll.indeterminate=state.selected.size>0 && !selectAll.checked;
  selectAll.disabled=!groups.length;
  selectAll.addEventListener("change",()=>{state.selected=new Set(selectAll.checked?groups.map(group=>group.key):[]);state.total=false;render();});
  const nameHeading=element("span",config.singular);
  const firstHeader=element("div",undefined,"entity-name-heading");firstHeader.append(selectAll,nameHeading);nameCell.append(firstHeader);header.append(nameCell);
  for (const metric of entityMetrics) {
    const cell=element("th");cell.scope="col";
    cell.classList.toggle("selected-metric",state.metrics.has(metric.id));
    const button=element("button",metric.label,"metric-select");button.type="button";button.dataset.metric=metric.id;
    button.title="Mostrar "+metric.label+" no gráfico. Ctrl/⌘ + clique para comparar métricas.";
    button.setAttribute("aria-pressed",String(state.metrics.has(metric.id)));
    button.addEventListener("click",event=>{
      if (event.ctrlKey || event.metaKey) {
        if (state.metrics.has(metric.id) && state.metrics.size>1) state.metrics.delete(metric.id);
        else state.metrics.add(metric.id);
      } else state.metrics=new Set([metric.id]);
      render();
      get(config.id+"-table").querySelector('[data-metric="'+metric.id+'"]').focus({preventScroll:true});
    });
    cell.append(button);header.append(cell);
  }
  head.append(header);
  const body=element("tbody");
  groups.forEach((group,index)=>{
    const row=element("tr");
    row.dataset.key=group.key;
    row.classList.toggle("selected-entity",state.selected.has(group.key));
    const nameCell=element("td"), label=element("label",undefined,"entity-name");
    const checkbox=element("input");checkbox.type="checkbox";checkbox.checked=state.selected.has(group.key);
    checkbox.setAttribute("aria-label","Comparar "+group.path.join(" / "));
    checkbox.addEventListener("change",()=>{
      if(checkbox.checked) state.selected.add(group.key);else state.selected.delete(group.key);
      state.total=false;render();
    });
    const name=element("span",group.path.at(-1)||"Sem nome");name.title=group.path.join(" / ");
    if (groups.filter(item=>item.path.at(-1)===group.path.at(-1)).length>1) {
      name.append(element("small",group.path.slice(0,-1).join(" / "),"entity-parent"));
    }
    const dot=element("i",undefined,"series-dot");dot.style.background=seriesColors[index%seriesColors.length];
    label.append(checkbox,dot,name);nameCell.append(label);row.append(nameCell);
    const [metrics,sales]=entityMeasures(group);
    for (const metric of entityMetrics) {
      const cell=element("td");
      const value=element("button",metricText(metric.value(metrics,sales),metric.unit),"metric-value");
      value.type="button";
      value.title="Ver "+metric.label+" de "+group.path.join(" / ")+" no gráfico";
      value.setAttribute("aria-label",value.title+": "+value.textContent);
      value.addEventListener("click",event=>{
        if(event.ctrlKey || event.metaKey) { state.metrics.add(metric.id);state.selected.add(group.key); }
        else { state.metrics=new Set([metric.id]);state.selected=new Set([group.key]); }
        state.total=false;render();
      });
      cell.append(value);
      cell.classList.toggle("selected-metric",state.metrics.has(metric.id));
      row.append(cell);
    }
    body.append(row);
  });
  if (!groups.length) {
    const row=element("tr"),cell=element("td","Nenhum item no período e nos filtros selecionados.");
    cell.colSpan=entityMetrics.length+1;row.append(cell);body.append(row);
  }
  const foot=element("tfoot"), totalRow=element("tr"), label=element("td");
  const total=element("button","Total Geral","total-select");total.type="button";total.setAttribute("aria-pressed",String(state.total));
  total.addEventListener("click",()=>{state.selected.clear();state.total=!state.total;render();});
  label.append(total);totalRow.append(label);
  const metrics=totals(groups.flatMap(group=>group.rows),4,5),sales=totals(groups.flatMap(group=>group.sales),4,2);
  for (const metric of entityMetrics) totalRow.append(element("td",metricText(metric.value(metrics,sales),metric.unit)));
  foot.append(totalRow);node.replaceChildren(head,body,foot);
}
function renderEntityChart(config,groups,dailyDays) {
  const state=entityState[config.id];
  const selectedMetrics=entityMetrics.filter(metric=>state.metrics.has(metric.id));
  let selected=state.selected.size?groups.filter(group=>state.selected.has(group.key)):groups.slice(0,6);
  if (state.total) selected=[{key:"total",path:["Total Geral"],rows:groups.flatMap(group=>group.rows),sales:groups.flatMap(group=>group.sales)}];
  get(config.id+"-chart-title").textContent=selectedMetrics.map(metric=>metric.label).join(" + ")+" por "+config.singular.toLowerCase()+", por dia";
  let status=state.total?"Total dos itens da tabela":state.selected.size?state.selected.size+" itens selecionados":
    groups.length>6?"6 itens com maior gasto · selecione linhas para comparar outros":"Todos os "+groups.length+" itens da tabela";
  const datasets=[];
  for (const group of selected) {
    const byDay=grouped(group.rows,0),bySale=grouped(group.sales,0);
    selectedMetrics.forEach((metric,metricIndex)=>{
      const values=dailyDays.map(day=>{
        if (!byDay.has(day) && !bySale.has(day)) return null;
        return metric.value(totals(byDay.get(day)||[],4,5),totals(bySale.get(day)||[],4,2));
      });
      const position=group.key==="total"?0:groups.findIndex(item=>item.key===group.key);
      const duplicate=selected.filter(item=>item.path.at(-1)===group.path.at(-1)).length>1;
      const label=group.path.at(-1)+(duplicate?" ("+group.path.at(-2)+")":"")+(selectedMetrics.length>1?" · "+metric.label:"");
      datasets.push({...line(label,values,seriesColors[position%seriesColors.length],metric.unit),
        borderDash:metricIndex?[5+metricIndex*2,3]:[],spanGaps:false,entityKey:group.key,metricId:metric.id,
        contextLabel:group.path.join(" / ")+" · "+metric.label});
    });
  }
  if (datasets.length && datasets.every(series=>series.data.every(value=>value===null))) status+=" · Métrica indisponível: sem denominador para calcular no período.";
  if (!groups.length) status="Nenhum item no período e nos filtros selecionados.";
  get(config.id+"-chart-status").textContent=status;
  const canvas=get(config.id+"-chart");
  canvas.setAttribute("aria-label",get(config.id+"-chart-title").textContent);
  if (typeof Chart!=="function") {
    get(config.id+"-chart-status").textContent+=" Os valores permanecem disponíveis na tabela.";
    return;
  }
  const scales={};
  [...new Set(selectedMetrics.map(metric=>metric.unit))].forEach((unit,index)=>{
    scales[unit]={position:index%2?"right":"left",ticks:{color:color("muted"),font:{size:10},
      callback:value=>metricText(value,unit),...(unit==="orders"?{precision:0}:{})}};
  });
  makeChart(canvas.id,dailyDays.map(day=>[day]),datasets,scales);
  const chart=charts.get(canvas.id);
  chart.options.plugins.legend.labels.generateLabels=instance=>Chart.defaults.plugins.legend.labels.generateLabels(instance).map(label=>({
    ...label,text:label.text.length>43?label.text.slice(0,40)+"…":label.text
  }));
  chart.options.plugins.tooltip.callbacks.title=contexts=>contexts[0]?.label||"";
  chart.options.plugins.tooltip.callbacks.label=context=>context.dataset.contextLabel+": "+metricText(context.parsed.y,context.dataset.yAxisID);
  chart.update("none");
}

function render() {
  const hash = location.hash.slice(1);
  const mode = Object.hasOwn(pages, hash) ? hash : "geral";
  const isMeta = mode === "meta";
  const isReport = mode === "relatorio";
  const campaign = isMeta ? get("campaign").value : "";
  const from = get("start");
  const to = get("end");
  to.setCustomValidity(from.value <= to.value ? "" : "Escolha uma data igual ou posterior à inicial.");
  if (!get("filters").checkValidity()) return;
  const within = row => row[0] >= from.value && row[0] <= to.value;
  const meta = data.meta.filter(row => within(row) && (!campaign || row[1] === campaign));
  const allSales = data.sales.filter(within);
  const sales = isMeta ? allSales.filter(row => row[1] === "Meta Ads" && (!campaign || row[2] === campaign)) : allSales;
  const summary = totals(meta, 4, 5);
  const salesSum = totals(sales, 3, 2);
  const metaSales = allSales.filter(row => row[1] === "Meta Ads");
  const linkedSales = metaSales.filter(row => row[2] && (!campaign || row[2] === campaign));
  const describeSales = rows => {
    const [orders, revenue] = totals(rows, 3, 2);
    return numbers.format(orders) + " vendas · " + money(revenue);
  };
  get("sales-total").textContent = describeSales(allSales);
  get("sales-meta").textContent = describeSales(metaSales);
  get("sales-linked").textContent = describeSales(linkedSales);
  get("sales-linked-label").textContent = campaign ? "Vendas vinculadas à campanha selecionada" : "Vendas com campanha vinculada";
  get("sales-attribution-note").textContent = "Fonte: aba Vendas da planilha de compradores. Pagamentos confirmados, sem duplicar transações. " +
    (metaSales.length ? "O vínculo por campanha exige correspondência da UTM com o nome no Meta Ads." :
      "Nenhuma venda deste período tem atribuição ao Meta Ads pelos parâmetros registrados. Consulte as UTMs em Vendas por origem.");
  const byMetaDay = grouped(meta, 0);
  const bySalesDay = grouped(sales, 0);
  const daily = days.filter(day => within([day])).map(day => [day, totals(byMetaDay.get(day) || [], 4, 5), totals(bySalesDay.get(day) || [], 3, 2)]);
  get("page-title").textContent = pages[mode];
  get("campaign-filter").hidden = !isMeta;
  for (const link of document.querySelectorAll("nav a")) {
    if (link.hash === "#" + mode) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  get("overview").hidden = isReport;
  get("report").hidden = !isReport;
  get("entity-analysis").hidden = !isMeta;
  get("secondary").hidden = isMeta;
  get("secondary-heading").hidden = isMeta;
  get("period-label").textContent = fullDate.format(new Date(from.value)) + " – " + fullDate.format(new Date(to.value));
  if (isReport) {
    table("daily", ["Data", "Gasto", ...stages, "Pedidos pagos", "Receita", "CTR", "Connect Rate"],
      daily.map(([day, metrics, [count, revenue]]) => [[fullDate.format(new Date(day)), money(metrics[0]), ...metrics.slice(1).map(value=>numbers.format(value)), numbers.format(count), money(revenue), percent(metrics[2],metrics[1]), percent(metrics[3],metrics[2])]]));
    return;
  }
  renderFunnel(summary, salesSum, mode);
  renderDaily(daily, summary, salesSum);
  renderChart(daily, mode);
  get("secondary-heading").textContent = isMeta ? "Visão por campanha" : "Vendas por origem";
  get("secondary-title").textContent = isMeta ? "Campanhas e criativos" : "Vendas por origem";
  get("secondary-note").textContent = isMeta ? "Expanda uma campanha para ver conjuntos e anúncios. Pedidos e receita por campanha exigem correspondência da UTM." : "As origens são classificadas pelos parâmetros de rastreamento.";
  if (isMeta) {
    renderEntityAnalysis(meta, within);
  } else {
    const origins = new Map();
    for (const row of data.salesTracking.filter(within)) {
      const key = JSON.stringify(row.slice(1, 7));
      if (!origins.has(key)) origins.set(key, [row.slice(1, 7), 0, 0]);
      origins.get(key)[1] += row[7];
      origins.get(key)[2] += row[8];
    }
    table("secondary-table", ["Origem UTM", "Meio UTM", "Campanha UTM", "Conteúdo UTM", "Classificação", "Pedidos pagos", "Receita"],
      [...origins.values()].sort((a,b)=>b[2]-a[2]).map(([[channel, linked, source, medium, campaignUTM, content], count, value]) =>
        [[source || "Não informado", medium || "—", campaignUTM || "—", content || "Não informado", channel, numbers.format(count), money(value)]]));
    get("secondary-note").textContent = "Parâmetros registrados na aba Vendas. WhatsApp e origem orgânica entram no total geral; o vínculo com campanhas do Meta Ads exige UTMs compatíveis.";
  }
}
function reset() {
  for (const state of Object.values(entityState)) { state.selected.clear(); state.total=false; }
  get("start").value = days[0];
  get("end").value = days.at(-1);
  get("campaign").value = "";
  render();
}
for (const campaign of campaigns) get("campaign").append(new Option(campaign, campaign));
get("updated").textContent = stamp.format(new Date(data.generatedAt)) + " (BRT)";
get("side-updated").textContent = "Dados de " + stamp.format(new Date(data.generatedAt));
get("filters").addEventListener("submit", event => event.preventDefault());
get("campaign").addEventListener("change", render);
get("reset").addEventListener("click", reset);
window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", reset);

async function checkUpdate(manual) {
  const button = get("refresh");
  const status = get("refresh-status");
  if (button.disabled || location.protocol === "file:") return;
  button.disabled = true;
  try {
    const response = await fetch("./version.json?v=" + Date.now(), {cache:"no-store"});
    if (!response.ok) throw new Error("Falha ao consultar publicação");
    const newest = await response.json();
    if (Date.parse(newest.generatedAt) > Date.parse(data.generatedAt)) {
      const next = new URL(location.href);
      next.searchParams.set("v", newest.generatedAt);
      location.replace(next.href);
      return;
    }
    if (manual) {
      status.hidden = false;
      status.textContent = "Você está vendo a publicação mais recente.";
    }
  } catch {
    if (manual) {
      status.hidden = false;
      status.textContent = "Não foi possível consultar a última publicação.";
    }
  } finally {
    button.disabled = false;
  }
}
get("refresh").addEventListener("click", () => checkUpdate(true));
if (location.protocol === "file:") get("refresh").hidden = true;
else {
  checkUpdate(false);
  setInterval(() => checkUpdate(false), 60000);
}


function applyPeriod() {
  const from=get("start"), to=get("end");
  to.setCustomValidity(from.value <= to.value ? "" : "Escolha uma data igual ou posterior à inicial.");
  if (!get("filters").reportValidity()) return;
  get("period-picker").open=false;
  render();
}
get("apply-period").addEventListener("click",applyPeriod);
for (const preset of document.querySelectorAll("[data-days]")) preset.addEventListener("click",()=>{
  const count=Number(preset.dataset.days), end=days.at(-1);
  if (!end) return;
  get("end").value=end;
  const start=new Date(end+"T00:00:00Z");
  start.setUTCDate(start.getUTCDate()-count+1);
  get("start").value=count ? start.toISOString().slice(0,10) : days[0];
  applyPeriod();
});
document.addEventListener("click",event=>{
  if (!get("period-picker").contains(event.target)) get("period-picker").open=false;
});
document.addEventListener("keydown",event=>{
  if(event.key==="Escape") get("period-picker").open=false;
});
get("theme").addEventListener("click",()=>{
  const light=document.documentElement.dataset.theme==="dark";
  document.documentElement.dataset.theme=light?"light":"dark";
  get("theme").setAttribute("aria-pressed",String(light));
  try {localStorage.setItem("rgt-theme",light?"light":"dark");} catch {}
  render();
});
try {
  const theme=localStorage.getItem("rgt-theme");
  if (theme==="light" || theme==="dark") document.documentElement.dataset.theme=theme;
  get("theme").setAttribute("aria-pressed",String(theme==="light"));
} catch {}
