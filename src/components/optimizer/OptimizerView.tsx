import React, { useMemo, useState } from 'react';
import { Sparkles, RefreshCw, Lock, Shield, Star, Plus, X, Lightbulb } from 'lucide-react';
import { useAppStore } from '@/store';
import { optimizePortfolio, fmtPairPct, fmtPairYears, type AssetScore, type Extraction } from '@shared/engine';
import { InfoTip } from './InfoTip';
import { METHODOLOGY } from './methodology';
import { EvolutionChart, BubbleChart, bandColor, BAND_COLORS, fmtPct, fmtUsd, fmtY } from './OptimizerCharts';

const Stars: React.FC<{ n: number | null }> = ({ n }) =>
  n == null ? null : (
    <span className="opt-stars" aria-label={`${n} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={11} fill={i <= n ? '#FBBF24' : 'none'} color={i <= n ? '#FBBF24' : '#334155'} />
      ))}
    </span>
  );

const DupChip: React.FC<{ a: AssetScore }> = ({ a }) => (
  <span className="opt-dup" style={{ borderColor: bandColor(a.yearsToDouble) + '88' }}>
    {a.yearsToDouble != null ? (
      <>
        Duplica en {fmtY(a.yearsToDouble)} años
        <small>RETORNO ESP. {a.expectedReturnPct != null ? fmtPct(a.expectedReturnPct) : '—'} / AÑO</small>
      </>
    ) : (
      'No duplica'
    )}
  </span>
);

export const OptimizerView: React.FC = () => {
  const { optimizerData, optimizerLoading, loadOptimizer, evaluation } = useAppStore();
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [mobileStep, setMobileStep] = useState<1 | 2 | 3>(1);
  // «Obtener más fondos»: entradas libres del usuario (efectivo o venta de un
  // activo vigente por el monto que elija) y sugerencias automáticas aceptadas.
  type ManualFund = { id: string; type: 'cash' | 'sell'; symbol?: string; amountUsd: number };
  const [manualFunds, setManualFunds] = useState<ManualFund[]>([]);
  const [acceptedSug, setAcceptedSug] = useState<string[]>([]);
  const [skippedSug, setSkippedSug] = useState<string[]>([]);
  const [mfOpen, setMfOpen] = useState(false);
  const [mfType, setMfType] = useState<'cash' | 'sell'>('sell');
  const [mfSymbol, setMfSymbol] = useState('');
  const [mfAmount, setMfAmount] = useState('');
  const [mfError, setMfError] = useState<string | null>(null);

  const manualExtractions = useMemo(() => {
    const bySymbol = new Map<string, number>();
    for (const m of manualFunds) {
      if (m.type === 'sell' && m.symbol) bySymbol.set(m.symbol, (bySymbol.get(m.symbol) ?? 0) + m.amountUsd);
    }
    return [...bySymbol.entries()].map(([symbol, amountUsd]) => ({ symbol, amountUsd }));
  }, [manualFunds]);
  const extraCashUsd = useMemo(
    () => manualFunds.filter((m) => m.type === 'cash').reduce((s, m) => s + m.amountUsd, 0),
    [manualFunds]
  );

  const result = useMemo(() => {
    if (!optimizerData) return null;
    if (disabled.size === 0 && manualFunds.length === 0 && acceptedSug.length === 0) return optimizerData.result;
    return optimizePortfolio(optimizerData.inputs, {
      sellCommissionPct: 0.5,
      peersByIndustry: optimizerData.peersByIndustry,
      excludeTickers: [...disabled],
      manualExtractions,
      extraCashUsd,
      acceptedSuggestions: acceptedSug,
    });
  }, [optimizerData, disabled, manualFunds, manualExtractions, extraCashUsd, acceptedSug]);

  if (!optimizerData) {
    return (
      <div className="opt-wrap">
        <div className="opt-empty">
          <Sparkles size={26} color="#10B981" />
          <h2>Optimizador de cartera</h2>
          <p>
            {optimizerLoading
              ? 'Calculando scores, rotaciones y riesgo con datos en vivo (la primera vez puede tardar)…'
              : 'Analiza tu cartera, propone salidas y entradas y valida el riesgo/beneficio de la estrategia.'}
          </p>
          {!optimizerLoading && (
            <button type="button" className="opt-btn" onClick={() => void loadOptimizer()}>
              Analizar mi cartera
            </button>
          )}
        </div>
      </div>
    );
  }
  if (!result) return null;
  const { before, after } = result;
  const [reB, reA] = fmtPairPct(before.expectedReturnGeoPct, after.expectedReturnGeoPct);
  const [yB, yA] = fmtPairYears(before.yearsToDouble, after.yearsToDouble);
  const [vB, vA] = fmtPairPct(before.volatilityPct, after.volatilityPct);
  const generated = new Date(optimizerData.generatedAt);
  const toggleDisabled = (ticker: string) =>
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });

  const allocBySymbol = new Map(result.allocations.map((a) => [a.symbol, a]));
  const origBySymbol = new Map(result.assets.map((a) => [a.symbol, a]));
  const finalNote = (a: AssetScore): { text: string; cls: string } => {
    const al = allocBySymbol.get(a.symbol);
    if (al && al.isNew) return { text: `NUEVO · entra con ${fmtUsd(al.amountUsd)}`, cls: 'sky' };
    if (al) return { text: `+${fmtUsd(al.amountUsd)} · posición reforzada`, cls: 'green' };
    const orig = origBySymbol.get(a.symbol);
    if (orig && a.qty < orig.qty - 0.001) return { text: 'Posición reducida', cls: 'amber' };
    return { text: 'Sin cambios', cls: 'gray' };
  };
  const lockedNames = result.assets.filter((a) => a.locked).map((a) => a.ticker);
  const defensiveNames = result.assets.filter((a) => a.defensive).map((a) => a.ticker);
  const colAssets = result.assets.filter((a) => !a.isCash);
  // Activos que el usuario puede vender a mano (los de candado no se tocan).
  const pickerAssets = colAssets.filter((a) => !a.locked && a.value > 0);
  const selSymbol =
    mfSymbol && pickerAssets.some((a) => a.symbol === mfSymbol) ? mfSymbol : pickerAssets[0]?.symbol ?? '';
  const nextSug = result.suggestionCandidates.find(
    (c) => !acceptedSug.includes(c.ticker) && !skippedSug.includes(c.ticker)
  );
  const removeExtraction = (e: Extraction) => {
    if (e.reasonCode === 'sugerencia') {
      setAcceptedSug((prev) => prev.filter((t) => t !== e.ticker));
    } else if (e.kind === 'efectivo') {
      setManualFunds((prev) => prev.filter((m) => m.type !== 'cash'));
    } else {
      setManualFunds((prev) => prev.filter((m) => !(m.type === 'sell' && m.symbol === e.symbol)));
    }
  };
  const addManual = () => {
    const raw = mfAmount.trim().replace(/\s/g, '');
    const amt = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
    if (!amt || !(amt > 0)) {
      setMfError('Ingresá un monto válido en US$.');
      return;
    }
    if (mfType === 'cash') {
      setManualFunds((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, type: 'cash', amountUsd: amt }]);
    } else {
      const a = pickerAssets.find((x) => x.symbol === selSymbol);
      if (!a) return;
      const already = manualFunds
        .filter((m) => m.type === 'sell' && m.symbol === a.symbol)
        .reduce((s, m) => s + m.amountUsd, 0);
      if (amt + already > a.value + 0.01) {
        setMfError(`Supera el saldo disponible de ${a.ticker} (${fmtUsd(a.value - already)}).`);
        return;
      }
      setManualFunds((prev) => [
        ...prev,
        { id: `${Date.now()}-${Math.random()}`, type: 'sell', symbol: a.symbol, amountUsd: amt },
      ]);
    }
    setMfError(null);
    setMfAmount('');
  };
  const finalAssets = result.finalAssets.filter((a) => !a.isCash);
  const cashRow = result.finalAssets.find((a) => a.isCash);

  return (
    <div className="opt-wrap">
      <div className="opt-head">
        <div>
          <h1>
            Optimizador <span>de cartera</span>
          </h1>
          <div className="opt-sub">
            Datos al {generated.toLocaleDateString('es-AR')} · Sin cálculos a la vista: solo resultados, con la
            metodología a un clic en cada ⓘ
          </div>
        </div>
        <button type="button" className="opt-btn ghost" onClick={() => void loadOptimizer(true)} disabled={optimizerLoading}>
          <RefreshCw size={13} /> {optimizerLoading ? 'Calculando…' : 'Recalcular'}
        </button>
      </div>

      {/* Evaluación automática (pedido del usuario) */}
      <section className="opt-narrative">
        <div className="opt-narrative-head">
          <Sparkles size={16} color="#10B981" />
          <h2>Evaluación de tu cartera</h2>
          <InfoTip k="evaluacion" />
          {evaluation?.portfolio?.title && <span className="opt-narrative-tag">Análisis automático · como lo haría tu asesor</span>}
        </div>
        {result.narrative.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>

      <div className="opt-kpis">
        <div className="opt-kpi">
          <div className="opt-kpi-l">RETORNO ESPERADO / AÑO <InfoTip k="retorno" /></div>
          <div className="opt-kpi-v">{reB} → <em>{reA}</em></div>
          <div className="opt-kpi-d">Geométrico (neto del arrastre de volatilidad)</div>
        </div>
        <div className="opt-kpi">
          <div className="opt-kpi-l">TIEMPO HASTA DUPLICAR <InfoTip k="duplicar" /></div>
          <div className="opt-kpi-v">{yB} años → <em>{yA} años</em></div>
          <div className="opt-kpi-d">Con la cartera optimizada</div>
        </div>
        <div className="opt-kpi">
          <div className="opt-kpi-l">RIESGO (VOLATILIDAD) <InfoTip k="riesgo" /></div>
          <div className="opt-kpi-v">{vB} → <em>{vA}</em></div>
          <div className="opt-kpi-d">{after.volatilityPct < before.volatilityPct - 0.05 ? 'Menor que el actual' : after.volatilityPct <= before.volatilityPct + 1 ? 'Similar al actual' : 'Mayor que el actual'}</div>
        </div>
        <div className="opt-kpi">
          <div className="opt-kpi-l">ACTIVOS</div>
          <div className="opt-kpi-v">{before.positions} → <em>{after.positions}</em></div>
          <div className="opt-kpi-d">Posiciones finales propuestas</div>
        </div>
      </div>

      <div className="opt-steps" role="tablist" aria-label="Pasos del optimizador">
        {([1, 2, 3] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={mobileStep === s}
            className={'opt-step' + (mobileStep === s ? ' on' : '')} onClick={() => setMobileStep(s)}>
            {s} · {s === 1 ? 'Hoy' : s === 2 ? 'Fondos' : 'Final'}
            <small>{s === 1 ? 'tu cartera' : s === 2 ? fmtUsd(result.fundsToReallocate) : `${after.positions} activos`}</small>
          </button>
        ))}
      </div>

      <div className="opt-cols">
        {/* Columna 1 */}
        <section className={'opt-col opt-step-panel' + (mobileStep === 1 ? ' show' : '')}>
          <div className="opt-col-head">
            <span className="opt-n">1</span>
            <h3>Tu cartera hoy</h3>
            <p>Ordenada por oportunidad · Score de inversión <InfoTip k="score" /></p>
          </div>
          <div className="opt-cards">
            {colAssets.map((a) => (
              <article key={a.symbol} className="opt-card" style={{ borderLeftColor: bandColor(a.yearsToDouble) }}>
                <div className="opt-r1">
                  <span className="opt-tk">{a.ticker}</span>
                  <span className="opt-wt">{fmtPct(a.weightPct)} de la cartera</span>
                </div>
                <div className="opt-nm">{a.name}{a.industry ? ` · ${a.industry}` : ''}</div>
                <div className="opt-r2">
                  {a.score != null ? (
                    <div className="opt-score">
                      Score de inversión
                      <b>{a.score}<span>/100</span></b>
                      <Stars n={a.stars} />
                    </div>
                  ) : (
                    <div className="opt-score">
                      {a.isCrypto ? 'Cripto · sin score' : 'Sin score'}
                      <b className="opt-assumed">{a.expectedReturnPct != null ? fmtPct(a.expectedReturnPct) : '—'}<span> supuesto</span></b>
                    </div>
                  )}
                  <DupChip a={a} />
                </div>
                {(a.locked || a.defensive) && (
                  <div className="opt-flags">
                    {a.locked && <span><Lock size={10} /> No se toca</span>}
                    {a.defensive && <span><Shield size={10} /> Rol defensivo</span>}
                  </div>
                )}
              </article>
            ))}
          </div>
          <div className="opt-foot">
            <div className="opt-foot-big">Duplica en <em>{yB} años</em></div>
            <div className="opt-foot-small">Retorno esperado ponderado: {reB} anual</div>
            <div className="opt-legend">
              <div className="opt-legend-t">Años para duplicar inversión <InfoTip k="duplicar" /></div>
              <div className="opt-lbar">{BAND_COLORS.map((c) => <div key={c} style={{ background: c }} />)}</div>
              <div className="opt-llabels"><span>&lt;3</span><span>3–5</span><span>5–7</span><span>7–10</span><span>10–15</span><span>&gt;15</span></div>
            </div>
          </div>
        </section>

        {/* Columna 2 */}
        <section className={'opt-col opt-step-panel' + (mobileStep === 2 ? ' show' : '')}>
          <div className="opt-col-head">
            <span className="opt-n">2</span>
            <h3>Obtención de fondos</h3>
            <p>De dónde sale el capital <InfoTip k="extracciones" /> · apagá un movimiento para recalcular sin él</p>
          </div>
          <div className="opt-cards">
            {result.extractions.length === 0 && (
              <div className="opt-none">Sin extracciones propuestas: ninguna posición cumple las reglas de salida con los datos de hoy.</div>
            )}
            {result.extractions.map((e) => (
              <article key={e.symbol} className="opt-card sell">
                <div className="opt-r1">
                  <span className="opt-tk">{e.ticker}</span>
                  <span className="opt-wt">
                    {e.kind === 'efectivo' ? 'Fondos nuevos' : e.kind === 'total' ? 'Liquidación total' : 'Liquidación parcial'}
                  </span>
                </div>
                <div className="opt-nm">
                  {e.kind === 'efectivo'
                    ? `Efectivo agregado por vos · ${fmtUsd(e.grossUsd)}`
                    : `Vender ${e.qtySold.toLocaleString('es-AR')} acc. · ${fmtUsd(e.grossUsd)}`}
                </div>
                <span
                  className={
                    'opt-chip ' +
                    (e.reasonCode === 'manual'
                      ? 'sky'
                      : e.reasonCode === 'sugerencia'
                        ? 'violet'
                        : e.reasonCode === 'concentracion'
                          ? 'amber'
                          : 'red')
                  }
                >
                  {e.reason}
                </span>
                {e.reasonCode === 'manual' || e.reasonCode === 'sugerencia' ? (
                  <div>
                    <button type="button" className="opt-quitar" onClick={() => removeExtraction(e)}>
                      <X size={11} /> Quitar
                    </button>
                  </div>
                ) : (
                  <label className="opt-toggle">
                    <input type="checkbox" checked={!disabled.has(e.ticker)} onChange={() => toggleDisabled(e.ticker)} />
                    <span>{disabled.has(e.ticker) ? 'Desactivado' : 'Activo'}</span>
                  </label>
                )}
              </article>
            ))}
            <div className="opt-note">
              {lockedNames.length > 0 && <>Con candado, no se tocan: <b>{lockedNames.join(', ')}</b>. </>}
              {defensiveNames.length > 0 && <>Defensivos (solo salida parcial extrema): <b>{defensiveNames.join(', ')}</b>.</>}
            </div>
          </div>
          <div className="opt-mf-wrap">
            {!mfOpen ? (
              <button type="button" className="opt-btn opt-mf-open" onClick={() => setMfOpen(true)}>
                <Plus size={13} /> Obtener más fondos
              </button>
            ) : (
              <div className="opt-mf">
                <div className="opt-mf-head">
                  <b>Obtener más fondos</b>
                  <button type="button" className="opt-quitar" onClick={() => setMfOpen(false)} aria-label="Cerrar">
                    <X size={11} />
                  </button>
                </div>
                <div className="opt-mf-tabs" role="tablist" aria-label="Origen de los fondos">
                  <button type="button" className={mfType === 'sell' ? 'on' : ''} onClick={() => { setMfType('sell'); setMfError(null); }}>
                    Venta de activo
                  </button>
                  <button type="button" className={mfType === 'cash' ? 'on' : ''} onClick={() => { setMfType('cash'); setMfError(null); }}>
                    Efectivo
                  </button>
                </div>
                {mfType === 'sell' && (
                  <>
                    <select value={selSymbol} onChange={(ev) => setMfSymbol(ev.target.value)} aria-label="Activo a vender">
                      {pickerAssets.map((a) => (
                        <option key={a.symbol} value={a.symbol}>
                          {a.ticker} · saldo {fmtUsd(a.value)}
                        </option>
                      ))}
                    </select>
                    <div className="opt-mf-hint">Se vende el monto que escribas, hasta el saldo de la posición.</div>
                  </>
                )}
                {mfType === 'cash' && (
                  <div className="opt-mf-hint">Efectivo nuevo que sumás a los fondos a reasignar (no es una venta).</div>
                )}
                <div className="opt-mf-row">
                  <input
                    inputMode="decimal"
                    placeholder="Monto en US$"
                    value={mfAmount}
                    onChange={(ev) => setMfAmount(ev.target.value)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') addManual(); }}
                    aria-label="Monto en US$"
                  />
                  <button type="button" className="opt-btn" onClick={addManual}>
                    Agregar
                  </button>
                </div>
                {mfError && <div className="opt-mf-err">{mfError}</div>}
                <div className="opt-mf-sug">
                  <div className="opt-mf-sug-t">
                    <Lightbulb size={12} /> Sugerencia automática
                  </div>
                  {nextSug ? (
                    <>
                      <p>
                        <b>{nextSug.ticker}</b> · vender {nextSug.qtySold.toLocaleString('es-AR')} acc. ·{' '}
                        {fmtUsd(nextSug.grossUsd)}
                        <br />
                        <small>{nextSug.reason}</small>
                      </p>
                      <div className="opt-mf-row">
                        <button type="button" className="opt-btn" onClick={() => setAcceptedSug((prev) => [...prev, nextSug.ticker])}>
                          Usar esta sugerencia
                        </button>
                        <button type="button" className="opt-btn ghost" onClick={() => setSkippedSug((prev) => [...prev, nextSug.ticker])}>
                          Ver otra
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="opt-mf-hint">No quedan más sugerencias automáticas con los datos de hoy.</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="opt-foot">
            <div className="opt-foot-big">Fondos a reasignar: <em>{fmtUsd(result.fundsToReallocate)}</em></div>
            <div className="opt-foot-small">Neto de la comisión de venta configurada (0,5%)</div>
          </div>
        </section>

        {/* Columna 3 */}
        <section className={'opt-col opt-step-panel' + (mobileStep === 3 ? ' show' : '')}>
          <div className="opt-col-head">
            <span className="opt-n">3</span>
            <h3>Cartera optimizada</h3>
            <p>Listado final · Nuevos scores de inversión</p>
          </div>
          <div className="opt-cards">
            {finalAssets.map((a) => {
              const note = finalNote(a);
              return (
                <article key={a.symbol} className="opt-card buy" style={{ borderLeftColor: bandColor(a.yearsToDouble) }}>
                  <div className="opt-r1">
                    <span className="opt-tk">{a.ticker}</span>
                    <span className="opt-wt">{fmtPct(a.weightPct)} final</span>
                  </div>
                  <div className="opt-nm">{a.name}</div>
                  <div className="opt-r2">
                    {a.score != null ? (
                      <div className="opt-score">
                        Score de inversión
                        <b>{a.score}<span>/100</span></b>
                        <Stars n={a.stars} />
                      </div>
                    ) : (
                      <div className="opt-score">{a.isCrypto ? 'Cripto · sin score' : 'Sin score'}<b className="opt-assumed">{a.expectedReturnPct != null ? fmtPct(a.expectedReturnPct) : '—'}</b></div>
                    )}
                    <DupChip a={a} />
                  </div>
                  <span className={'opt-chip ' + note.cls}>{note.text}</span>
                </article>
              );
            })}
            {cashRow && cashRow.value > 1 && (
              <div className="opt-note">Efectivo sin asignar: <b>{fmtUsd(cashRow.value)}</b> (los topes de posición no permitieron colocarlo todo).</div>
            )}
          </div>
          <div className="opt-foot">
            <div className="opt-foot-big">Duplica en <em>{yA} años</em></div>
            <div className="opt-foot-small">Retorno esperado ponderado: {reA} anual · {after.positions} activos</div>
          </div>
        </section>
      </div>

      <EvolutionChart before={before} after={after} />
      <BubbleChart
        beforeAssets={result.assets}
        afterAssets={result.finalAssets}
        before={before}
        after={after}
        verdict={result.verdict}
        verdictText={result.verdictText}
      />

      <details className="opt-method">
        <summary>Cómo se calcula · metodología completa y fuentes</summary>
        {Object.values(METHODOLOGY).map((m) => (
          <div key={m.title} className="opt-method-item">
            <strong>{m.title}.</strong> {m.body}
          </div>
        ))}
        <div className="opt-method-item">
          Fuentes: snapshot gratuito de Finviz (fundamentales, EPS próximos 5 años, ROIC), Yahoo Finance
          (consenso de analistas, balances), motor de Fair Value propio de FolioProspect y las referencias de
          expectativas de capital relevadas por el usuario (Grinold-Kroner; J.P. Morgan LTCMA; Vanguard VCMM;
          descomposición de riesgo de Euler). Estimaciones: no es asesoramiento financiero.
        </div>
      </details>
    </div>
  );
};
