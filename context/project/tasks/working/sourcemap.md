❯ 問個問題: rescope 包過的 js, 其 sourcemap ( 如 //# sourceMappingURL=purify.js.map ) 之指定,
  大概位置就會跑掉了對嗎？

⏺ 好問題，而且答案分成兩半 —— 一半是好的，一半確實會跑掉。

  會找到，也會抓對檔案

  //# sourceMappingURL=purify.js.map 是相對於該 script 的 URL 解析的。因為 rescope 在 wrapper 尾端補了 //#
  sourceURL=<library 的真實 url>，devtools 註冊的 script URL 就是 .../purify.js，所以 purify.js.map 會被解析成
  .../purify.js.map —— 位置是對的。（如果沒有 sourceURL，delivery: 'script' 下它會相對於 blob: URL
  解析，那才是徹底找不到。）

  而且那個註解本身也保得住：minified 檔常常結尾就是 //# sourceMappingURL=... 且沒有換行，rescope 會在 library
  程式碼後補一個換行才接自己的東西，否則整段會被吃進註解裡。

  但位置會跑掉，而且正是 minified 檔最嚴重

  source map 對應的是「產生檔的 (行, 欄) → 原始檔的 (行, 欄)」。經過 rescope 之後，產生檔不是 purify.js 而是
  wrapper：

  - 行號沒問題 —— wrapper 的 prologue 被硬性要求跟 library 的第一行同一行（這是 doc/no-iframe.md 裡那條
  invariant），所以 library 的第 N 行仍然是 wrapper 的第 N 行
  - 第 1 行的欄位全部平移 prologue 的長度

  而 minified 檔整個檔案就只有第 1 行。所  Jump to bottom: fn+↓ to scroll n 都偏掉了 —— 查 column C 會拿到「C 減去
  prologue 長度」那個位置的對應，指到錯的地方。

  多行的 library（有 map 但沒壓成一行）則只有第 1 行會錯，第 2 行以後完全正確。

  偏移量不是常數

  prologue 是 _wrap 依 library 的匯出名稱數量生成的（每個名字都有 var x;、__win['x']=...
  等等），所以名字越多、偏移越大。我們在 error line 那個 minified 樣本上實測過：plain script 報 column 38，經過
  rescope 是 column 333 —— 偏了 295。換 scope: 'with' 會小很多（prologue 只有 with(scope){），delivery: 'script'
  因為多一層 window[registry][id] = function(...) 又更大。

  要我把三種模式的實際偏移量各量一次給你嗎？那個數字是可以精確算出來的。

  如果要真的修

  概念上可行但不算小：抓下原始 map，把第 1 行所有 generated column 加上 prologue 長度、重新 VLQ 編碼，然後以 data
  URI 換掉 library 自己的 sourceMappingURL。因為偏移量在產生 wrapper 時就已知，這是純機械的轉換 —— 只是要動到 map
  的解析與再編碼。

  目前這件事在文件裡只寫了「map 會解析到正確的 URL」，沒有寫欄位會偏。不管修不修，這一條都該補進 doc/no-iframe.md
  和 README 的 Stack Traces 那節。要我先補文件嗎？
