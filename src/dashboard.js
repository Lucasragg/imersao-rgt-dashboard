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
const metaColumns = ["Campanha, conjunto ou anúncio", "Gasto", "Impressões", "Cliques", "Visitas", "Checkouts", "Pedidos atribuídos", "Receita atribuída"];


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

function breakdown(group, attribution) {
  const entries = [];
  for (const [campaign, rows] of grouped(group, 1)) {
    const metrics = totals(rows, 4, 5);
    const sales = totals(attribution.filter(row=>row[2] === campaign), 3, 2);
    const details = element("details");
    details.append(element("summary", campaign));
    for (const [set, ads] of grouped(rows, 2)) {
      const adDetails = element("details", undefined, "breakdown");
      adDetails.append(element("summary", set || "Conjunto sem nome"));
      for (const [ad, adRows] of grouped(ads, 3)) {
        const [spend, impressions, clicks, views, checkouts] = totals(adRows, 4, 5);
        const info = [money(spend), numbers.format(impressions) + " impressões", numbers.format(clicks) + " cliques", numbers.format(views) + " visitas", numbers.format(checkouts) + " checkouts"];
        adDetails.append(element("p", (ad || "Anúncio sem nome") + " · " + info.join(" · "), "note"));
      }
      details.append(adDetails);
    }
    entries.push([["", money(metrics[0]), ...metrics.slice(1).map(value=>numbers.format(value)), numbers.format(sales[0]), money(sales[1])], [details]]);
  }
  return entries;
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
    table("secondary-table", metaColumns, breakdown(meta, sales));
  } else {
    table("secondary-table", ["Origem", "Pedidos pagos", "Receita"],
      ["Meta Ads", "Outros canais", "Sem atribuição"].map(channel => {
        const [count, value] = totals(sales.filter(row => row[1] === channel), 3, 2);
        return [[channel, numbers.format(count), money(value)]];
      }));
  }
}
function reset() {
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
