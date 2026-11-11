export function shouldRemoveUnmatchedSourceItem({ sourceCollectionComplete = false, sourceEnabled = true } = {}) {
  // Ausência só prova exclusão depois de coletar integralmente a fonte ativa.
  return sourceCollectionComplete === true && sourceEnabled === true;
}
