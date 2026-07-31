/**
 * Offline checks for the parts that need no network: pool parsing and the
 * weighted draw. Everything else (Shopify validation, Klaviyo, KV) needs the
 * deployed Worker — see the curl script in README.md.
 */
import fs from 'node:fs';

const toml = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const raw = toml.match(/LOTTO_POOL = '''([\s\S]*?)'''/)[1];
const POOL = JSON.parse(raw);

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};

check('pool parses', Array.isArray(POOL));
check('six prizes', POOL.length === 6, `got ${POOL.length}`);
check('every prize has a code', POOL.every((p) => p.code));
check('every prize has a description', POOL.every((p) => p.description));
check('weights sum to 100', POOL.reduce((s, p) => s + p.weight, 0) === 100,
  `sum ${POOL.reduce((s, p) => s + p.weight, 0)}`);

const CODES = ['NON15', 'FREESTOPPER', 'FREEPOUR', 'ONEONUS', 'NON10', 'THEHOUSE'];
check('codes match the ones created in Shopify',
  CODES.every((c) => POOL.some((p) => p.code === c)));

function drawWeighted(pool) {
  const total = pool.reduce((s, p) => s + Number(p.weight), 0);
  let r = Math.random() * total;
  for (const prize of pool) { r -= Number(prize.weight); if (r < 0) return prize; }
  return pool[pool.length - 1];
}

/* Does the draw actually honour the published odds? 200k draws, allow 1.5pp. */
const N = 200000, tally = {};
for (let i = 0; i < N; i++) { const p = drawWeighted(POOL); tally[p.code] = (tally[p.code] || 0) + 1; }
console.log('\nobserved vs published, over ' + N.toLocaleString() + ' draws:');
for (const p of POOL) {
  const pct = (tally[p.code] / N) * 100;
  const drift = Math.abs(pct - p.weight);
  check(`  ${p.code.padEnd(12)} ${pct.toFixed(2)}% vs ${p.weight}%`, drift < 1.5, `drift ${drift.toFixed(2)}pp`);
}

/* A dead code must be skippable without breaking the remaining odds. */
const minusOne = POOL.filter((p) => p.code !== 'NON15');
const t2 = {};
for (let i = 0; i < 50000; i++) { const p = drawWeighted(minusOne); t2[p.code] = (t2[p.code] || 0) + 1; }
check('draw still works with a code removed', Object.keys(t2).length === 5 && !t2.NON15);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
console.log('\nemail gate:');
for (const [addr, want] of [['a@b.co', true], ['aaron@non.world', true], ['', false],
                            ['nope', false], ['a@b', false], ['a b@c.com', false]]) {
  check(`  ${JSON.stringify(addr).padEnd(20)} -> ${want ? 'accept' : 'reject'}`, EMAIL_RE.test(addr) === want);
}

console.log(failed ? `\n${failed} failing` : '\nall passing');
process.exit(failed ? 1 : 0);
