import test from "node:test";
import assert from "node:assert/strict";
import { shouldRemoveUnmatchedSourceItem, canMergeLegacyClothesClone } from "./source-preservation.mjs";

test("does not remove products when the source collection is incomplete", () => {
  assert.equal(shouldRemoveUnmatchedSourceItem(), false);
  assert.equal(shouldRemoveUnmatchedSourceItem({ sourceCollectionComplete: false, sourceEnabled: true }), false);
  assert.equal(shouldRemoveUnmatchedSourceItem({ sourceCollectionComplete: true, sourceEnabled: false }), false);
});

test("removes unmatched supplier products only after a complete active source collection", () => {
  assert.equal(shouldRemoveUnmatchedSourceItem({ sourceCollectionComplete: true, sourceEnabled: true }), true);
});


test("merges a legacy clothing clone only when supplier ID, name and volume are exact", () => {
  assert.equal(canMergeLegacyClothesClone({
    rootId: "franny-4196903",
    existingOriginId: "franny-4196903",
    sameName: true,
    sameVolume: true
  }), true);
  assert.equal(canMergeLegacyClothesClone({
    rootId: "franny-4196903",
    existingOriginId: "franny-4196904",
    sameName: true,
    sameVolume: true
  }), false);
  assert.equal(canMergeLegacyClothesClone({
    rootId: "franny-4196903",
    existingOriginId: "franny-4196903",
    sameName: false,
    sameVolume: true
  }), false);
  assert.equal(canMergeLegacyClothesClone({
    rootId: "franny-4196903",
    existingOriginId: "franny-4196903",
    sameName: true,
    sameVolume: false
  }), false);
});
