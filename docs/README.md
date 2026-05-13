# Documentation

Canonical, in-repo map of the **eli-hmi** stack: Next.js frontend, Go mock backend, Python FastAPI/aioca backend.

This tree mirrors to the [GitHub Wiki](https://github.com/eli-eric/eli-hmi/wiki) on every push to `dev` ([sync action](workflows/publishing-wiki.md)).

## Start here

- [Architecture](architecture.md) — all three modules and the seams between them
- [Glossary](glossary.md) — domain (PV, EPICS, …) ⨯ architecture vocabulary
- [Context](context.md) — `CONTEXT.md` shape for the [improve-codebase-architecture skill](../.agents/skills/improve-codebase-architecture/SKILL.md)

## Frontend

- [Overview](frontend/overview.md)
- [WebSocket client](frontend/websocket-client.md)
- [Module pages](frontend/module-pages.md)
- [HMI components](frontend/hmi-components.md)
- [Auth](frontend/auth.md)
- [Zones](frontend/zones.md)
- [L4 OPCPA](frontend/l4-opcpa.md)

## Backend

- [Overview](backend/overview.md)
- [Mock server (Go)](backend/mock-server.md)
- [Python server (FastAPI + aioca)](backend/python-server.md)
- [WebSocket protocol](backend/websocket-protocol.md)
- [PV write endpoint](backend/pv-write-endpoint.md)

## Reference

- [PV naming](reference/pv-naming.md)
- [Env vars](reference/env-vars.md)

## Runbooks

- [Local dev](runbooks/local-dev.md)
- [Running the mock backend](runbooks/running-mock-backend.md)
- [Running the Python backend](runbooks/running-python-backend.md)
- [Deploying the Python backend](runbooks/deploying-python-backend.md)
- [Operator stations](runbooks/operator-stations.md)

## ADRs

- [Template](adr/template.md)
- [ADR-0001 WS pub/sub pattern](adr/0001-ws-pubsub-pattern.md)
- [ADR-0002 Zone-based access control](adr/0002-zone-based-access-control.md)
- [ADR-0003 Compound components for HMI panels](adr/0003-compound-components-for-hmi-panels.md)
- [ADR-0004 Single PV write endpoint](adr/0004-single-pv-write-endpoint.md)
- [ADR-0005 Mock vs Python backend split](adr/0005-mock-vs-python-backend-split.md)
- [ADR-0006 PV name registry (L4 OPCPA)](adr/0006-pv-name-registry-l4-opcpa.md)
- [ADR-0007 L4 custom shell, not ModuleControlPage](adr/0007-l4-custom-shell-not-modulecontrolpage.md)
- [ADR-0008 Laser specs location](adr/0008-laser-specs-location.md)
- [ADR-0009 Shared WS protocol contract](adr/0009-shared-ws-protocol-contract.md)

## Workflows

- [Adding a control page](workflows/adding-a-control-page.md)
- [Adding a PV to the mock backend](workflows/adding-a-pv-to-mock-backend.md)
- [Adding an ADR](workflows/adding-an-adr.md)
- [Publishing wiki](workflows/publishing-wiki.md)
