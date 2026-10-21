/**
 * Empório A.R — Validação automática de preços (cliente)
 * Garante formato e sinaliza inconsistências (varejo <= atacado).
 *
 * IMPORTANTE: este arquivo NÃO recalcula preços.
 * A regra de negócio (varejo = base×3,0 / atacado = base×2,5 nos acessórios)
 * já vem aplicada nos dados (data.js / Gist). Aqui só formatamos e
 * sinalizamos inconsistências via `priceOk`.
 *
 * Histórico: a versão anterior somava +R$ 20 no varejo quando
 * (varejo - atacado) < 10, o que inflava os preços de acessórios
 * (margem absoluta pequena). Esse comportamento foi removido.
 */

export function parsePrice(str) {
  if (!str || str === '—' || str === '-') return 0;
  const n = String(str).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const v = parseFloat(n);
  return isNaN(v) ? 0 : v;
}

export function formatPrice(val) {
  if (!val || val <= 0) return '—';
  if (Math.abs(val - Math.round(val)) < 0.01) return `${Math.round(val)},00`;
  return val.toFixed(2).replace('.', ',');
}

/** Regras a partir do preço do site (R$) — usada pelos scripts de sync. */
export function applyPriceRules(varejoSite, atacadoSite, { isMini = false } = {}) {
  let v = !varejoSite || varejoSite <= 0 ? 0 : varejoSite + (varejoSite < 30 ? 15 : 30);
  let a = !atacadoSite || atacadoSite <= 0 ? 0 : atacadoSite + 30;
  if (isMini) {
    if (v) v += 30;
    if (a) a += 10;
  }
  if (v > 0 && a > 0 && (v - a) < 10) v += 20;
  return { varejo: v, atacado: a };
}

export function validateProductPrices(item) {
  const isScoop = (item.badge === 'Scoop') || /scoop/i.test(item.nome || '');

  const v = parsePrice(item.varejo);
  const a = parsePrice(item.atacado);

  if (isScoop) {
    return {
      ...item,
      varejo: v ? formatPrice(v) : (item.varejo || '—'),
      atacado: a ? formatPrice(a) : (item.atacado || '—'),
      priceOk: true
    };
  }

  return {
    ...item,
    varejo: v ? formatPrice(v) : (item.varejo || '—'),
    atacado: a ? formatPrice(a) : (item.atacado || '—'),
    // Só sinaliza — nunca altera
    priceOk: !(v > 0 && a > 0 && a > v)
  };
}
