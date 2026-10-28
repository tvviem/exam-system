import 'reflect-metadata';
import { loadDotenvFile } from '../config/env';
import { runCli } from './run-cli';

loadDotenvFile();
runCli(process.argv.slice(2), process.env).then(
  (result) => {
    if (result.output) console.log(result.output);
    process.exit(result.exitCode);
  },
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
