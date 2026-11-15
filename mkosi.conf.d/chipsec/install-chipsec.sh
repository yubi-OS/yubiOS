#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-2.1-or-later
# Install CHIPSEC for yubiOS first-boot firmware validation (ADR-024).
set -euo pipefail

python3 -m pip install --no-cache-dir --break-system-packages --require-hashes \
  'chipsec==1.13.16' \
  --hash=sha256:63bed5ad4224402397817ea82b94c3a21736386a04ff778c003704bd6dfdbca3 # chipsec 1.13.16

command -v chipsec_main.py >/dev/null
command -v chipsec_util.py >/dev/null
chipsec_main.py --help >/dev/null 2>&1 || true

echo "install-chipsec: CHIPSEC 1.13.16 installed for yubiOS first-boot firmware validation"
