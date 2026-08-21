 - support different scoping approaches, e.g., 
   - import ( ESModule )
   - commonjs ( via require )
 - finish dropping the iframes. steps 1-5 of `doc/no-iframe.md` are in as of v5.1.0; what is left
   is the ESModule path above, which removes the peek, the `eval` and the `with` in one move for
   libraries that ship ESM.
