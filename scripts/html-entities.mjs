const HTML_ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ccedil: 'ç', Ccedil: 'Ç',
  atilde: 'ã', Atilde: 'Ã', otilde: 'õ', Otilde: 'Õ',
  aacute: 'á', Aacute: 'Á', eacute: 'é', Eacute: 'É',
  iacute: 'í', Iacute: 'Í', oacute: 'ó', Oacute: 'Ó',
  uacute: 'ú', Uacute: 'Ú',
  agrave: 'à', Agrave: 'À', ecirc: 'ê', Ecirc: 'Ê',
  acirc: 'â', Acirc: 'Â', ocirc: 'ô', Ocirc: 'Ô',
  ucirc: 'û', Ucirc: 'Û',
  auml: 'ä', Auml: 'Ä', euml: 'ë', Euml: 'Ë',
  iuml: 'ï', Iuml: 'Ï', ouml: 'ö', Ouml: 'Ö',
  uuml: 'ü', Uuml: 'Ü',
  ordm: 'º', ordf: 'ª', deg: '°', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
});

export function decodeHtmlEntities(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\\d+|[a-z][a-z0-9]+);/gi, (entity, token) => {
    if (token[0] === '#') {
      const hex = token[1]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)) return '\\uFFFD';
      return String.fromCodePoint(codePoint);
    }
    return Object.prototype.hasOwnProperty.call(HTML_ENTITIES, token)
      ? HTML_ENTITIES[token]
      : entity;
  });
}
