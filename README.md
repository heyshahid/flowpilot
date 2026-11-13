# FlowPilot 🚀

> **Visual AI Workflow Automation Platform**  
> *Build workflows visually. Connect apps. Automate repetitive work.*

[![Tests](https://img.shields.io/badge/tests-92%20passed-success)](https://github.com/heyshahid/flowpilot)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.1-black)](https://nextjs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ⚡ Overview

**FlowPilot** is an open-source, self-hostable no-code workflow automation builder designed to connect webhooks, APIs, AI models, and databases into resilient automated pipelines.

Built with **Next.js**, **React Flow**, and a **decoupled TypeScript DAG Execution Engine**, FlowPilot allows users to drag-and-drop nodes, configure business logic, test flows in real-time, and monitor complete execution histories with step-by-step traces.

```
[ New Form Lead ] ➔ [ Validate & Enrich ] ➔ [ If Budget > $10k ] ➔ [ Send VIP Email ]
                                                  └─ Else ➔ [ Self-Serve Notification ]
```

---

## 🧩 Architectural Highlights

- **Decoupled Execution Runtime:** Canvas representations are purely declarative. The backend engine compiles graphs into topological execution plans (Kahn's Algorithm) with automatic cycle detection.
- **Zero-Trust SSRF Protection:** Built-in IP firewall interceptor blocks attacks against private subnets (RFC 1918), loopback, and cloud instance metadata (`169.254.169.254`).
- **Safe Expression Evaluator:** Dynamic variable referencing (`{{ $trigger.payload.email }}`) resolved via safe AST traversal without `eval()`.
- **Conditional Branching:** Native `If/Else` and `Switch` logic with path traversal and branch skipping.
- **Relational PostgreSQL Schema:** Multi-tenant workspace isolation with Row-Level Security (RLS) and encrypted credential vaults (AES-256-GCM).

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS, Lucide Icons |
| **Workflow Canvas** | React Flow (`@xyflow/react`) |
| **Engine Runtime** | Decoupled Node.js TypeScript DAG Engine |
| **Data Validation** | Zod |
| **Security** | SSRF Guard, AES-256-GCM Credential Vault |
| **Database** | PostgreSQL (Supabase / Prisma) |
| **Testing** | Vitest |

---

## 🚀 Quick Start (Development)

```bash
# 1. Clone repository
git clone https://github.com/heyshahid/flowpilot.git
cd flowpilot

# 2. Install dependencies
npm install

# 3. Run automated test suite
npm test

# 4. Start local development server
npm run dev
```

---

## 📋 Architectural Specifications

Detailed engineering documentation is available in the [`docs/`](./docs) directory:

- [System Architecture Specification](./docs/ARCHITECTURE.md)
- [Relational Database Schema (PostgreSQL DDL & RLS)](./docs/DATABASE_SCHEMA.md)
- [Execution Engine & DAG Runtime Model](./docs/EXECUTION_ENGINE.md)
- [Execution Engine Runtime & Lifecycle](./docs/EXECUTION_ENGINE_RUNTIME.md)
- [Standard Node Catalog & Schemas](./docs/NODE_SPECIFICATIONS.md)
- [Phase 4 Implementation Report](./docs/PHASE_4_IMPLEMENTATION.md)
- [Phase 5 Implementation Report](./docs/PHASE_5_IMPLEMENTATION.md)
- [Phase 6 Implementation Report](./docs/PHASE_6_IMPLEMENTATION.md)
- [Phase 7 Implementation Report](./docs/PHASE_7_IMPLEMENTATION.md)
- [AI Provider Architecture & Model Adapters](./docs/AI_PROVIDER_ARCHITECTURE.md)
- [Natural Language Workflow Generation](./docs/AI_WORKFLOW_GENERATION.md)
- [AI Security, Redaction & Safety Controls](./docs/AI_SECURITY.md)
- [AI Token Usage & Cost Management](./docs/AI_USAGE_AND_COSTS.md)
- [Scheduling Engine & Cron Specification](./docs/SCHEDULING_ENGINE.md)
- [Advanced Logic Nodes (Delay, Wait Until, Loop, Switch, Merge)](./docs/ADVANCED_NODES.md)
- [Sub-Workflows & Modular Composition](./docs/SUB_WORKFLOWS.md)
- [Workflow Versioning & Snapshot Rollback](./docs/WORKFLOW_VERSIONING.md)
- [Execution Limits & Safety Guardrails](./docs/EXECUTION_LIMITS.md)
- [Integration Architecture Specification](./docs/INTEGRATION_ARCHITECTURE.md)
- [Production Webhook Security Model](./docs/WEBHOOK_SECURITY.md)
- [OAuth & Third-Party Connection Guide](./docs/OAUTH_CONFIGURATION.md)

---

## 🗺️ Roadmap & Milestones

- [x] **Phase 1: Architecture, Security Boundaries & Core Engine Specification**
- [x] **Phase 2: UI Foundation (Dashboard, Navigation & Visual Editor Shell)**
- [x] **Phase 3: React Flow Visual Canvas & Dynamic Node Configuration Drawer**
- [x] **Phase 4: Backend Workflow Execution Engine & Worker Integration**
- [x] **Phase 5: Core Integrations & Production Webhooks (Webhooks, HTTP API, SMTP, Google Sheets, Slack, Telegram, AES-256-GCM Vault)**
- [x] **Phase 6: Advanced Automation & Scheduling (Cron Parser, Intervals, Delays, Loops, Multi-Branching, Merge, Sub-Workflows, Version Snapshots & Rollback)**
- [x] **Phase 7: AI Workflow Assistant (Natural Language to Workflow DAG, Smart Configuration, Explainer, Error Assistant & Multi-Provider Adapters)**
- [ ] **Phase 8: Multi-Tenant Team Workspaces & Access Control**
- [ ] **Phase 9: Analytics, Optimization & Metrics**
- [ ] **Phase 10: Security Hardening & Production Launch**

---

## 📄 License

MIT License © 2026 [Shahid Akram](https://github.com/heyshahid)

