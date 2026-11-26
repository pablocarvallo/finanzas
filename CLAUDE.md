# Finanzas

App de dinero del plan de 5 apps. Ver README.md; el plan y el catálogo están en pablocarvallo/casa (plan/plan-5-apps.md y
ecosistema.json); los datos, en el repositorio privado pablocarvallo/datos.

- Una sola página (`index.html`) más `calculos.js` y `excel.js` (el .xlsx del extracto de Master), sin pantalla y con
  pruebas. Sin dependencias externas.
- Diseño Domésticas 27: los bloques `D27:TOKENS`, `D27:COMP` y `D27:SKINS` (este último al final, después de APP) se
  copian desde `casa/diseno27/` con `casa/herramientas/aplicar-diseno27.py`; lo propio de la app va entre
  `/*APP:START*/` y `/*APP:END*/`. Los skins (Ajustes → Apariencia → Skin, `<html data-skin>`) solo cambian el aspecto.
- Todo cambio de reglas va con su prueba en `pruebas/` (`TZ=America/Santiago node --test pruebas/*.test.js`) y se copia a
  `datos/herramientas/finanzas-calculos.mjs`.
- Al publicar, subir `VERSION` en `calculos.js` y `CACHE` en `sw.js`.
- Textos y mensajes de commit en español latino neutro.
