import { loadDatabaseUrl, loadDotenvFile } from '../config/env';
import { runMigrations } from './run-migrations';

async function main() {
  loadDotenvFile();
  await runMigrations(loadDatabaseUrl());
  console.log('Đã chạy xong migration.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
