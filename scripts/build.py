import csv
import datetime as dt
import io
import json
import os
import re
import shutil
import unicodedata
import urllib.request
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
META_COLUMNS = ("Day", "Campaign Name", "Ad Set Name", "Ad Name", "Amount Spent",
                "Impressions", "Link Clicks", "Landing Page Views", "Checkouts Initiated")
SALES_COLUMNS = ("Data da venda", "ID da transação", "Nome", "Email", "Telefone", "Produto",
                 "Valor", "Status", "Pagamento", "utm_source", "utm_medium", "utm_campaign",
                 "utm_content", "utm_term", "src", "sck", "URL de origem")


def normalize(value):
    return "".join(char for char in unicodedata.normalize("NFKD", value.lower())
                   if char.isascii() and char.isalnum())


def read_sheet(env, columns):
    sheet_id = os.environ[env + "_SHEET_ID"]
    tab = os.environ[env + "_GID"]
    if not re.fullmatch(r"[\w-]+", sheet_id, re.ASCII) or not tab.isdecimal():
        raise ValueError(f"Identificadores inválidos para {env}")
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={tab}"
    request = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(request, timeout=35) as response:
        rows = csv.reader(io.TextIOWrapper(response, encoding="utf-8-sig"))
        header = next(rows, [])
        if not set(columns).issubset(header) or len(set(header)) != len(header):
            raise ValueError(f"Cabeçalho inesperado em {env}")
        for row in rows:
            if any(value.strip() for value in row):
                yield [value.strip() for value in row] + [""] * max(0, len(header) - len(row)), header


def date(value):
    if re.match(r"\d{2}/\d{2}/\d{4}", value):
        return dt.datetime.strptime(value[:10], "%d/%m/%Y").date().isoformat()
    return dt.date.fromisoformat(value[:10]).isoformat()


def number(value):
    value = value.replace("R$", "").replace(" ", "").replace("\xa0", "")
    if "," in value:
        value = value.replace(".", "").replace(",", ".")
    return Decimal(value or "0")


def meta_data():
    totals = defaultdict(lambda: [0] * 5)
    for row, header in read_sheet("META", META_COLUMNS):
        values = dict(zip(header, row))
        if normalize(values["Campaign Name"].split("|")[0]) != "imersao":
            continue
        key = (date(values["Day"]), values["Campaign Name"], values["Ad Set Name"], values["Ad Name"])
        measures = [int(number(values["Amount Spent"]) * 100)]
        measures.extend(int(number(values[column])) for column in META_COLUMNS[5:])
        for index, measure in enumerate(measures):
            totals[key][index] += measure
    if not totals:
        raise ValueError("Meta Ads não retornou linhas do funil IMERSAO")
    return [list(key) + measures for key, measures in sorted(totals.items())]


def sale_fields(row, header):
    values = dict(zip(header, row))
    # Exportação atual: status em C, produto em G, valor em H e pagamento em I.
    # O bloco de UTMs continua nas posições do cabeçalho.
    if header[:len(SALES_COLUMNS)] == list(SALES_COLUMNS) and values["Status"].startswith("R$"):
        state = row[2]
        amount = row[7]
        product = row[6]
    else:
        state = values["Status"]
        amount = values["Valor"]
        product = values["Produto"]
    return values, state, amount, product


def classify(values, campaign_index):
    source, medium, campaign = (normalize(values[key]) for key in ("utm_source", "utm_medium", "utm_campaign"))
    origin = normalize(values["src"])
    match = campaign_index.get(campaign, "")
    organic = {"organic", "organico", "whatsapp", "grupos", "email", "direct", "direto"}
    if origin in organic or medium in organic or source in organic:
        return "Outros canais", ""
    if match or source in {"meta", "metaads", "facebookads", "instagramads", "fbads", "igads"}:
        return "Meta Ads", match
    paid = {"paid", "paidmedia", "paidsocial", "cpc", "cpm", "ads", "trafegopago"}
    if source in {"fb", "ig", "facebook", "instagram"} and (medium in paid or origin in paid):
        return "Meta Ads", match
    if source:
        if source in {"fb", "ig", "facebook", "instagram"}:
            return "Sem atribuição", ""
        return "Outros canais", ""
    return "Sem atribuição", ""


def sales_data(meta):
    campaign_index = {normalize(row[1]): row[1] for row in meta}
    totals = defaultdict(lambda: [0, 0])
    transactions = {}
    for row, header in read_sheet("SALES", SALES_COLUMNS):
        values, state, amount, _ = sale_fields(row, header)
        if not values["ID da transação"] or not values["Data da venda"]:
            continue
        timestamp = (date(values["Data da venda"]), values["Data da venda"][10:].strip())
        transactions[values["ID da transação"]] = (timestamp, values, state, amount)
    for timestamp, values, state, amount in transactions.values():
        if normalize(state) not in {"paid", "approved", "aprovado", "pago", "complete",
                                    "completed", "purchaseapproved", "purchasecomplete"}:
            continue
        channel, campaign = classify(values, campaign_index)
        bucket = totals[(timestamp[0], channel, campaign)]
        bucket[0] += 1
        bucket[1] += int(number(amount) * 100)
    return [list(key) + measures for key, measures in sorted(totals.items())]


def main():
    meta = meta_data()
    sales = sales_data(meta)
    data = {"generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "meta": meta, "sales": sales}
    document = (ROOT / "src/index.html").read_text()
    document = document.replace("/* DASHBOARD_CSS */", (ROOT / "src/style.css").read_text())
    document = document.replace("/* DASHBOARD_JS */", (ROOT / "src/dashboard.js").read_text())
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    document = document.replace("<!-- DASHBOARD_DATA -->", payload)
    dist = ROOT / "dist"
    shutil.rmtree(dist, ignore_errors=True)
    dist.mkdir()
    (dist / "index.html").write_text(document)
    (dist / "version.json").write_text(json.dumps({"generatedAt": data["generatedAt"]}))
    (dist / ".nojekyll").touch()
    print(f"Build concluído. {len(meta)} agrupamentos Meta e {len(sales)} agrupamentos de vendas.")


if __name__ == "__main__":
    main()
