// the smallest thing that counts passes and fails and prints them readably.
const state = {pass: 0, fail: 0, skip: 0, failures: []};

const C = process.stdout.isTTY
  ? {ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[90m', warn: '\x1b[33m', off: '\x1b[0m'}
  : {ok: '', bad: '', dim: '', warn: '', off: ''};

function group(name) { console.log(`\n${name}`); }

// `detail` shows up next to the result, so put the measured value in it - a test that only says
// "failed" makes you re-run it by hand to find out what happened.
function ok(cond, name, detail) {
  const line = detail == null ? '' : ` ${C.dim}${detail}${C.off}`;
  if (cond === true) { state.pass++; console.log(`  ${C.ok}pass${C.off} ${name}${line}`); return true; }
  state.fail++;
  state.failures.push(name);
  // a check may hand back a string instead of `true` to say what went wrong
  const why = typeof cond === 'string' ? cond : (detail == null ? '' : detail);
  console.log(`  ${C.bad}FAIL${C.off} ${name}${why ? ' ' + C.bad + why + C.off : ''}`);
  return false;
}

function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  return ok(a === e || `expected ${e}, got ${a}`, name, a === e ? a : null);
}

function skip(name, why) {
  state.skip++;
  console.log(`  ${C.warn}skip${C.off} ${name} ${C.dim}${why}${C.off}`);
}

// something true today that we are not asserting as desirable - a documented limitation. printed
// so a change in it is visible, without pinning it down as expected behaviour.
function note(text) { console.log(`  ${C.dim}note ${text}${C.off}`); }

function summary() {
  console.log(`\n${state.fail ? C.bad : C.ok}${state.pass} passed, ${state.fail} failed${
    state.skip ? `, ${state.skip} skipped` : ''}${C.off}`);
  if (state.fail) console.log(state.failures.map(f => `  - ${f}`).join('\n'));
  return state.fail === 0;
}

module.exports = {group, ok, eq, skip, note, summary, state};
