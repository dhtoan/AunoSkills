#!/usr/bin/env node
import { runCli } from '../dist/apps/cli/src/main.js';

process.exitCode = await runCli(process.argv.slice(2));
