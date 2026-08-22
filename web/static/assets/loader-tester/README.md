Libraries that do not survive being scoped, and why. Load them from `/loader-tester/`.

 - **zingchart**: sets `window.ZC`, then reads `ZC`.
 - **visjs**: sets `window['...']` under names that are not legal variable names.
 - **highcharts**: reaches for `.prototype` of functions the proxy hands back bound.
 - **amcharts** ( `amcharts-core.js` ): **solved as of v5.1.0.** It asks the DOM where it was
   loaded from, to derive its webpack `publicPath`:

       i.p = (function(){ if (document.currentScript) return document.currentScript;
                          var t = document.getElementsByTagName("script"); return t[t.length-1] })().src

   Scoped code used to be neither: `document.currentScript` is null inside an `eval`, and the
   fallback read whatever `<script>` happened to be last - no script at all in the peek window
   ( `cannot read 'src' of undefined` ), or the page's own inline script with an empty `src` in the
   host document ( `cannot read '1' of null` ). rescope now hands every library an inert
   `<script>` element carrying its own url and answers `currentScript` with it while it runs, so
   both halves of that expression answer correctly. It loads and exports `am4core` in `default`,
   `with` and `delivery: 'script'`. Load it with `scriptElement: false` to see the old failure.
   Why it works this way, and what it still does not fix: `doc/no-iframe.md`.
