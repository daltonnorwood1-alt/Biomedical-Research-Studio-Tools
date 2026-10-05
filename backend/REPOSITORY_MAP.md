# Repository Map

```text
biomedical-research-studio/
├── .codex-plugin/plugin.json       Codex plugin manifest
├── plugin.json                     Portable Agent Plugins manifest
├── mcp.json                        Portable local MCP endpoint declaration
├── assets/                         Plugin listing and composer icons
├── skills/                         Concise skill entrypoints and references
├── server/                         Local HTTP/MCP API and governed services
├── ui/                             Embedded MCP Apps interface components
├── app/                            Accessible local browser interface
├── shared/
│   ├── schemas/                    Versioned JSON contracts
│   ├── policies/                   Safety rules and gate policies
│   └── templates/                  Report, response, and manifest templates
├── scripts/                        Deterministic maintenance utilities
├── tests/                          Unit, integration, OOXML, UI, and a11y tests
├── fixtures/                       Synthetic, deidentified acceptance fixtures
├── docs/                           Architecture, privacy, lifecycle, and sources
├── imported-sources/               Read-only staging metadata (archives excluded)
├── package.json                    Commands and dependency contract
├── tsconfig.json                   TypeScript configuration
├── README.md                       Installation and operating guide
├── BUILD_PLAN.md                   Phased implementation and exit criteria
└── REPOSITORY_MAP.md               This map
```

## Runtime project directory

Each user project is stored outside source code under the configured data root:

```text
<data-root>/<project-id>/
├── project.sqlite                  Durable governed state
├── sources/original/               Immutable uploaded bytes
├── sources/quarantine/             Identifier-flagged inputs
├── working/                        Non-final drafts and extracted material
├── artifacts/                      Approved deliverables and reports
└── manifests/                      Release and provenance manifests
```

## Authority boundaries

| Component | May propose | May write governed state | May emit final DOCX |
| --- | --- | --- | --- |
| Senior Investigator | Tasks, synthesis, approval requests | Through validated transitions | No |
| Specialist skill | Findings, draft text, remediation | No | No |
| Approval service | Decision records | Yes, append-only | No |
| Document Production | Approved artifact transformations | Artifact and manifest records | Yes, after gates |
| UI | User requests and decisions | Through API only | No |

## Provenance hierarchy

1. Immutable uploaded artifacts and their hashes.
2. Author-confirmed scope, source hierarchy, and decisions.
3. Verified authoritative external records with retrieval dates.
4. Specialist interpretations and proposals, always labeled as such.

Conflicts are retained and linked. Lower layers never silently overwrite higher layers.
