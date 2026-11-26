// Finanzas · archivo de Excel (.xlsx) armado aquí mismo, sin bibliotecas, para que funcione sin conexión. Sin pantalla:
// lo usan la app (extracto de Master) y las pruebas (node --test pruebas/*.test.js).
// Un .xlsx es un ZIP con unas pocas partes en XML. Se guarda sin comprimir: los extractos son pequeños.
// Viene de la app Master (pablocarvallo/master), que ya exportaba su extracto así.

import { fechaCorta, nombreMes } from './calculos.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';

// Estilos de celda: encabezado de tabla, monto en pesos, monto en negrita, fecha, hora, título, negrita, nota, monto
// grande (como el título), monto en un encabezado de tabla y negrita a la derecha
const ESTILOS = { enc: 1, monto: 2, montoB: 3, fecha: 4, hora: 5, titulo: 6, negrita: 7, nota: 8, montoG: 9, encMonto: 10, negritaD: 11 };

/* ---------- Fechas para Excel ---------- */
// Excel cuenta los días desde el 30 dic 1899; la hora es la fracción del día
export function fechaExcel(k) { return Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86400000 + 25569; }
export function horaExcel(h) { return (+h.slice(0, 2) * 60 + +h.slice(3, 5)) / 1440; }

/* ---------- ZIP sin compresión ---------- */
let tablaCrc = null;
export function crc32(u8) {
  if (!tablaCrc) {
    tablaCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tablaCrc[n] = c >>> 0; }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) crc = tablaCrc[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
// Por cada archivo, cabecera local y datos; al final, el directorio central y el cierre
function zip(archivos, ahora) {
  const enc = new TextEncoder(), partes = [], central = [];
  const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
  const dia = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  const registro = (firma, largo) => { const v = new DataView(new ArrayBuffer(largo)); v.setUint32(0, firma, true); return v; };
  let pos = 0, largoCentral = 0;
  archivos.forEach((f) => {
    const nombre = enc.encode(f.nombre), datos = enc.encode(f.texto), crc = crc32(datos);
    const local = registro(0x04034b50, 30);
    local.setUint16(4, 20, true); local.setUint16(8, 0, true); local.setUint16(10, hora, true); local.setUint16(12, dia, true);
    local.setUint32(14, crc, true); local.setUint32(18, datos.length, true); local.setUint32(22, datos.length, true); local.setUint16(26, nombre.length, true);
    const cab = registro(0x02014b50, 46);
    cab.setUint16(4, 20, true); cab.setUint16(6, 20, true); cab.setUint16(12, hora, true); cab.setUint16(14, dia, true);
    cab.setUint32(16, crc, true); cab.setUint32(20, datos.length, true); cab.setUint32(24, datos.length, true); cab.setUint16(28, nombre.length, true);
    cab.setUint32(42, pos, true);
    partes.push(new Uint8Array(local.buffer), nombre, datos);
    central.push(new Uint8Array(cab.buffer), nombre);
    pos += 30 + nombre.length + datos.length; largoCentral += 46 + nombre.length;
  });
  const fin = registro(0x06054b50, 22);
  fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true); fin.setUint32(12, largoCentral, true); fin.setUint32(16, pos, true);
  const todo = partes.concat(central, [new Uint8Array(fin.buffer)]);
  const out = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let i = 0;
  todo.forEach((p) => { out.set(p, i); i += p.length; });
  return out;
}

/* ---------- Libro ---------- */
const xesc = (v) => String(v).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
export function columna(i) { let out = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) out = String.fromCharCode(65 + (i - 1) % 26) + out; return out; }
// El nombre de una hoja: hasta 31 caracteres y sin : \ / ? * [ ]
const nombreHoja = (n) => String(n).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Hoja';

// hojas: [{ nombre, filas, anchos, congelar, filtro, horizontal }]. Una fila es una lista de celdas; una celda es un valor suelto
// (número o texto) o { v, s, f }: valor, estilo (una de las claves de ESTILOS) y fórmula sin «=», con su valor ya
// calculado en v. «filtro» es el rango con autofiltro (por ejemplo «A1:H20»); «congelar» fija la primera fila;
// «horizontal» la imprime apaisada y del ancho de la página.
// Devuelve los bytes del archivo .xlsx.
export function libro(hojas, ahora = new Date()) {
  const textos = [], indice = new Map();
  let usos = 0;
  const sst = (v) => { usos++; if (!indice.has(v)) { indice.set(v, textos.length); textos.push(v); } return indice.get(v); };
  const hojaXml = (h) => {
    let x = XML_HEAD + '<worksheet xmlns="' + NS_MAIN + '">';
    if (h.horizontal) x += '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
    if (h.congelar) x += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>';
    else x += '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    if (h.anchos && h.anchos.length) x += '<cols>' + h.anchos.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>';
    x += '<sheetData>';
    (h.filas || []).forEach((fila, r) => {
      let celdas = '';
      (fila || []).forEach((celda, i) => {
        if (celda == null || celda === '') return;
        if (typeof celda !== 'object') celda = { v: celda };
        const s = celda.s && ESTILOS[celda.s] ? ' s="' + ESTILOS[celda.s] + '"' : '';
        const ref = columna(i) + (r + 1);
        if (celda.f) celdas += '<c r="' + ref + '"' + s + '><f>' + xesc(celda.f) + '</f>' + (typeof celda.v === 'number' && isFinite(celda.v) ? '<v>' + celda.v + '</v>' : '') + '</c>';
        else if (typeof celda.v === 'number' && isFinite(celda.v)) celdas += '<c r="' + ref + '"' + s + '><v>' + celda.v + '</v></c>';
        else if (celda.v != null && celda.v !== '') celdas += '<c r="' + ref + '"' + s + ' t="s"><v>' + sst(String(celda.v)) + '</v></c>';
        else if (s) celdas += '<c r="' + ref + '"' + s + '/>';
      });
      if (celdas) x += '<row r="' + (r + 1) + '">' + celdas + '</row>';
    });
    x += '</sheetData>';
    if (h.filtro) x += '<autoFilter ref="' + h.filtro + '"/>';
    x += '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>';
    if (h.horizontal) x += '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
    return x + '</worksheet>';
  };
  const partes = hojas.map((h) => ({ nombre: nombreHoja(h.nombre), xml: hojaXml(h), filtro: h.filtro }));
  const n = partes.length;

  const formatoPesos = '&quot;$&quot;\\ #,##0;\\-&quot;$&quot;\\ #,##0';
  const estilos = XML_HEAD + '<styleSheet xmlns="' + NS_MAIN + '">' +
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="' + formatoPesos + '"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="dd\\-mm\\-yyyy"/></numFmts>' +
    '<fonts count="5"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FF1D3F8F"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDFE9FD"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF9FB4E6"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="12"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="3" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const filtros = partes.map((p, i) => p.filtro ? '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + p.nombre.replace(/'/g, "''") + '\'!' + p.filtro.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2') + '</definedName>' : '').join('');
  const archivos = [
    { nombre: '[Content_Types].xml', texto: XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="' + CT + 'sheet.main+xml"/>' +
      partes.map((p, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="' + CT + 'worksheet+xml"/>').join('') +
      '<Override PartName="/xl/styles.xml" ContentType="' + CT + 'styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="' + CT + 'sharedStrings+xml"/></Types>' },
    { nombre: '_rels/.rels', texto: XML_HEAD + '<Relationships xmlns="' + NS_PKG + '"><Relationship Id="rId1" Type="' + NS_REL + '/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nombre: 'xl/workbook.xml', texto: XML_HEAD + '<workbook xmlns="' + NS_MAIN + '" xmlns:r="' + NS_REL + '"><bookViews><workbookView/></bookViews><sheets>' +
      partes.map((p, i) => '<sheet name="' + xesc(p.nombre) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>' +
      (filtros ? '<definedNames>' + filtros + '</definedNames>' : '') + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: XML_HEAD + '<Relationships xmlns="' + NS_PKG + '">' +
      partes.map((p, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + NS_REL + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (n + 1) + '" Type="' + NS_REL + '/styles" Target="styles.xml"/><Relationship Id="rId' + (n + 2) + '" Type="' + NS_REL + '/sharedStrings" Target="sharedStrings.xml"/></Relationships>' },
  ];
  partes.forEach((p, i) => archivos.push({ nombre: 'xl/worksheets/sheet' + (i + 1) + '.xml', texto: p.xml }));
  archivos.push({ nombre: 'xl/styles.xml', texto: estilos });
  archivos.push({ nombre: 'xl/sharedStrings.xml', texto: XML_HEAD + '<sst xmlns="' + NS_MAIN + '" count="' + usos + '" uniqueCount="' + textos.length + '">' +
    textos.map((v) => '<si><t xml:space="preserve">' + xesc(v) + '</t></si>').join('') + '</sst>' });
  return zip(archivos, ahora);
}

/* ---------- Extracto de Master ---------- */
const fechaLarga = (k) => fechaCorta(k) + ' ' + k.slice(0, 4);
const mesAno = (ym) => nombreMes(ym) + ' ' + ym.slice(0, 4);
export const nombreExtracto = (ex) => 'Extracto Master ' + ex.desde + ' al ' + ex.hasta + '.xlsx';
export const numeroCuota = (f) => f.cuota + '/' + f.de;
// ex: lo que devuelve extractoMaster de calculos.js. info: { generado (texto), cupo, utilizado, disponible, enCuotas },
// el estado de la tarjeta al generar el archivo (se omite lo que venga vacío). Una hoja, en el orden de la app: total a
// pagar, compras Titular, compras Adicional, cuotas del periodo, cargos y abonos, cada bloque con su total (fórmula).
export function extractoXlsx(ex, info = {}, ahora = new Date()) {
  const filas = [
    [{ v: 'Master · Extracto de la tarjeta de crédito', s: 'titulo' }],
    ['Del ' + fechaLarga(ex.desde) + ' al ' + fechaLarga(ex.hasta) + (info.generado ? ' · generado el ' + info.generado : '')],
    [],
  ];
  const iTotal = filas.push([{ v: 'Total a pagar', s: 'titulo' }, '', '', null]) - 1;
  filas.push([]);
  const sumados = [];
  const bloque = (titulo, sec, conCuota, suma) => {
    const cab = filas.length + 1;
    filas.push([{ v: titulo, s: 'enc' }, { v: '', s: 'enc' }, { v: '', s: 'enc' }, null]);
    filas.push([{ v: conCuota ? 'Fecha compra' : 'Fecha', s: 'negrita' }, { v: 'Comercio', s: 'negrita' }, { v: conCuota ? 'Cuota' : '', s: 'negrita' }, { v: 'Monto', s: 'negritaD' }]);
    const primera = filas.length + 1;
    sec.filas.forEach((f) => filas.push([{ v: fechaExcel(f.fecha), s: 'fecha' }, f.comercio + (f.primera ? ' (primera cuota en ' + mesAno(f.primera) + ')' : ''),
      conCuota ? numeroCuota(f) : '', { v: f.monto, s: 'monto' }]));
    if (!sec.filas.length) filas.push(['', { v: 'Sin movimientos', s: 'nota' }]);
    const ultima = filas.length;
    filas[cab - 1][3] = sec.filas.length ? { v: sec.total, s: 'encMonto', f: 'SUM(D' + primera + ':D' + ultima + ')' } : { v: 0, s: 'encMonto' };
    if (suma) sumados.push('D' + cab);
    filas.push([]);
  };
  bloque('Compras Titular', ex.titular, false, true);
  bloque('Compras Adicional', ex.adicional, false, true);
  bloque('Cuotas del periodo', ex.cuotas, true, true);
  if (ex.cargos.filas.length) bloque('Cargos', ex.cargos, false, true);
  if (ex.abonos.filas.length) bloque('Abonos (pagos a la tarjeta; no se restan)', ex.abonos, false, false);
  filas[iTotal][3] = { v: ex.total, s: 'montoG', f: sumados.join('+') };
  const estado = [['Cupo', info.cupo], ['Utilizado', info.utilizado], ['Disponible', info.disponible], ['Por cobrar en cuotas', info.enCuotas]]
    .filter(([, v]) => typeof v === 'number' && isFinite(v));
  if (estado.length) {
    filas.push([{ v: 'Estado de la tarjeta al generar', s: 'enc' }, { v: '', s: 'enc' }, { v: '', s: 'enc' }, { v: '', s: 'enc' }]);
    estado.forEach(([k, v]) => filas.push([k, '', '', { v, s: 'monto' }]));
    filas.push([]);
  }
  filas.push([{ v: 'Las compras en cuotas van por la cuota que se factura en el periodo (cierre el día 22); las que empiezan a cobrarse después van con 0 y $0. Los abonos no se restan del total.', s: 'nota' }]);
  return libro([{ nombre: 'Extracto', filas, anchos: [13, 40, 8, 15] }], ahora);
}
