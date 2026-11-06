/**
 * CEP Helper — busca cidade e estado via /.netlify/functions/cep
 * Uso no app.js (não altera regras de preço).
 *
 * Exemplo de integração:
 *   import { lookupCep, formatCep, attachCepLookup } from './cep-helper.js';
 *   // ou (script clássico): window.EmpCep.lookupCep(...)
 */
(function (global) {
  'use strict';

  function formatCep(raw) {
    const d = String(raw || '').replace(/\D/g, '').slice(0, 8);
    if (d.length <= 5) return d;
    return d.slice(0, 5) + '-' + d.slice(5);
  }

  async function lookupCep(cepRaw) {
    const cep = String(cepRaw || '').replace(/\D/g, '');
    if (cep.length !== 8) {
      return { ok: false, message: 'CEP deve ter 8 dígitos' };
    }
    try {
      const res = await fetch('/.netlify/functions/cep?cep=' + encodeURIComponent(cep), {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || data.erro) {
        return { ok: false, message: data.message || 'CEP não encontrado' };
      }
      return {
        ok: true,
        cep: data.cep || formatCep(cep),
        cidade: data.localidade || '',
        estado: data.uf || '',
        bairro: data.bairro || '',
        logradouro: data.logradouro || '',
        source: data.source || '',
      };
    } catch (e) {
      return { ok: false, message: 'Falha ao consultar CEP' };
    }
  }

  /**
   * Anexa lookup automático a um input de CEP.
   * @param {HTMLInputElement} inputEl
   * @param {Object} opts
   * @param {HTMLElement} [opts.warnEl]  - elemento de aviso
   * @param {HTMLElement} [opts.infoEl]  - onde mostrar "Cidade - UF"
   * @param {number} [opts.debounceMs=450]
   * @param {Function} [opts.onResult]   - callback(result)
   */
  function attachCepLookup(inputEl, opts = {}) {
    if (!inputEl) return;
    const debounceMs = opts.debounceMs ?? 450;
    let timer = null;
    let lastOk = '';

    function setWarn(msg, isError) {
      if (!opts.warnEl) return;
      opts.warnEl.textContent = msg || '';
      opts.warnEl.style.display = msg ? '' : 'none';
      opts.warnEl.classList.toggle('error', !!isError);
    }

    function setInfo(text) {
      if (!opts.infoEl) return;
      opts.infoEl.textContent = text || '';
      opts.infoEl.style.display = text ? '' : 'none';
    }

    inputEl.addEventListener('input', () => {
      const formatted = formatCep(inputEl.value);
      if (inputEl.value !== formatted) inputEl.value = formatted;
      const digits = formatted.replace(/\D/g, '');
      clearTimeout(timer);
      if (digits.length < 8) {
        setWarn(digits.length ? 'CEP incompleto — pode enviar assim mesmo.' : '');
        setInfo('');
        lastOk = '';
        return;
      }
      setWarn('Buscando cidade…');
      timer = setTimeout(async () => {
        if (digits === lastOk) return;
        const r = await lookupCep(digits);
        if (r.ok) {
          lastOk = digits;
          setWarn('');
          const label = [r.cidade, r.estado].filter(Boolean).join(' - ');
          setInfo(label ? '📍 ' + label : '');
          if (typeof opts.onResult === 'function') opts.onResult(r);
        } else {
          setWarn(r.message || 'CEP não encontrado', true);
          setInfo('');
          if (typeof opts.onResult === 'function') opts.onResult(r);
        }
      }, debounceMs);
    });

    inputEl.addEventListener('blur', () => {
      inputEl.value = formatCep(inputEl.value);
    });
  }

  /**
   * Monta texto de localização para a mensagem do WhatsApp.
   * Ex.: "CEP: 74000-000 — Goiânia/GO"
   */
  function locationLine(cepRaw, lookupResult) {
    const cep = formatCep(cepRaw);
    if (!cep) return '';
    if (lookupResult && lookupResult.ok && (lookupResult.cidade || lookupResult.estado)) {
      const cityUf = [lookupResult.cidade, lookupResult.estado].filter(Boolean).join('/');
      return 'CEP: ' + cep + (cityUf ? ' — ' + cityUf : '');
    }
    return 'CEP: ' + cep;
  }

  const api = { formatCep, lookupCep, attachCepLookup, locationLine };
  global.EmpCep = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
