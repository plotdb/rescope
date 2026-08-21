// runs inside a scope and reports what it can see of the host page.
probe = {
  seesHostVar: typeof hostVar !== "undefined",
  seesHostMarked: typeof marked !== "undefined" && String(marked).indexOf("HOST MARKED") >= 0,
  parentIsProxy: window.parent === window,
  hasDocument: typeof document === "object" && !!document.createElement,
  objectIdentity: window.Object === Object,
  windowIsSelf: window === globalThis && window === self
};
