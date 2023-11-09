#!/usr/bin/env sh
# The github build action uses the official nodejs container does not have bash
# so this script must be POSIX sh compliant

set -e
cd "$(dirname "$0")/.."
PATH=$PWD/node_modules/.bin:$PATH
export LOGFORMAT=cli

main() {
  prettier --check src public
  eslint src public
  tsup
}

main "$@"
