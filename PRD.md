# PRD.md — FolioProspect v1

## Problema
TradingView Portfolios limita holdings y transacciones; Google Finance no calcula patrimonio real ni prospectiva. El usuario ("luletrade", portafolio *Personal largo plazo*, 20 posiciones, 30 trades desde 2025-08-28) necesita un one-pager patrimonial vivo, sin límites, con valor intrínseco y proyección a 10–20 años.

## Usuario objetivo
Inversor de largo plazo (Argentina) con acciones US, CEDEARs/DRs, cripto, efectivo y activos ilíquidos; piensa en USD, reporta en ARS/EUR.

## Objetivos (v1)
1. Patrimonio total en vivo (líquido + ilíquido + caja) en USD/ARS/EUR.
2. Paridad numérica con TradingView en KPIs, períodos y métricas de riesgo (motor replicado vía REA).
3. Análisis de activo con Fair Value / Moat / múltiplos.
4. Prospectiva 10/20 años con escenarios y Monte Carlo.

## No-objetivos (v1)
Autenticación multiusuario, brokers en vivo/Plaid, órdenes reales, app móvil nativa.

## Historias de usuario
- Como inversor, abro la app y veo Mercado (Estado 1) y mi patrimonio a la izquierda.
- Hago clic en "Personal largo plazo" y veo el dashboard completo tipo TradingView (Estado 2).
- Hago clic en NVDA y veo precio, gráfico, mi tenencia, FV y proyección (Estado 3).
- Agrego un plazo fijo de ARS 5M y aparece en la distribución y el patrimonio total.
- Importo un CSV con 500 transacciones; el sistema recalcula sin límite.

## Métricas de éxito
Diferencia ≤ 0.1 pp vs TV en retornos mensuales de meses completos; carga inicial < 2 s con caché; 0 errores de consola.

## Fuentes de datos
| Dato | Fuente | Fallback |
|---|---|---|
| Holdings/Trades | REA TradingView (seed) + ledger local | — |
| Cotizaciones / velas | Yahoo Finance v7/v8 (vía backend) | snapshot seed |
| Cripto | Yahoo BTC-USD/ETH-USD (equivalente USDT) | snapshot |
| Fundamentales | Yahoo quoteSummary (crumb) | N/A |
| Noticias | Yahoo search news | snapshot TV |
| Earnings/Dividendos | Yahoo calendarEvents | `calendar_snapshot.json` |
