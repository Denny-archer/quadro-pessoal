const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = b => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ c >>> 8;
  return (c ^ 0xFFFFFFFF) >>> 0;
};
function zipArquivos(arqs) {
  const enc = new TextEncoder(),
    locais = [],
    central = [];
  let off = 0;
  for (const a of arqs) {
    const nome = enc.encode(a.nome),
      d = a.dados,
      crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true);
    h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, d.length, true);
    h.setUint32(22, d.length, true);
    h.setUint16(26, nome.length, true);
    locais.push(new Uint8Array(h.buffer), nome, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, d.length, true);
    c.setUint32(24, d.length, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nome);
    off += 30 + nome.length + d.length;
  }
  const tam = central.reduce((n, x) => n + x.length, 0),
    e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, arqs.length, true);
  e.setUint16(10, arqs.length, true);
  e.setUint32(12, tam, true);
  e.setUint32(16, off, true);
  return new Blob([...locais, ...central, new Uint8Array(e.buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}
function gerarXlsx(abas) {
  const x = v => String(v).replace(/[&<>"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  })[c]).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  const col = i => {
    let s = "";
    for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
    return s;
  };
  const enc = new TextEncoder(),
    arq = (nome, txt) => ({
      nome,
      dados: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + txt)
    });
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
    REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const folhas = abas.map((a, i) => {
    const rows = a.linhas.map((l, r) => {
      const vs = Array.isArray(l) ? l : l.v,
        neg = !Array.isArray(l) && l.b || r < (a.cab || 0);
      return `<row r="${r + 1}">${vs.map((v, c) => {
        if (v == null || v === "") return "";
        const ref = col(c) + (r + 1),
          st = (neg ? 1 : 0) + (typeof v === "number" && (a.moeda || []).includes(c) ? 2 : 0);
        return typeof v === "number" ? `<c r="${ref}" s="${st}"><v>${v}</v></c>` : `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
      }).join("")}</row>`;
    }).join("");
    const pane = a.cab ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${a.cab}" topLeftCell="A${a.cab + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
    const cols = a.larguras ? `<cols>${a.larguras.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    return arq(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet ${NS}>${pane}${cols}<sheetData>${rows}</sheetData></worksheet>`);
  });
  const ct = `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas.map((a, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const raiz = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb = `<workbook ${NS} xmlns:r="${REL}"><sheets>${abas.map((a, i) => `<sheet name="${x(a.nome.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
  const wbRels = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((a, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${abas.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`;
  const estilos = `<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return zipArquivos([arq("[Content_Types].xml", ct), arq("_rels/.rels", raiz), arq("xl/workbook.xml", wb), arq("xl/_rels/workbook.xml.rels", wbRels), arq("xl/styles.xml", estilos), ...folhas]);
}
export { CRC_T, crc32, zipArquivos, gerarXlsx };
