export function shouldRemoveUnmatchedSourceItem({ explicitDeletionConfirmed = false } = {}) {
  return explicitDeletionConfirmed === true;
}
