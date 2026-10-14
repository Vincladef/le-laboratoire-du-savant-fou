import { describe, expect, it } from 'vitest';
import { assertDatabaseTarget, assertMigrationHistory } from '../scripts/deployment-guards';

describe('Garde-fous de migration distante', () => {
  const migrations = [{ hash: 'known-hash', folderMillis: 123 }];
  it('autorise une base neuve et une réexécution idempotente', () => {
    expect(assertMigrationHistory(false, [], migrations)).toBe(1);
    expect(
      assertMigrationHistory(true, [{ hash: 'known-hash', created_at: '123' }], migrations),
    ).toBe(0);
  });
  it('refuse tout schéma existant sans journal et les journaux étrangers', () => {
    expect(() => assertMigrationHistory(true, [], migrations)).toThrow();
    expect(() =>
      assertMigrationHistory(false, [{ hash: 'known-hash', created_at: 123 }], migrations),
    ).toThrow();
    expect(() =>
      assertMigrationHistory(true, [{ hash: 'another-project', created_at: 123 }], migrations),
    ).toThrow();
  });
  it('exige la correspondance exacte du serveur et de la base autorisés', () => {
    expect(() =>
      assertDatabaseTarget('postgresql://user:password@db.example/lab', 'db.example', 'lab'),
    ).not.toThrow();
    expect(() =>
      assertDatabaseTarget('postgresql://user:password@db.example/other', 'db.example', 'lab'),
    ).toThrow();
    expect(() =>
      assertDatabaseTarget('postgresql://user:password@other.example/lab', 'db.example', 'lab'),
    ).toThrow();
    expect(() => assertDatabaseTarget('postgresql://user:password@db.example/lab')).toThrow();
  });
});
