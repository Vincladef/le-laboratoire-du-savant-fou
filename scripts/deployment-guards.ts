type Migration = { hash: string; folderMillis: number };
type Applied = { hash: string; created_at: string | number };

export function assertMigrationHistory(labExists: boolean, applied: Applied[], local: Migration[]) {
  if (labExists && applied.length === 0)
    throw new Error('Le schéma lab existe sans journal reconnu : aucune migration automatique.');
  if (!labExists && applied.length > 0)
    throw new Error(
      'Le journal existe mais le schéma lab est absent : inspection manuelle requise.',
    );
  for (const [index, row] of applied.entries()) {
    if (local[index]?.hash !== row.hash || local[index]?.folderMillis !== Number(row.created_at))
      throw new Error('Journal inconnu ou modifié : aucune migration automatique.');
  }
  return local.length - applied.length;
}

export function assertDatabaseTarget(
  connectionString: string,
  expectedHost?: string,
  expectedName?: string,
) {
  if (!expectedHost || !expectedName) throw new Error('Identité attendue de la base obligatoire.');
  const url = new URL(connectionString);
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    url.hostname !== expectedHost ||
    decodeURIComponent(url.pathname.slice(1)) !== expectedName
  )
    throw new Error('La connexion ne correspond pas à la base explicitement autorisée.');
}
