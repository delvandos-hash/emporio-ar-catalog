import test from "node:test";
import assert from "node:assert/strict";
import { resolveLegacyStockMatch } from "./legacy-restore-identity.mjs";

const row = (public_id, foto) => ({ publicItem: { public_id, foto }, item: {} });

test("resolve variante pelo public_id quando stock_ref é compartilhado", () => {
  const a=row("p_a","foto-a"), b=row("p_b","foto-b");
  assert.equal(resolveLegacyStockMatch([a,b],[a,b],{public_id:"p_b",foto:"foto-b"}),b);
});
test("resolve variante pela identidade e fotografia quando public_id não coincide", () => {
  const a=row("p_a","foto-a"), b=row("p_b","foto-b");
  assert.equal(resolveLegacyStockMatch([a,b],[a,b],{public_id:"legacy",foto:"foto-b"}),b);
});
test("não escolhe variante quando a correspondência continua ambígua", () => {
  const a=row("p_a","foto-igual"), b=row("p_b","foto-igual");
  assert.equal(resolveLegacyStockMatch([a,b],[a,b],{public_id:"legacy",foto:"foto-igual"}),null);
});

test("resolve identidade única mesmo quando não existe stock_ref", () => {
  const a=row("p_a","foto-a");
  assert.equal(resolveLegacyStockMatch([],[a],{public_id:"legacy",foto:"foto-a"}),a);
});
