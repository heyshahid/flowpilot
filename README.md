# FlowPilot 🚀

> **Visual AI Workflow Automation Platform**  
> *Build workflows visually. Connect apps. Automate repetitive work.*

[![Tests](https://img.shields.io/badge/tests-6%20passed-success)](https://github.com/heyshahid/flowpilot)
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
- [Standard Node Catalog & Schemas](./docs/NODE_SPECIFICATIONS.md)
- [Phase 1 Milestone Report](./docs/PHASE1_REPORT.md)

---

## 🗺️ Roadmap & Milestones

- [x] **Phase 1: Architecture, Security Boundaries & Core Engine Specification**
- [ ] **Phase 2: UI Foundation (Dashboard, Navigation & Visual Editor Shell)**
- [ ] **Phase 3: React Flow Visual Canvas & Dynamic Node Configuration Drawer**
- [ ] **Phase 4: Execution Engine & Worker Integration**
- [ ] **Phase 5: Core Integrations (Webhooks, HTTP Request, SMTP Email)**
- [ ] **Phase 6: Advanced Automation (Cron Schedules, Delays, Retries)**
- [ ] **Phase 7: AI Workflow Assistant (Natural Language to Workflow DAG)**
- [ ] **Phase 8: Multi-Tenant Team Workspaces & Access Control**
- [ ] **Phase 9: Analytics, Optimization & Metrics**
- [ ] **Phase 10: Security Hardening & Production Launch**

---

## 📄 License

MIT License © 2026 [Shahid Akram](https://github.com/heyshahid)

