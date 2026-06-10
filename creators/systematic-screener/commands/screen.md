---
description: Run a systematic screen, register it as a strategy, and forward-track its signals
argument-hint: "[screen, e.g. 'vcp large-cap tech']"
---

Load the `vcp-screen` skill. Run the screen, then:

1. Register the resulting strategy spec via the proof-engine ledger (hash-commit
   BEFORE emitting any signal).
2. Emit one forward signal per qualifying name.

If no criteria are given, ask the user for screen type and universe.
