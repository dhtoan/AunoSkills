# AunoSkills CLI

`apps/cli` contains argument parsing, human/JSON rendering, and command routing. Business logic belongs in `packages/core`; the CLI should remain a thin consumer of public core APIs.

The published `aunoskills` package is assembled from the repository root and executes compiled output from `dist/apps/cli/src` through `bin/aunoskills.mjs`.
