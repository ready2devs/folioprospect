import type { NwComputedResult, NwSettings } from './types.js';

export const DEFAULT_FX_FORMULA =
  'Base_CCL * ((CCL / MEP) * (1 - c_venta) * (1 - c_mep_c) * (1 - c_mep_v) - 1)';

export const DEFAULT_NW_SETTINGS: NwSettings = {
  brokerCashUsd: 0,
  cashReserveUsd: 0,
  includeCryptoInCcl: false,
  cclOverride: null,
  mepOverride: null,
  cclBaseOverride: null,
  sellCommPct: 0.5,
  mepBuyCommPct: 0.5,
  mepSellCommPct: 0.5,
  fxDiffOverride: null,
  fxFormulaExpr: DEFAULT_FX_FORMULA,
  labelStyle: 'clean',
};

const ALLOWED_VARS = new Set([
  'Base_CCL',
  'CCL',
  'MEP',
  'c_venta',
  'c_mep_c',
  'c_mep_v',
  'k',
  'ratio',
]);

export function evaluateFxFormula(
  expr: string,
  vars: {
    Base_CCL: number;
    CCL: number;
    MEP: number;
    c_venta: number;
    c_mep_c: number;
    c_mep_v: number;
  }
): { value: number | null; error?: string } {
  const trimmed = (expr || '').trim();
  if (!trimmed) {
    return { value: null, error: 'La fórmula está vacía' };
  }

  const env: Record<string, number> = {
    Base_CCL: vars.Base_CCL,
    CCL: vars.CCL,
    MEP: vars.MEP,
    c_venta: vars.c_venta,
    c_mep_c: vars.c_mep_c,
    c_mep_v: vars.c_mep_v,
    k: (1 - vars.c_venta) * (1 - vars.c_mep_c) * (1 - vars.c_mep_v),
    ratio: vars.MEP > 0 ? vars.CCL / vars.MEP : 1,
  };

  // Tokenize safely
  type Token =
    | { type: 'num'; value: number }
    | { type: 'id'; name: string }
    | { type: 'op'; op: '+' | '-' | '*' | '/' | '(' | ')' };

  const tokens: Token[] = [];
  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '(' || ch === ')') {
      tokens.push({ type: 'op', op: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let start = i;
      let dotCount = 0;
      while (i < trimmed.length && /[0-9.]/.test(trimmed[i])) {
        if (trimmed[i] === '.') dotCount++;
        i++;
      }
      const rawNum = trimmed.slice(start, i);
      if (dotCount > 1 || rawNum === '.') {
        return { value: null, error: `Número inválido: ${rawNum}` };
      }
      const parsed = Number(rawNum);
      if (!Number.isFinite(parsed)) {
        return { value: null, error: `Número inválido: ${rawNum}` };
      }
      tokens.push({ type: 'num', value: parsed });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let start = i;
      while (i < trimmed.length && /[A-Za-z0-9_]/.test(trimmed[i])) {
        i++;
      }
      const name = trimmed.slice(start, i);
      if (!ALLOWED_VARS.has(name)) {
        return {
          value: null,
          error: `Variable desconocida: '${name}'. Variables permitidas: Base_CCL, CCL, MEP, c_venta, c_mep_c, c_mep_v, k, ratio`,
        };
      }
      tokens.push({ type: 'id', name });
      continue;
    }
    return { value: null, error: `Carácter no permitido en la fórmula: '${ch}'` };
  }

  if (tokens.length === 0) {
    return { value: null, error: 'La fórmula está vacía' };
  }

  let pos = 0;

  function parseExpression(): number {
    let val = parseTerm();
    while (pos < tokens.length) {
      const tok = tokens[pos];
      if (tok.type === 'op' && (tok.op === '+' || tok.op === '-')) {
        pos++;
        const rhs = parseTerm();
        val = tok.op === '+' ? val + rhs : val - rhs;
      } else {
        break;
      }
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseFactor();
    while (pos < tokens.length) {
      const tok = tokens[pos];
      if (tok.type === 'op' && (tok.op === '*' || tok.op === '/')) {
        pos++;
        const rhs = parseFactor();
        if (tok.op === '/') {
          if (Math.abs(rhs) < 1e-12) {
            throw new Error('División por cero en la fórmula');
          }
          val = val / rhs;
        } else {
          val = val * rhs;
        }
      } else {
        break;
      }
    }
    return val;
  }

  function parseFactor(): number {
    if (pos >= tokens.length) {
      throw new Error('Expresión incompleta al final de la fórmula');
    }
    const tok = tokens[pos];
    if (tok.type === 'op' && (tok.op === '+' || tok.op === '-')) {
      pos++;
      const inner = parseFactor();
      return tok.op === '-' ? -inner : inner;
    }
    if (tok.type === 'op' && tok.op === '(') {
      pos++;
      const inner = parseExpression();
      const close = tokens[pos];
      if (!close || close.type !== 'op' || close.op !== ')') {
        throw new Error('Falta paréntesis de cierre ")"');
      }
      pos++;
      return inner;
    }
    if (tok.type === 'num') {
      pos++;
      return tok.value;
    }
    if (tok.type === 'id') {
      pos++;
      return env[tok.name];
    }
    throw new Error(`Token inesperado: '${tok.type === 'op' ? tok.op : ''}'`);
  }

  try {
    const result = parseExpression();
    if (pos < tokens.length) {
      const leftover = tokens[pos];
      return {
        value: null,
        error: `Token inesperado cerca de '${
          leftover.type === 'op'
            ? leftover.op
            : leftover.type === 'id'
            ? leftover.name
            : leftover.value
        }'`,
      };
    }
    if (!Number.isFinite(result)) {
      return { value: null, error: 'El resultado de la fórmula no es un número finito' };
    }
    return { value: result };
  } catch (err: any) {
    return { value: null, error: err?.message || 'Error de sintaxis en la fórmula' };
  }
}

export function computeNwPatrimony(params: {
  holdings: { value: number; assetType: string }[];
  grossHoldingsUsd: number;
  illiquidTotalUsd?: number;
  cclLive: number;
  mepLive: number;
  settings: NwSettings;
}): NwComputedResult {
  const {
    holdings,
    grossHoldingsUsd,
    illiquidTotalUsd = 0,
    cclLive,
    mepLive,
    settings,
  } = params;

  const brokerCashUsd = Number.isFinite(settings.brokerCashUsd) ? settings.brokerCashUsd : 0;
  const cashReserveUsd = Number.isFinite(settings.cashReserveUsd) ? settings.cashReserveUsd : 0;
  const financialPortfolioLiquidUsd = grossHoldingsUsd + brokerCashUsd;

  const cclBaseAutoUsd = holdings.reduce((sum, h) => {
    if (!settings.includeCryptoInCcl && h.assetType === 'Crypto') {
      return sum;
    }
    return sum + (Number.isFinite(h.value) ? h.value : 0);
  }, 0);

  const cclBaseUsd =
    settings.cclBaseOverride != null && Number.isFinite(settings.cclBaseOverride)
      ? settings.cclBaseOverride
      : cclBaseAutoUsd;

  const cclRate =
    settings.cclOverride != null && Number.isFinite(settings.cclOverride) && settings.cclOverride > 0
      ? settings.cclOverride
      : cclLive > 0
      ? cclLive
      : 1637.9;

  const mepRate =
    settings.mepOverride != null && Number.isFinite(settings.mepOverride) && settings.mepOverride > 0
      ? settings.mepOverride
      : mepLive > 0
      ? mepLive
      : 1553.6;

  const gapPct = mepRate > 0 ? (cclRate / mepRate - 1) * 100 : 0;

  const sellCommPct = Math.max(0, Number.isFinite(settings.sellCommPct) ? settings.sellCommPct : 0.5);
  const mepBuyCommPct = Math.max(
    0,
    Number.isFinite(settings.mepBuyCommPct) ? settings.mepBuyCommPct : 0.5
  );
  const mepSellCommPct = Math.max(
    0,
    Number.isFinite(settings.mepSellCommPct) ? settings.mepSellCommPct : 0.5
  );

  const commissionFactor =
    (1 - sellCommPct / 100) * (1 - mepBuyCommPct / 100) * (1 - mepSellCommPct / 100);
  const totalCommPct = (1 - commissionFactor) * 100;

  const standardUsdMepObtained =
    mepRate > 0 ? cclBaseUsd * (cclRate / mepRate) * commissionFactor : cclBaseUsd;
  const standardFxDiffAuto = standardUsdMepObtained - cclBaseUsd;

  const formulaExprUsed = (settings.fxFormulaExpr || DEFAULT_FX_FORMULA).trim() || DEFAULT_FX_FORMULA;
  const evalResult = evaluateFxFormula(formulaExprUsed, {
    Base_CCL: cclBaseUsd,
    CCL: cclRate,
    MEP: mepRate,
    c_venta: sellCommPct / 100,
    c_mep_c: mepBuyCommPct / 100,
    c_mep_v: mepSellCommPct / 100,
  });

  const fxDiffAutoUsd =
    evalResult.value !== null && Number.isFinite(evalResult.value)
      ? evalResult.value
      : standardFxDiffAuto;
  const usdMepObtained = cclBaseUsd + fxDiffAutoUsd;
  const formulaError = evalResult.error;

  const fxDiffUsd =
    settings.fxDiffOverride != null && Number.isFinite(settings.fxDiffOverride)
      ? settings.fxDiffOverride
      : fxDiffAutoUsd;

  const nwLiquidUsd = financialPortfolioLiquidUsd + cashReserveUsd + fxDiffUsd;
  const nwTotalUsd = nwLiquidUsd + illiquidTotalUsd;

  return {
    grossHoldingsUsd,
    brokerCashUsd,
    financialPortfolioLiquidUsd,
    cclBaseAutoUsd,
    cclBaseUsd,
    cclRate,
    mepRate,
    gapPct,
    commissionFactor,
    totalCommPct,
    usdMepObtained,
    fxDiffAutoUsd,
    fxDiffUsd,
    cashReserveUsd,
    nwLiquidUsd,
    illiquidTotalUsd,
    nwTotalUsd,
    formulaExprUsed,
    ...(formulaError ? { formulaError } : {}),
  };
}
