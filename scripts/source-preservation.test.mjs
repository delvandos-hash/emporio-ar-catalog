import test from "node:test";
import assert from "node:assert/strict";
import { shouldRemoveUnmatchedSourceItem } from "./source-preservation.mjs";

test("does not remove products when the source collection is incomplete", () => {
  assert.equal(shouldRemoveUnmatchedSourceItem(), false);
  assert.equal(shouldRemoveUnmatchedSourceItem({ sourceCollectionComplete: false, sourceEnabled: true }), false);
  assert.equal(shouldRemoveUnmatchedSourceItem({ sourceCollectionComplete: true, sourceEnabled: false }), false);
});

test("removes unmatched supplier products only after a complete active source collection", () => {
  assert.equal(shouldRemoveUnmatchedSourceItem({ sourceCollectionComplete: true, sourceEnabled: true }), true);
});
