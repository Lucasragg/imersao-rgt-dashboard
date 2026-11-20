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
const pages = {geral:"Visão geral", meta:"Meta Ads", relatorio:"Relatório"};
const days = [...new Set([...data.meta, ...data.sales].map(row => row[0]))].sort();
const campaigns = [...new Set(data.meta.map(row => row[1]))].sort();
const metaColumns = ["Campanha, conjunto ou anúncio", "Gasto", "Impressões", "Cliques", "Visitas", "Checkouts", "Pedidos atribuídos", "Receita atribuída"];
let chart;

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
function renderMetrics(meta, sales, mode) {
  const [spend, impressions, clicks, views, checkouts] = meta;
  const [orders, revenue] = sales;
  const stats = [
    ["Investimento", money(spend)], [mode === "meta" ? "Receita Meta Ads" : "Receita total", money(revenue)],
    ["Pedidos pagos", numbers.format(orders)], [mode === "meta" ? "ROAS Meta Ads" : "ROAS geral", spend ? numbers.format(Math.round(revenue / spend * 100) / 100) + "×" : "—"],
    ["CTR de link", percent(clicks, impressions)], ["CPC de link", per(spend, clicks)],
    ["Connect Rate", percent(views, clicks)], ["Custo por checkout", per(spend, checkouts)]
  ];
  get("metrics").replaceChildren(...stats.map(([name, value]) => {
    const card = element("div", undefined, "metric");
    card.append(element("span", name), element("strong", value));
    return card;
  }));
}
function renderFunnel(meta, orderCount, mode) {
  const counts = meta.slice(1).concat(orderCount);
  get("funnel-note").textContent = mode === "meta" ? "Etapas do Meta Ads e pedidos com atribuição por UTM." : "Etapas do Meta Ads e pedidos pagos de todos os canais.";
  get("funnel").replaceChildren(...stages.concat("Pedidos pagos").map((label, index) => {
    const stage = element("div", undefined, "stage");
    const top = element("div", undefined, "stage-top");
    top.append(element("span", label), element("b", numbers.format(counts[index])));
    const meter = element("div", undefined, "bar");
    const fill = element("i");
    fill.style.width = Math.min(100, 100 * counts[index] / Math.max(1, ...counts)) + "%";
    meter.append(fill);
    stage.append(top, meter);
    return stage;
  }));
}
function renderChart(daily, mode) {
  get("chart-note").textContent = mode === "meta" ? "Investimento, receita e pedidos atribuídos ao Meta Ads." : "Investimento no Meta Ads e vendas de todas as origens.";
  if (typeof Chart !== "function") {
    get("chart-fallback").hidden = false;
    return;
  }
  chart?.destroy();
  chart = new Chart(get("trend"), {
    data:{
      labels:daily.map(row => dayFormat.format(new Date(row[0]))),
      datasets:[
        {type:"line", label:"Investimento", data:daily.map(row => row[1][0] / 100), borderColor:"#a84d0e", backgroundColor:"#a84d0e", tension:.2},
        {type:"line", label:"Receita", data:daily.map(row => row[2][1] / 100), borderColor:"#087465", backgroundColor:"#087465", tension:.2},
        {type:"bar", label:"Pedidos", data:daily.map(row => row[2][0]), backgroundColor:"#b8d7d3", yAxisID:"orders"}
      ]
    },
    options:{maintainAspectRatio:false, interaction:{intersect:false, mode:"index"}, scales:{y:{beginAtZero:true,ticks:{callback:value=>currency.format(value)}},orders:{position:"right",beginAtZero:true,grid:{drawOnChartArea:false},ticks:{precision:0}}}}
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
  renderMetrics(summary, salesSum, mode);
  if (isReport) {
    table("daily", ["Data", "Gasto", ...stages, "Pedidos pagos", "Receita", "CTR", "Connect Rate"],
      daily.map(([day, metrics, [count, revenue]]) => [[fullDate.format(new Date(day)), money(metrics[0]), ...metrics.slice(1).map(value=>numbers.format(value)), numbers.format(count), money(revenue), percent(metrics[2],metrics[1]), percent(metrics[3],metrics[2])]]));
    return;
  }
  renderFunnel(summary, salesSum[0], mode);
  renderChart(daily, mode);
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
get("updated").textContent = "Dados de " + stamp.format(new Date(data.generatedAt));
get("filters").addEventListener("submit", event => event.preventDefault());
get("filters").addEventListener("change", render);
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
