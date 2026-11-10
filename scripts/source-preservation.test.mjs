import test from "node:test";
import assert from "node:assert/strict";
import { shouldRemoveUnmatchedSourceItem } from "./source-preservation.mjs";

test("missing source match alone never authorizes deleting a catalog item", () => {
  assert.equal(shouldRemoveUnmatchedSourceItem(), false);
  assert.equal(shouldRemoveUnmatchedSourceItem({ explicitDeletionConfirmed: false }), false);
});

test("deletion requires an explicit authoritative deletion confirmation", () => {
  assert.equal(shouldRemoveUnmatchedSourceItem({ explicitDeletionConfirmed: true }), true);
});
