# Imersão RGT · Controle de tráfego pago

Dashboard estático em português com visão geral, Meta Ads e relatório diário. O build lê as exportações CSV do Google Sheets e publica somente agrupamentos de tráfego e de vendas.

## Build

Informe as quatro variáveis de ambiente `META_SHEET_ID`, `META_GID`, `SALES_SHEET_ID` e `SALES_GID`. Os GIDs são `0` para `Página1` e `225855859` para `Vendas`. Execute `python3 scripts/build.py`. O navegador pode abrir o arquivo `dist/index.html` para conferir o resultado. Os gráficos usam Chart.js via CDN.

O build conta transações com pagamento confirmado, deduplica pelo ID e lê o esquema atual de Vendas, em que status e valor aparecem em C e H. A receita geral inclui todas as origens. A visão Meta Ads usa os parâmetros de rastreamento e só atribui receita a uma campanha se a UTM corresponder ao nome da campanha. O painel mostra a conciliação entre vendas da planilha, vendas Meta Ads e vendas com campanha vinculada; a tabela de origens expõe UTMs agrupadas para permitir conferir o cruzamento. Origem orgânica/WhatsApp não é atribuída ao Meta Ads. O indicador de ROAS geral divide a receita de todas as origens pelo investimento no Meta Ads. Campos pessoais e identificadores de transação ficam fora da saída do build.

A aba `Vendas` tem GID `225855859`. O GID `1710545547` abre `Webhook_Bruto` e não deve substituir a origem de vendas.

Na aba Meta Ads, campanhas, conjuntos e anúncios têm tabelas e gráficos diários próprios. Clique no cabeçalho de uma métrica para exibi-la; Ctrl/⌘ + clique permite comparar métricas. Clique em um valor para mostrar aquele item e métrica, ou selecione várias linhas para comparar itens. Seleções de campanhas filtram conjuntos e anúncios; seleções de conjuntos filtram anúncios. Sem seleção, os gráficos mostram até seis itens de maior gasto. Clique em Total Geral para mostrar a série agregada. Os totais recalculam taxas a partir das somas, sem somar ou tirar média simples de percentuais. Anúncios homônimos em conjuntos diferentes permanecem separados; só recebem vendas quando `utm_content` identifica um único anúncio dentro da campanha vinculada.

## GitHub Pages

A partir da raiz, execute `scripts/configure-github.sh Lucasragg imersao-rgt-dashboard` com uma credencial autorizada no ambiente `GH_TOKEN` e as quatro variáveis de origem definidas. O script configura Actions, permissões do workflow, Pages e variáveis via API, envia os arquivos para `main`, aguarda o build disparado pelo push e verifica a URL. `workflow_dispatch` fica disponível para os próximos builds disparados pelo cron-job.org.

Cadastre a chamada `POST /repos/Lucasragg/imersao-rgt-dashboard/actions/workflows/pages.yml/dispatches` para os minutos 0 e 30 de cada hora. O corpo é `{"ref":"main"}`. Use um token com Actions em leitura e escrita para este repositório. A resposta HTTP 204 confirma o disparo e a conclusão é registrada no GitHub Actions. O painel consulta a versão publicada com uma URL exclusiva e recarrega quando há dados novos.
