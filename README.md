# Finanzas

App de dinero del plan de 5 apps (pablocarvallo/casa → plan/plan-5-apps.md), con el diseño Domésticas 27. Publicada en
**https://pablocarvallo.github.io/finanzas/**. Convive un mes con FAN, Master, LiderBCI, Copec, Pagos del mes, Mesadas y
Mis créditos.

## Pestañas

- **Resumen**: gastado en el mes (cuentas, tarjetas y mesadas), avisos, las cuatro cuentas, mesadas y créditos, y los
  últimos movimientos. Desde ahí se abren Mesadas y Mis créditos.
- **Cuentas**: FAN, Master, LiderBCI y Copec con su saldo, utilizado o total del periodo, movimientos por mes, cuotas por
  cobrar (Master) y puntos (LiderBCI: al tocar «Puntos» en el recuadro se abre su detalle, con canjes y ajustes). Se
  anotan movimientos a mano y se ajusta el punto de partida.
- **Pagos**: pagos del mes en dos secciones, mes nuevo e historial.
- **Mesadas**: aportes a Piti y Emi con su asunto, totales por hija y del mes, historial.
- **Mis créditos**: consumo, hipotecario (UF) y deudas con abonos; pagos de cuota, abonos, saldo y término estimado.
- **Ajustes**: conexión, traer datos de las apps antiguas, apariencia y respaldo.

Gastos médicos queda fuera de Finanzas: es una app independiente (pablocarvallo/cigna), por decisión del 24 nov 2026.

## Datos

En el repositorio privado pablocarvallo/datos, a través de domesticas-api con la llave de cada iPhone:

- `cuentas.json`: punto de partida de cada cuenta (`saldo_inicial` de FAN y Copec con fecha y hora, `deuda_inicial` y
  `cupo` de Master, `periodo_desde` y `puntos_movimientos` de LiderBCI) y la terminación de la cuenta FAN.
- `movimientos/AAAA-MM.json`: los movimientos del mes. Los avisos del banco y de Copec llegan solos (tarea «Leer avisos»);
  la app agrega los anotados a mano. Un movimiento de aviso tiene el id del lector (`fan|…`, `master|…`, `copec|…`), así
  el mismo movimiento traído de un respaldo antiguo no se repite.
- `pagos.json`: secciones con sus pagos, título del mes e historial.
- `mesadas.json`: aportes `{ id, hija, monto, asunto, fecha, registrado }`.
- `creditos.json`: créditos con sus pagos de cuota y abonos (mismos campos de la app Mis créditos, en minúsculas con «_»).

Cada registro es un cambio (`calculos.js` → `aplicar`) que se ve al tiro y espera en el iPhone hasta guardarse; si otro
dispositivo o la tarea de avisos guardó antes, la app vuelve a leer y aplica de nuevo.

## Reglas

Las de las apps antiguas (pruebas en `pruebas/calculos.test.js`):

- FAN y Copec: saldo ajustado + entradas − salidas desde ese momento. FAN sigue una sola cuenta (su terminación).
- Master: utilizado de partida + compras, cargos y cuotas por cobrar − abonos, desde ese día. Las compras en cuotas ocupan
  todo su monto; cada cuota se cobra en la facturación de su mes (cierra el día 22).
- LiderBCI: compras − abonos y devoluciones del periodo; puntos 6 % Lider, 0 % Jumbo, Unimarc, Tottus, Santa Isabel, El 9
  y Don Salva, 1 % el resto; «Cerrar periodo» guarda los puntos.
- Pagos: avisa los pendientes de inicio de mes desde el día 5 y los de mitad de mes desde el 20.
- Mesadas: lo entregado en el mes se suma a lo gastado en el Resumen.
- Mis créditos: saldo = valor presente de las cuotas que faltan + ajuste, redondeado a $10.000 (total de consumo a
  $100.000); hipotecario en UF, fuera del total; deudas con abonos = pendiente − abonos.

`resumen.json` (widgets) usa los mismos cálculos: `herramientas/finanzas-calculos.mjs` en pablocarvallo/datos es una copia
de `calculos.js`; actualizarla al cambiar las reglas.

## Mantener

- Diseño: `python3 ../casa/herramientas/aplicar-diseno27.py index.html` copia `casa/diseno27/` entre las marcas `D27`.
- Pruebas: `TZ=America/Santiago node --test pruebas/*.test.js`.
- Al publicar, subir `VERSION` en `calculos.js` (y `CACHE` en `sw.js`): la app se recarga sola al abrirse.
