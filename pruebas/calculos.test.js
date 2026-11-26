// Pruebas de los cálculos de Finanzas. Correr con: TZ=America/Santiago node --test pruebas/*.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../calculos.js';

const cuentas = () => JSON.parse(JSON.stringify(F.PLANTILLAS['cuentas.json']));
const aplicarTodos = (r, archivos) => {
  for (const { archivo, cambio } of r.cambios) archivos[archivo] = F.aplicar(archivo, archivos[archivo], cambio);
  return archivos;
};
const movsDe = (a) => Object.keys(a).filter((k) => k.startsWith('movimientos/')).flatMap((k) => a[k]);

test('FAN: saldo desde el ajuste, con la misma clave de los avisos y sin otras cuentas', () => {
  const r = F.leerRespaldo(JSON.stringify({ app: 'fan', v: 1, cuenta: { amount: 500000, at: '2026-11-01T10:00', ignored: [], acct: '4018' }, movimientos: [
    { id: 'a', type: 'c', date: '2026-11-01', time: '09:00', desc: 'Antes del ajuste', amount: 1000, src: 'manual' },
    { id: 'b', type: 'c', date: '2026-11-24', time: '08:57', desc: 'SB 460 ROGER DE F', amount: 4063, src: 'mail', key: '2026-11-24T08:57|4063|SB 460 ROGER DE F', acct: '4018' },
    { id: 'c', type: 'd', date: '2026-11-15', time: '12:00', desc: 'Sueldo', amount: 100000, src: 'manual' },
    { id: 'e', type: 'c', date: '2026-11-20', time: '18:28', desc: 'Giro en cajero', amount: 20000, src: 'mail', key: '2026-11-20T18:28|20000|GIRO EN CAJERO', acct: '4018' },
    { id: 'f', type: 'c', date: '2026-10-30', time: '12:00', desc: 'Octubre', amount: 5000, src: 'manual' },
  ] }));
  assert.equal(r.app, 'fan');
  // El aviso del 24 nov ya llegó por el sistema nuevo, con el id del lector: no se duplica
  const a = { 'movimientos/2026-11.json': [{ origen: 'aviso', aviso: 1, cuenta: 'fan', fecha: '2026-11-24', hora: '08:57', comercio: 'SB 460 ROGER DE F', monto: 4063, tipo: 'compra', terminacion: '4018', id: 'fan|2026-11-24T08:57|4063|SB460ROGERDEF' },
    { origen: 'aviso', cuenta: 'fan', fecha: '2026-11-24', hora: '10:00', comercio: 'Otra cuenta', monto: 999, tipo: 'compra', terminacion: '1111', id: 'fan|otra' }] };
  aplicarTodos(r, a);
  assert.equal(a['movimientos/2026-11.json'].length, 5);
  assert.equal(a['movimientos/2026-10.json'].length, 1);
  const E = F.estadoCuentas(a['cuentas.json'], movsDe(a), '2026-11-24');
  assert.equal(E.fan.saldo, 500000 + 100000 - 4063 - 20000);
  assert.equal(E.fan.gastoMes, 1000 + 4063 + 20000);
  assert.equal(F.cuenta(a['cuentas.json'], 'fan').terminacion, '4018');
  assert.equal(a['movimientos/2026-11.json'].find((m) => m.fecha === '2026-11-20').tipo, 'giro');
});

test('Master: respaldo de la app antigua (utilizado desde el día de partida y cupo)', () => {
  const r = F.leerRespaldo(JSON.stringify({ app: 'master', v: 2, tarjeta: { limit: 2000000, desde: '2026-10-01', saldo: 300000 }, movimientos: [
    { id: 'x', type: 'c', date: '2026-09-30', amount: 7000, desc: 'Antes', who: 'T', n: 1 },
    { id: 'y', type: 'c', date: '2026-10-10', amount: 120000, desc: 'TV', who: 'A', n: 6, prox: '2026-10', src: 'manual' },
    { id: 'z', type: 'a', date: '2026-11-05', amount: 200000, desc: 'Pago' },
    { id: 'w', type: 'g', date: '2026-11-06', amount: 3500, desc: 'Comisión' },
    { id: 'q', type: 'q', date: '2026-10-01', amount: 40000, n: 4, prox: '2026-11', desc: 'Cuotas anteriores' },
    { id: 'm', type: 'c', date: '2026-11-23', time: '20:15', amount: 15990, desc: 'FARMACIA', who: 'T', n: 1, src: 'mail', key: '2026-11-23T20:15|15990|FARMACIA', card: '9908' },
  ] }));
  const a = aplicarTodos(r, {});
  const E = F.estadoCuentas(a['cuentas.json'], movsDe(a), '2026-11-24');
  assert.equal(E.master.utilizado, 300000 + 120000 - 200000 + 3500 + 40000 + 15990);
  assert.equal(E.master.disponible, 2000000 - E.master.utilizado);
  assert.equal(E.master.inicio, null);                       // sin estado de cuenta, Master pide empezar con uno
  assert.equal(E.master.adicionalMes, 0);
  assert.ok(movsDe(a).some((m) => m.id === 'master|2026-11-23T20:15|15990|FARMACIA' && m.titular === 'Titular'));
  assert.ok(movsDe(a).filter(F.esCuotas).every((m) => !('titular' in m)));
  assert.ok(F.avisos(E, F.estadoPagos({}), '2026-11-24').some((x) => x.texto === 'Empieza Master desde el estado de cuenta del banco'));
});

// Estado de cuenta ficticio con la misma forma que el del banco (A + B + D + E + G)
const estadoFicticio = () => ({ app: 'master-estado', v: 1, cupo: 1000000,
  estado: { desde: '2026-10-23', hasta: '2026-11-20', pagar_hasta: '2026-12-07', facturado: 51166, minimo: 9000, utilizado: 241166,
    anterior: { desde: '2026-09-23', hasta: '2026-10-22', facturado: 300000 },
    pagos: [['2026-10-30', 'MONTO CANCELADO', -350000]],
    titular: [['2026-10-24', 'Panadería', 10000], ['2026-11-04', 'Bencina', 20000]],
    adicional: [['2026-10-29', 'Farmacia', 5000]],
    cuotas: [['2026-08-14', 'Viaje', 200000, 3, 3, 66666]],
    cargos: [['2026-11-16', 'Devolución tienda', -1000], ['2026-11-02', 'Impuesto de timbres', 500]],
    nuevas: [['2026-10-31', 'Tienda', 90000, 3, 30000], ['2026-11-14', 'Colegio', 100000, 3, 33333]] },
  cuotas: [['2026-10-31', 'Tienda', 90000, 3, '2026-12'], ['2026-11-14', 'Colegio', 100000, 3, '2026-12']] });
const empezar = () => {
  const r = F.leerRespaldo(JSON.stringify(estadoFicticio()));
  assert.ok(!r.error, r.error);
  return { r, cs: F.aplicar('cuentas.json', null, r.cambios[0].cambio) };
};
// Movimientos de la facturación de diciembre (21 nov al 20 dic)
const movsDic = [
  { id: 'master|antes', origen: 'aviso', cuenta: 'master', fecha: '2026-11-19', hora: '10:00', comercio: 'Antes del inicio', monto: 999, tipo: 'compra', terminacion: '9908' },
  { id: 'master|t1', origen: 'aviso', cuenta: 'master', fecha: '2026-11-22', hora: '10:00', comercio: 'Supermercado', monto: 20000, tipo: 'compra', terminacion: '9908' },
  { id: 'master|a1', origen: 'aviso', cuenta: 'master', fecha: '2026-11-23', hora: '11:00', comercio: 'Cafetería', monto: 7000, tipo: 'compra', terminacion: '4526' },
  { id: 'master|c1', origen: 'aviso', cuenta: 'master', fecha: '2026-11-25', hora: '12:00', comercio: 'Muebles', monto: 60000, tipo: 'compra', terminacion: '4526', cuotas: 3 },
  { id: 'master-p1', origen: 'manual', cuenta: 'master', fecha: '2026-12-05', hora: '', comercio: 'Pago estado de cuenta', monto: 51166, tipo: 'pago' },
  { id: 'master|d1', origen: 'aviso', cuenta: 'master', fecha: '2026-12-06', hora: '09:00', comercio: 'Reversa Cafetería', monto: 2000, tipo: 'devolucion' },
  { id: 'master-g1', origen: 'manual', cuenta: 'master', fecha: '2026-12-07', hora: '', comercio: 'Impuesto de timbres', monto: 300, tipo: 'cargo' },
  { id: 'fan|x', origen: 'aviso', cuenta: 'fan', fecha: '2026-12-01', hora: '', comercio: 'Otra cuenta', monto: 5000, tipo: 'compra' },
];

test('Master: empezar desde el estado de cuenta, que cuadra como el del banco', () => {
  const { r, cs } = empezar();
  assert.equal(r.app, 'master-estado');
  assert.equal(r.cuadra, true);                               // utilizado = facturado + cuotas por facturar
  const c = F.cuenta(cs, 'master');
  assert.deepEqual([c.cupo, c.inicio, c.deuda_inicial.monto, c.deuda_inicial.fecha, c.facturaciones.length, c.cuotas.length], [1000000, '2026-11-21', 241166, '2026-11-21', 1, 2]);
  const ex = F.extractoMaster(c, [], '2026-11-20', '2026-11-26');
  assert.deepEqual([ex.anterior, ex.pagos.total, ex.titular.total, ex.adicional.total, ex.cuotas.total, ex.cargos.total, ex.total, ex.diferencia],
    [300000, -350000, 30000, 5000, 66666, -500, 51166, 0]);
  assert.deepEqual(ex.cuotas.filas.map((x) => x.cuota + '/' + x.de), ['3/3']);
  assert.deepEqual(ex.cargos.filas.map((x) => x.tipo), ['abono', 'cargo']);   // la devolución es un abono, no un pago
  assert.deepEqual(ex.nuevas.filas.map((x) => [x.comercio, x.cuota, x.de, x.primera]), [['Tienda', 0, 3, '2026-12'], ['Colegio', 0, 3, '2026-12']]);
  // Si el detalle no suma el monto facturado, no se acepta
  const malo = estadoFicticio(); malo.estado.facturado = 51167;
  assert.match(F.leerRespaldo(JSON.stringify(malo)).error, /suma \$\s51\.166/);
});

test('Master: facturación en curso con Titular, Adicional, cuotas, cargos y abonos, y pagos aparte', () => {
  const { cs } = empezar();
  const E = F.estadoCuentas(cs, movsDic, '2026-12-10'), m = E.master;
  assert.equal(m.utilizado, 241166 + 20000 + 7000 + 60000 - 51166 - 2000 + 300);
  assert.equal(m.disponible, 1000000 - m.utilizado);
  assert.deepEqual([m.enCurso.desde, m.enCurso.hasta, m.enCurso.estimado, m.porCerrar], ['2026-11-21', '2026-12-20', true, false]);
  assert.deepEqual([m.porPagar.facturado, m.porPagar.pagado, m.porPagar.falta, m.porPagar.pagar_hasta], [51166, 51166, 0, '2026-12-07']);
  const ex = m.extracto;
  assert.deepEqual(ex.titular.filas.map((x) => x.id), ['master|t1']);           // la compra anterior al inicio no cuenta
  assert.deepEqual(ex.adicional.filas.map((x) => x.id), ['master|a1']);
  assert.deepEqual(ex.cuotas.filas.map((x) => x.comercio + ' ' + x.cuota + '/' + x.de + ' ' + x.monto), ['Tienda 1/3 30000', 'Colegio 1/3 33333']);
  assert.deepEqual(ex.cargos.filas.map((x) => x.tipo + ' ' + x.monto), ['abono -2000', 'cargo 300']);
  assert.deepEqual(ex.pagos.filas.map((x) => x.monto), [-51166]);
  assert.equal(ex.anterior, 51166);
  assert.equal(ex.total, 51166 - 51166 + 20000 + 7000 + 63333 - 1700);
  // La compra en cuotas del 25 nov no es de Titular ni de Adicional: empieza a cobrarse en enero
  assert.deepEqual(ex.nuevas.filas.map((x) => [x.comercio, x.cuota, x.primera, x.valor]), [['Muebles', 0, '2027-01', 20000]]);
  assert.equal(F.tarjetaDe(movsDic[3], F.cuenta(cs, 'master')), '');
  assert.equal(m.cuotasPendiente, 90000 + 100000 + 60000);
  assert.deepEqual(m.cuotas.map((x) => x.q.comercio + ' ' + x.siguiente + '/' + x.q.n + ' ' + x.mesSiguiente), ['Tienda 1/3 2026-12', 'Colegio 1/3 2026-12', 'Muebles 1/3 2027-01']);
  assert.equal(m.titularMes, 0);
  assert.equal(m.gastoMes, 300);                                 // en diciembre solo el cargo; el pago y el abono entran
});

test('Master: cerrar con el estado de cuenta, diferencia con el banco y reabrir', () => {
  let { cs } = empezar();
  const h = '2026-12-22', c0 = F.cuenta(cs, 'master');
  // El banco cerró el 18 dic e incluyó un cargo de $100 que no se anotó
  const ex0 = F.extractoMaster(Object.assign({}, c0, { proximo_cierre: '2026-12-18' }), movsDic, '2026-12-18', h);
  const uti = F.utilizadoAl(c0, movsDic, '2026-12-18');
  cs = F.aplicar('cuentas.json', cs, { id: 'k1', tipo: 'cerrarFacturacion', fact: { mes: '2026-12', desde: '2026-11-21', hasta: '2026-12-18', pagar_hasta: '2027-01-05', facturado: ex0.calculado + 100, utilizado: uti + 100, calculado: ex0.calculado } });
  const c = F.cuenta(cs, 'master');
  assert.deepEqual(c.deuda_inicial, { monto: uti + 100, fecha: '2026-12-19' });
  const dic = F.extractoMaster(c, movsDic, '2026-12-18', h);
  assert.deepEqual([dic.cerrada, dic.total, dic.diferencia], [true, ex0.calculado + 100, 100]);
  const m = F.estadoCuentas(cs, movsDic, h).master;
  assert.deepEqual([m.enCurso.desde, m.enCurso.hasta, m.porPagar.facturado, m.porPagar.falta], ['2026-12-19', '2027-01-18', ex0.calculado + 100, ex0.calculado + 100]);
  assert.deepEqual(m.extracto.cuotas.filas.map((x) => x.comercio + ' ' + x.cuota + '/' + x.de), ['Tienda 2/3', 'Colegio 2/3', 'Muebles 1/3']);
  assert.equal(m.extracto.anterior, ex0.calculado + 100);
  assert.equal(m.cuotasPendiente, 2 * 30000 + (33333 + 33334) + 60000);   // Tienda y Colegio 2 y 3 (la última ajusta), Muebles entera
  assert.ok(F.avisos(F.estadoCuentas(cs, movsDic, '2026-12-30'), F.estadoPagos({}), '2026-12-30').some((x) => /^Pagar Master hasta el 5 ene/.test(x.texto)));
  // Reabrir: vuelve la partida anterior y el cierre queda como próximo cierre
  cs = F.aplicar('cuentas.json', cs, { id: 'k2', tipo: 'reabrirFacturacion', hasta: '2026-12-18' });
  const c2 = F.cuenta(cs, 'master');
  assert.deepEqual([c2.facturaciones.length, c2.deuda_inicial.monto, c2.proximo_cierre], [1, 241166, '2026-12-18']);
  // El estado de cuenta con que se empezó no se puede reabrir
  cs = F.aplicar('cuentas.json', cs, { id: 'k3', tipo: 'reabrirFacturacion', hasta: '2026-11-20' });
  assert.equal(F.cuenta(cs, 'master').facturaciones.length, 1);
  // El respaldo de la app Master antigua no reemplaza el inicio
  cs = F.aplicar('cuentas.json', cs, { id: 'k4', tipo: 'ajustesCuenta', cuenta: 'master', soloSinInicio: true, valores: { deuda_inicial: { monto: 1, fecha: '2026-01-01' }, cupo: 5 } });
  assert.equal(F.cuenta(cs, 'master').cupo, 1000000);
});

test('Master: cuotas como el banco, primera cuota y cierres estimados', () => {
  assert.deepEqual([1, 2, 3].map((k) => F.valorCuota({ monto: 200000, n: 3 }, k)), [66667, 66667, 66666]);
  assert.deepEqual([1, 3].map((k) => F.valorCuota({ monto: 88004, n: 3 }, k)), [29335, 29334]);
  assert.equal(F.valorCuota({ monto: 498460, n: 6, valor: 86326 }, 6), 86326);           // con interés: el valor anotado
  const { cs } = empezar(), c = F.cuenta(cs, 'master');
  // La facturación de una fecha y la primera cuota por omisión (la siguiente)
  assert.deepEqual(['2026-11-20', '2026-11-21', '2026-12-20', '2026-12-21'].map((d) => F.mesDeFacturacion(c, d)), ['2026-11', '2026-12', '2026-12', '2027-01']);
  assert.equal(F.primeraPorDefecto(c, '2026-12-21'), '2027-02');
  // Una compra en cuotas con la primera cuota elegida por el usuario
  const q = F.comprasEnCuotas(c, [{ id: 'x', cuenta: 'master', fecha: '2026-11-22', comercio: 'X', monto: 30000, tipo: 'compra', cuotas: 3, primera: '2026-12' }]).find((y) => y.id === 'x');
  assert.equal(q.primera, '2026-12');
  // La versión anterior guardaba «prox» con la facturación de la compra: se usa la siguiente
  const v = F.comprasEnCuotas(c, [{ id: 'y', cuenta: 'master', fecha: '2026-11-22', comercio: 'Y', monto: 30000, tipo: 'compra', cuotas: 3, prox: '2026-11' }]).find((y) => y.id === 'y');
  assert.equal(v.primera, '2027-01');
  // Cierre estimado el mismo día del último cierre; con un próximo cierre indicado, ese
  const l = F.facturaciones(Object.assign({}, c, { proximo_cierre: '2026-12-22' }), '2027-03-01');
  assert.deepEqual(l.map((p) => p.desde + '…' + p.hasta), ['2026-10-23…2026-11-20', '2026-11-21…2026-12-22', '2026-12-23…2027-01-20', '2027-01-21…2027-02-20', '2027-02-21…2027-03-20']);
  assert.equal(F.mismoDia('2027-01-31', 1, 31), '2027-02-28');
  // Titular o Adicional: lo elegido o la terminación del aviso; nunca en una compra en cuotas
  assert.equal(F.tarjetaDe({ cuenta: 'master', tipo: 'compra', terminacion: '4526' }, c), 'Adicional');
  assert.equal(F.tarjetaDe({ cuenta: 'master', tipo: 'compra', terminacion: '4526', titular: 'Titular' }, c), 'Titular');
  assert.equal(F.tarjetaDe({ cuenta: 'master', tipo: 'compra' }, c), 'Titular');
  assert.equal(F.tarjetaDe({ cuenta: 'master', tipo: 'compra', titular: 'Adicional', cuotas: 3 }, c), '');
  assert.equal(F.tarjetaDe({ cuenta: 'master', tipo: 'pago' }, c), '');
  assert.equal(F.signo({ tipo: 'pago' }), 1);
});

test('LiderBCI: total del periodo, puntos por comercio y cierre del periodo', () => {
  const r = F.leerRespaldo(JSON.stringify({ v: 2, compras: [
    { id: '1', date: '2026-11-02', store: 'Lider Express Ñuñoa', amount: 18450 },
    { id: '2', date: '2026-11-03', store: 'Jumbo Costanera', amount: 30000 },
    { id: '3', date: '2026-11-04', store: 'Farmacia', amount: 9990 },
    { id: '4', date: '2026-11-05', store: 'Lider', amount: 5000, kind: 'devolucion' },
    { id: '5', date: '2026-11-06', store: 'Pago', amount: 10000, kind: 'abono' },
  ], puntos: [{ id: 'c1', type: 'cierre', date: '2026-10-25', pts: 1200 }, { id: 'k1', type: 'canje', date: '2026-10-30', pts: -500 }] }));
  let a = aplicarTodos(r, {});
  let E = F.estadoCuentas(a['cuentas.json'], movsDe(a), '2026-11-24');
  assert.equal(E.liderbci.total, 18450 + 30000 + 9990 - 5000 - 10000);
  assert.equal(E.liderbci.puntosPeriodo, 1107 + 0 + 99 - 300);
  assert.equal(E.liderbci.puntos, 906 + 1200 - 500);
  a['cuentas.json'] = F.aplicar('cuentas.json', a['cuentas.json'], { id: 'cp', tipo: 'cerrarPeriodo', desde: '2026-11-25', pts: E.liderbci.puntosPeriodo, fecha: '2026-11-24', idMov: 'pc' });
  E = F.estadoCuentas(a['cuentas.json'], movsDe(a), '2026-11-25');
  assert.deepEqual([E.liderbci.total, E.liderbci.puntos], [0, 1606]);
});

test('Copec: saldo, devolución de un aviso y twin con el id del lector', () => {
  const r = F.leerRespaldo(JSON.stringify({ app: 'copec', v: 1, cuenta: { amount: 20000, at: '2026-11-20T00:00' }, movimientos: [
    { id: 'u', type: 'c', date: '2026-11-21', time: '06:10', desc: 'Carga bip!', amount: 5000, src: 'mail', key: 'OP845067|5000' },
    { id: 'v', type: 'd', date: '2026-11-22', time: '10:00', desc: 'Anulación · Comercio', amount: 1000, src: 'mail', key: 'AN123|1000' },
    { id: 'w', type: 'd', date: '2026-11-23', time: '12:00', desc: 'Carga desde FAN', amount: 30000, src: 'manual' },
  ] }));
  const a = aplicarTodos(r, {});
  const E = F.estadoCuentas(a['cuentas.json'], movsDe(a), '2026-11-24');
  assert.equal(E.copec.saldo, 20000 - 5000 + 1000 + 30000);
  assert.deepEqual(movsDe(a).map((m) => m.tipo).sort(), ['abono', 'compra', 'devolucion']);
  assert.ok(movsDe(a).some((m) => m.id === 'copec|OP845067|5000|'));
});

test('Pagos del mes: respaldo, marcar y mes nuevo', () => {
  const r = F.leerRespaldo(JSON.stringify({ v: 1, title: 'Noviembre 2026', sections: [
    { id: 'a', name: 'A inicios de mes', items: [{ id: 'p1', text: 'Arriendo', done: true, at: '2026-11-02' }, { id: 'p2', text: 'Luz', done: false }] },
    { id: 'b', name: 'A mitad de mes', items: [{ id: 'p3', text: 'Regalo', done: false, once: true }] },
  ], history: [] }));
  let p = F.aplicar('pagos.json', null, r.cambios[0].cambio);
  assert.deepEqual(F.estadoPagos(p).hechos, 1);
  p = F.aplicar('pagos.json', p, { id: 'h', tipo: 'pagoHecho', seccion: 'sa', idPago: 'pp2', hecho: true, fecha: '2026-11-24' });
  assert.equal(F.estadoPagos(p).hechos, 2);
  p = F.aplicar('pagos.json', p, { id: 'n', tipo: 'mesNuevo', titulo: 'Diciembre 2026', fecha: '2026-12-01' });
  const e = F.estadoPagos(p);
  assert.deepEqual([p.titulo, e.total, e.hechos, p.historial[0].pagos.length], ['Diciembre 2026', 2, 0, 3]);
  const av = F.avisos(F.estadoCuentas(F.PLANTILLAS['cuentas.json'], [], '2026-12-08'), F.estadoPagos(Object.assign({}, p)), '2026-12-08');
  assert.ok(av.some((x) => x.texto === 'Faltan 2 pagos del mes'));
});

test('Movimientos: agregar, editar y borrar por id, en orden del más nuevo al más antiguo', () => {
  let l = [];
  l = F.aplicar('movimientos/2026-11.json', l, { tipo: 'movimiento', mov: { id: 'a', cuenta: 'fan', fecha: '2026-11-01', hora: '10:00', monto: 1, tipo: 'compra' } });
  l = F.aplicar('movimientos/2026-11.json', l, { tipo: 'movimiento', mov: { id: 'b', cuenta: 'fan', fecha: '2026-11-03', hora: '', monto: 2, tipo: 'compra' } });
  l = F.aplicar('movimientos/2026-11.json', l, { tipo: 'movimiento', mov: { id: 'a', cuenta: 'fan', fecha: '2026-11-01', hora: '10:00', monto: 5, tipo: 'compra' } });
  assert.deepEqual(l.map((m) => m.id + m.monto), ['b2', 'a5']);
  l = F.aplicar('movimientos/2026-11.json', l, { tipo: 'borrarMovimiento', idMov: 'b' });
  assert.equal(l.length, 1);
});

test('Mesadas: respaldo, totales por hija y del mes', () => {
  const r = F.leerRespaldo(JSON.stringify([
    { id: 'a1', who: 'piti', amount: 10000, subject: 'Almuerzo', date: '2026-11-03', ts: 1 },
    { id: 'a2', who: 'emi', amount: 15000, subject: 'Ropa', date: '2026-11-10', ts: 2 },
    { id: 'a3', who: 'piti', amount: 5000, subject: 'Almuerzo', date: '2026-10-20', ts: 3 },
  ]));
  assert.equal(r.app, 'mesadas');
  const m = F.aplicar('mesadas.json', null, r.cambios[0].cambio);
  const e = F.estadoMesadas(m, '2026-11-24');
  assert.deepEqual([e.por.Piti.total, e.por.Piti.mes, e.por.Emi.mes, e.mes, e.total], [15000, 10000, 15000, 25000, 30000]);
  assert.equal(e.sugerencias[0], 'Almuerzo');
});

// ---- Cálculo de la app Mis créditos, copiado sin cambios (repo pablocarvallo/mis-creditos), para comparar ----
const MC = (() => {
  const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
  const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
  const RED_CREDITO = 10000;
  function tasaMensual(c){ const t = num(c.tasa) / 100; return c.tasaTipo === 'anual' ? t / 12 : t; }
  function factorVP(i, d){ if (d <= 0) return 0; if (i === 0) return d; const f = Math.pow(1 + i, d); return (f - 1) / (i * f); }
  function exacto(c, i, k){ const d = c.plazo - k; if (d <= 0) return 0; return Math.max(0, c.cuota * factorVP(i, d) + c.ajuste); }
  function redondear(v, mon){ return mon === 'UF' ? Math.round(v * 100) / 100 : RED_CREDITO * Math.round(v / RED_CREDITO); }
  function calc(c){
    const n = c.plazo, i = tasaMensual(c), k = Math.min(n, c.pagadasInicial + c.pagos.length), rem = n - k;
    const vp = c.cuota * factorVP(i, rem);
    const saldo = redondear(exacto(c, i, k), c.moneda), inicial = redondear(exacto(c, i, 0), c.moneda);
    return { k, rem, saldo, inicial, porPagar: c.cuota * rem, pct: inicial > 0 ? limitar((inicial - saldo) / inicial, 0, 1) : k / n };
  }
  const aB64 = t => { const b = new TextEncoder().encode(t); let bin = ''; for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const huella = t => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
  const codigo = (creditos) => { const cuerpo = aB64(JSON.stringify({ v: 1, creditos })); return 'MC1:' + cuerpo + '.' + huella(cuerpo); };
  return { calc, codigo };
})();

test('Mis créditos: el código MC1 se lee y los saldos coinciden con la app Mis créditos', () => {
  const viejos = [
    { nombre: 'Consumo Banco', tipo: 'consumo', moneda: 'CLP', cuota: 187432, plazo: 36, tasa: 1.49, tasaTipo: 'mensual', ajuste: 0, pagadasInicial: 10, pagos: [{ fecha: '2026-10-05' }, { fecha: '2026-11-05' }], montoInicial: 0, pendienteBase: 0, abonos: [], creado: 1700000000000 },
    { nombre: 'Auto', tipo: 'consumo', moneda: 'CLP', cuota: 245000, plazo: 48, tasa: 15.6, tasaTipo: 'anual', ajuste: -3500, pagadasInicial: 40, pagos: [], montoInicial: 0, pendienteBase: 0, abonos: [], creado: 1700000000001 },
    { nombre: 'Hipotecario', tipo: 'hipotecario', moneda: 'UF', cuota: 18.34567, plazo: 240, tasa: 4.1, tasaTipo: 'anual', ajuste: 0, pagadasInicial: 60, pagos: [{ fecha: '2026-11-01' }], montoInicial: 0, pendienteBase: 0, abonos: [], creado: 1700000000002 },
    { nombre: 'Préstamo familiar', tipo: 'abonos', moneda: 'CLP', cuota: 0, plazo: 1, tasa: 0, tasaTipo: 'mensual', ajuste: 0, pagadasInicial: 0, pagos: [], montoInicial: 1000000, pendienteBase: 800000, abonos: [{ fecha: '2026-11-01', monto: 100000 }], creado: 1700000000003 },
  ];
  const r = F.leerRespaldo(MC.codigo(viejos));
  assert.equal(r.app, 'creditos');
  const cr = F.aplicar('creditos.json', null, r.cambios[0].cambio);
  const E = F.estadoCreditos(cr, '2026-11-24');
  viejos.slice(0, 3).forEach((v, i) => {
    const a = MC.calc(v), b = E.lista[i].e;
    assert.deepEqual([b.k, b.rem, b.saldo, b.inicial, b.porPagar, b.pct], [a.k, a.rem, a.saldo, a.inicial, a.porPagar, a.pct], v.nombre);
  });
  assert.deepEqual([E.lista[3].e.saldo, E.lista[3].e.pagado], [700000, 300000]);
  assert.equal(E.total.n, 2);
  assert.equal(E.total.cuotasMes, 187432 + 245000);
  assert.equal(E.total.saldo % 100000, 0);
  assert.match(F.leerRespaldo('MC1:abc.def').error, /incompleto/);
});

test('Mis créditos: pagar una cuota, deshacer y abonar', () => {
  let cr = F.aplicar('creditos.json', null, { id: 'c', tipo: 'credito', credito: { id: 'x', nombre: 'X', tipo: 'consumo', moneda: 'CLP', cuota: 100000, plazo: 3, tasa: 0, tasa_tipo: 'mensual', ajuste: 0, pagadas_inicial: 1, pagos: [], creado: 1 } });
  cr = F.aplicar('creditos.json', cr, { id: 'p1', tipo: 'pagoCuota', idCredito: 'x', fecha: '2026-11-24' });
  cr = F.aplicar('creditos.json', cr, { id: 'p2', tipo: 'pagoCuota', idCredito: 'x', fecha: '2026-12-24' });
  cr = F.aplicar('creditos.json', cr, { id: 'p3', tipo: 'pagoCuota', idCredito: 'x', fecha: '2027-01-24' });   // ya no quedan cuotas
  assert.equal(cr.creditos[0].pagos.length, 2);
  assert.equal(F.estadoCredito(cr.creditos[0], '2026-12-30').rem, 0);
  cr = F.aplicar('creditos.json', cr, { id: 'd', tipo: 'deshacerPago', idCredito: 'x' });
  assert.equal(F.estadoCredito(cr.creditos[0], '2026-12-30').rem, 1);
});

test('Respaldos que no son de Finanzas', () => {
  assert.match(F.leerRespaldo('{"v":1,"cases":[],"items":[]}').error, /Casa/);
  assert.ok(F.leerRespaldo('hola').error);
});
