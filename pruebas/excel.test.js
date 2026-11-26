// Pruebas del archivo de Excel del extracto de Master: que el ZIP esté bien armado (firmas, tamaños y CRC, revisados
// con zlib.crc32 de Node) y que las hojas lleven lo que deben.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import * as X from '../excel.js';
import * as F from '../calculos.js';

// Lee un ZIP sin compresión: devuelve { nombre: texto } y revisa cada CRC y el directorio central
function leerZip(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), dec = new TextDecoder();
  const finPos = u8.length - 22;
  assert.equal(v.getUint32(finPos, true), 0x06054b50, 'cierre del ZIP');
  const total = v.getUint16(finPos + 10, true), cdPos = v.getUint32(finPos + 16, true);
  const out = {};
  let p = cdPos;
  for (let i = 0; i < total; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50, 'directorio central');
    const crc = v.getUint32(p + 16, true), largo = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true), local = v.getUint32(p + 42, true);
    const nombre = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    assert.equal(v.getUint32(local, true), 0x04034b50, 'cabecera local de ' + nombre);
    const ini = local + 30 + v.getUint16(local + 26, true), datos = u8.subarray(ini, ini + largo);
    assert.equal(zlib.crc32(datos), crc, 'CRC de ' + nombre);
    out[nombre] = dec.decode(datos);
    p += 46 + nlen;
  }
  return out;
}

// Estado de cuenta ficticio con la forma del banco y una facturación de diciembre con movimientos
const estado = { app: 'master-estado', v: 1, cupo: 1000000,
  estado: { desde: '2026-10-23', hasta: '2026-11-20', pagar_hasta: '2026-12-07', facturado: 51166, minimo: 9000, utilizado: 241166,
    anterior: { desde: '2026-09-23', hasta: '2026-10-22', facturado: 300000 },
    pagos: [['2026-10-30', 'MONTO CANCELADO', -350000]],
    titular: [['2026-10-24', 'Café & <Té>', 10000], ['2026-11-04', 'Bencina', 20000]],
    adicional: [['2026-10-29', 'Farmacia', 5000]],
    cuotas: [['2026-08-14', 'Viaje', 200000, 3, 3, 66666]],
    cargos: [['2026-11-16', 'Devolución tienda', -1000], ['2026-11-02', 'Impuesto de timbres', 500]],
    nuevas: [['2026-10-31', 'Tienda', 90000, 3, 30000], ['2026-11-14', 'Colegio', 100000, 3, 33333]] },
  cuotas: [['2026-10-31', 'Tienda', 90000, 3, '2026-12'], ['2026-11-14', 'Colegio', 100000, 3, '2026-12']] };
const cuentaMaster = () => F.cuenta(F.aplicar('cuentas.json', null, F.leerRespaldo(JSON.stringify(estado)).cambios[0].cambio), 'master');
const movs = [
  { id: 'master|t1', cuenta: 'master', fecha: '2026-11-22', hora: '10:00', comercio: 'Supermercado', monto: 20000, tipo: 'compra', terminacion: '9908' },
  { id: 'master|a1', cuenta: 'master', fecha: '2026-11-23', hora: '11:00', comercio: 'Cafetería', monto: 7000, tipo: 'compra', terminacion: '4526' },
  { id: 'master|c1', cuenta: 'master', fecha: '2026-11-25', hora: '12:00', comercio: 'Muebles', monto: 60000, tipo: 'compra', cuotas: 3 },
  { id: 'master-p1', cuenta: 'master', fecha: '2026-12-05', hora: '', comercio: 'Pago estado de cuenta', monto: 51166, tipo: 'pago' },
  { id: 'master|d1', cuenta: 'master', fecha: '2026-12-06', hora: '09:00', comercio: 'Reversa Cafetería', monto: 2000, tipo: 'devolucion' },
];
const textos = (sst) => [...sst.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map((x) => x[1]);

test('Excel: estado de cuenta con el detalle del banco, en el orden del banco', () => {
  const ex = F.extractoMaster(cuentaMaster(), [], '2026-11-20', '2026-11-26');
  const z = leerZip(X.extractoXlsx(ex, { generado: '26 nov 2026, 11:05', cupo: 1000000, utilizado: 241166, disponible: 758834, enCuotas: 190000, titular: '9908', adicional: '4526' }, new Date(2026, 10, 26, 11, 5)));
  assert.deepEqual(Object.keys(z).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
  assert.match(z['xl/workbook.xml'], /<sheet name="Estado de cuenta" sheetId="1" r:id="rId1"\/>/);
  const sst = z['xl/sharedStrings.xml'], hoja = z['xl/worksheets/sheet1.xml'], t = textos(sst);
  assert.match(sst, /Café &amp; &lt;Té&gt;/);
  assert.ok(t.includes('Periodo del 23 oct 2026 al 20 nov 2026 · pagar hasta el 7 dic 2026 · generado el 26 nov 2026, 11:05'));
  const pos = (x) => t.indexOf(x);
  // Resumen y bloques: Titular, Adicional, Cuotas, Cargos y abonos, Pagos; al final, las compras en cuotas (no se suman)
  assert.ok(pos('Monto facturado a pagar') < pos('Resumen') && pos('Resumen') < pos('Saldo anterior (facturado en octubre 2026)'));
  const encabezados = [...hoja.matchAll(/<c r="A\d+" s="1" t="s"><v>(\d+)<\/v><\/c>/g)].map((x) => t[+x[1]]);
  assert.deepEqual(encabezados, ['Resumen', 'Compras Titular ****9908', 'Compras Adicional ****4526', 'Cuotas', 'Cargos y abonos', 'Pagos',
    'Compras en cuotas de esta facturación (no se suman: se cobran por cuotas)', 'Estado de la tarjeta al generar']);
  assert.ok(t.includes('3/3 de $200.000') && t.includes('Abono') && t.includes('0/3 · 3 × $30.000 desde dic 2026'));
  // Total: saldo anterior + cada bloque del resumen, con su valor ya calculado; cada fila del resumen apunta a su bloque
  assert.match(hoja, /<c r="D4" s="9"><f>D8\+D9\+D10\+D11\+D12\+D13<\/f><v>51166<\/v><\/c>/);
  assert.match(hoja, /<c r="D5" s="2"><v>9000<\/v><\/c>/);
  assert.match(hoja, /<c r="D8" s="2"><v>300000<\/v><\/c>/);
  assert.match(hoja, /<c r="D10" s="2"><f>D15<\/f><v>30000<\/v><\/c>/);
  assert.match(hoja, /<c r="D15" s="10"><f>SUM\(D17:D18\)<\/f><v>30000<\/v><\/c>/);
  assert.match(hoja, /<c r="A17" s="4"><v>46319<\/v><\/c>/);
  assert.match(hoja, /<v>-350000<\/v>/);
  assert.match(hoja, /<v>758834<\/v>/);
  assert.equal(X.nombreExtracto(ex), 'Estado de cuenta Master 2026-11.xlsx');
});

test('Excel: facturación en curso armada con los movimientos', () => {
  const c = cuentaMaster(), ex = F.extractoMaster(c, movs, '2026-12-20', '2026-12-10');
  assert.deepEqual([ex.cerrada, ex.estimado, ex.total], [false, true, 51166 - 51166 + 20000 + 7000 + 63333 - 2000]);
  const z = leerZip(X.extractoXlsx(ex));
  const t = textos(z['xl/sharedStrings.xml']);
  assert.ok(t.includes('Total a pagar estimado'));
  assert.ok(t.some((x) => /^Periodo del 21 nov 2026 al 20 dic 2026 \(cierre estimado\) · en curso$/.test(x)));
  assert.ok(t.includes('Reversa Cafetería') && t.includes('Pago estado de cuenta') && t.includes('1/3 de $90.000') && t.includes('0/3 · 3 × $20.000 desde ene 2027'));
  assert.doesNotMatch(z['xl/sharedStrings.xml'], /Estado de la tarjeta/);
  assert.equal(X.nombreExtracto(ex), 'Estado de cuenta Master 2026-12 en curso.xlsx');
  // El estado de cuenta con que se empezó a mano no trae detalle: solo el total
  const manual = F.valoresInicioMaster({ cupo: 1000000, desde: '2026-10-23', hasta: '2026-11-20', pagar_hasta: '2026-12-07', facturado: 51166, utilizado: 241166 });
  const cm = F.cuenta(F.aplicar('cuentas.json', null, { tipo: 'iniciarMaster', valores: manual }), 'master');
  const exm = F.extractoMaster(cm, [], '2026-11-20', '2026-11-26');
  assert.deepEqual([exm.total, exm.conDetalle], [51166, false]);
  assert.match(leerZip(X.extractoXlsx(exm))['xl/worksheets/sheet1.xml'], /<c r="D4" s="9"><f>D7\+D8\+D9\+D10\+D11\+D12\+D13<\/f><v>51166<\/v><\/c>/);
});

test('Excel: columnas, nombres de hoja, autofiltro y hoja apaisada', () => {
  assert.deepEqual([0, 7, 25, 26, 27, 51, 52, 701, 702].map(X.columna), ['A', 'H', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  const z = leerZip(X.libro([{ nombre: 'A/B: [prueba] con un nombre demasiado largo', filas: [['x', 1]] }, { nombre: 'Datos', filas: [['N°', 'Monto'], [1, 5]], filtro: 'A1:B2', congelar: true, horizontal: true }]));
  assert.match(z['xl/workbook.xml'], /<sheet name="A B {3}prueba {2}con un nombre dem" /);
  assert.match(z['xl/workbook.xml'], /localSheetId="1" hidden="1">'Datos'!\$A\$1:\$B\$2</);
  assert.match(z['xl/worksheets/sheet2.xml'], /<autoFilter ref="A1:B2"\/>/);
  assert.match(z['xl/worksheets/sheet2.xml'], /orientation="landscape"/);
  assert.match(z['xl/worksheets/sheet2.xml'], /state="frozen"/);
});
