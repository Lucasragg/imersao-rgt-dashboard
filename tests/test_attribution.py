import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import build


class AttributionTests(unittest.TestCase):
    def setUp(self):
        self.campaign = "IMERSAO | P2-FRIO | VENDAS | ABO | Teste"
        self.meta = [["2026-11-21", self.campaign, group, "AD06 - sem_programar", 1000, 100, 5, 2, 1]
                     for group in ("AUTO | Lookalike 1-2%", "AUTO | Lookalike 1%")]

    def values(self, **kwargs):
        values = {key: "" for key in build.SALES_COLUMNS}
        values.update({"Data da venda": "21/11/2026 11:17:05", "ID da transação": "test-1",
                       "Status": "PAID", "Valor": "R$ 241,50", "utm_source": "Meta-Ads",
                       "utm_medium": "AUTO | Lookalike 1-2%", "utm_campaign": self.campaign,
                       "utm_content": "AD06 - sem_programar", "src": "organic"})
        values.update(kwargs)
        return values

    def calculate(self, values):
        row = [values[key] for key in build.SALES_COLUMNS]
        with patch.object(build, "read_sheet", return_value=[(row, list(build.SALES_COLUMNS))]):
            sales, tracking = build.sales_data(self.meta)
        return sales, build.sales_entities(self.meta, tracking)

    def test_explicit_meta_and_set_override_generic_src(self):
        sales, entities = self.calculate(self.values())
        self.assertEqual(sales, [["2026-11-21", "Meta Ads", self.campaign, 1, 24150]])
        self.assertEqual(entities, [["2026-11-21", self.campaign, "AUTO | Lookalike 1-2%",
                                     "AD06 - sem_programar", 1, 24150]])

    def test_ambiguous_ad_stays_at_campaign_level(self):
        sales, entities = self.calculate(self.values(utm_medium="paid"))
        self.assertEqual(entities, [["2026-11-21", self.campaign, "", "", 1, 24150]])

    def test_whatsapp_stays_organic(self):
        sales, entities = self.calculate(self.values(utm_source="whatsapp", utm_medium="grupos",
                                                       utm_campaign="lote1", utm_content=""))
        self.assertEqual(sales, [["2026-11-21", "Outros canais", "", 1, 24150]])
        self.assertEqual(entities, [])

    def test_explicit_organic_medium_remains_organic(self):
        sales, entities = self.calculate(self.values(utm_medium="organic"))
        self.assertEqual(sales[0][1], "Outros canais")
        self.assertEqual(entities, [])


if __name__ == "__main__":
    unittest.main()
