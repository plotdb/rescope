 - support different scoping approaches, e.g., 
   - import ( ESModule )
   - commonjs ( via require )
 - 規格化 JS 模組的 dependencies 後設資料 ( 類似 @plotdb/block 的 dependencies, but for js ):
   讓被載入的 lib 以如 `x.pkg.dependencies = [{name, version, path}, ...]` 宣告其依賴,
   rescope 可據以遞迴載入/驗證. 需求來源: browser-shell 專案的兩層式打包
   ( ~/ai/2026/0809-stackblitz context/project/plan.md 「模組化與演化路線」)
