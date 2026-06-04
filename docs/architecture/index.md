# Full Binary Tree Architecture

## Table of Contents
- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Design Decisions](#design-decisions)

## Overview

This project enforces a strict full binary tree directory structure, where every non-leaf directory has exactly two children. This ensures consistent, predictable organization and simplifies navigation and tooling.

## Directory Structure

```
project/
├── src/               # Source code root (left child: core, right child: data)
│   ├── core/          # Core logic (left child: logic, right child: model)
│   │   ├── logic/     # Business logic
│   │   └── model/     # Data models
│   ├── data/          # Data handling (left child: access, right child: parse)
│   │   ├── access/    # Data access layer
│   │   └── parse/     # Data parsing
│   ├── ui/            # UI layer
│   │   ├── input/     # Input handling
│   │   └── output/    # Output rendering
│   └── main.ts        # Entry point
├── tests/             # Tests (mirrors src structure)
├── config/            # Config files (dev.yaml, test.yaml, prod.yaml)
├── docs/              # Documentation
│   ├── architecture/
│   ├── api/
│   ├── deploy/
│   └── user/
├── scripts/           # Build and deploy scripts
└── assets/            # Static assets
```

## Design Decisions

### Binary Tree Constraint
Every directory that is not a leaf must have exactly two subdirectories. This constraint provides:
- Consistency across all modules
- Clear, predictable organization
- Simplified automated tooling

### Test File Mapping
Every source file in `src/` has a corresponding test file in `tests/`, with the same path and name (suffixed with `.test.ts`).
