Libraries that do not survive being scoped, and why. Load them from `/loader-tester/`.

 - **zingchart**: sets `window.ZC`, then reads `ZC`.
 - **visjs**: sets `window['...']` under names that are not legal variable names.
 - **highcharts**: reaches for `.prototype` of functions the proxy hands back bound.
 - **amcharts** ( `amcharts-core.js` ): asks the DOM where it was loaded from, to derive its
   webpack `publicPath`:

       i.p = (function(){ if (document.currentScript) return document.currentScript;
                          var t = document.getElementsByTagName("script"); return t[t.length-1] })().src

   Scoped code is never a script element of its own, so neither half of that answers:
   `document.currentScript` is null inside an `eval`, and with `delivery: 'script'` the blob script
   has finished long before the wrapper it defined is called. The fallback then reads whatever
   `<script>` happens to be last in the document - in the peek window that is *no* script at all
   ( `TypeError: cannot read 'src' of undefined` ), and in the host document it is usually the
   page's own inline script, whose `src` is `""` ( `TypeError: cannot read '1' of null`, from the
   regex on the empty string ). Not a regression from dropping the iframes: the same failure is
   there on `master`.

   There is a fix if we decide we want it, verified in a browser: park an inert
   `<script type="application/rescope-marker" src="<the library's url>">` in the document for the
   duration of the run ( and in the peek window ). An unknown `type` means the browser neither
   fetches nor executes it, but `.src` still reflects the absolute URL, so the
   `getElementsByTagName("script")` fallback finds the library's own URL - which is the right
   answer, and a better one than the host page's last script. With the marker in place amcharts
   loads and exports `am4core` in both `default` and `with` mode. It is a behaviour change for
   every library, though - anything scanning script tags would see it - so it needs a decision
   rather than a patch.
