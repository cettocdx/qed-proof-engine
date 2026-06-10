---
description: Build an earnings/fundamental thesis, register it, and forward-track confirming signals
argument-hint: "[ticker or theme, e.g. 'NVDA post-earnings']"
---

Load the `earnings-thesis` skill. Develop the thesis, register it as a strategy
(hash-commit before any signal), then emit forward signals only when a thesis
catalyst confirms.

Reuses the equity-research approach from anthropics/financial-services: sector
context, catalyst calendar, earnings analysis — but every output is committed to
the immutable ledger, not just drafted.
