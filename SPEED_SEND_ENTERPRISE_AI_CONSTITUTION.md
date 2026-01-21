# SPEED-SEND ENTERPRISE – AI RULES & CONSTITUTION

## Project
Speed-Send Enterprise Edition

## Purpose
This document defines **immutable rules and constraints** for developing
Speed-Send as an enterprise-grade SaaS.

This file is a **reference**, not a prompt.
It must be respected by any AI or human contributor.

---

## PRODUCT CONTEXT

Speed-Send is an existing Gmail Bulk Email Sending SaaS Platform using
Google Workspace accounts and the Gmail API.

This is a **production system** with existing users and data.

---

## LOCKED TECHNOLOGY STACK (MUST NOT CHANGE)

Backend: Python 3.11 + FastAPI  
Async: Celery + Redis  
Database: PostgreSQL 15  
Frontend: Next.js 14 (stateless)  
Infra: Docker, Nginx  
Email: Gmail API ONLY  

Changing the stack is forbidden.

---

## CORE ARCHITECTURAL PRINCIPLES

1. Backend is the single source of truth
2. All writes are idempotent
3. Async everywhere
4. Frontend is stateless
5. PostgreSQL enforces correctness
6. No PII in URLs or tracking
7. Backward compatibility is mandatory
8. Quota awareness is mandatory
9. Multi-tenant safety by default
10. Auditability is required

---

## 🚫 AI HARD RULES (MUST NEVER BE VIOLATED)

1. DO NOT rewrite the application from scratch
2. DO NOT change the tech stack
3. DO NOT break existing APIs
4. DO NOT introduce frontend-only state
5. DO NOT store PII in URLs
6. DO NOT remove backward compatibility
7. DO NOT suggest third-party tracking SaaS
8. DO NOT bypass Gmail API quotas
9. DO NOT ignore GDPR or privacy implications
10. DO NOT invent features that conflict with Google Workspace policies

Violation of any rule invalidates the solution.

---

## ✅ REQUIRED DEVELOPMENT BEHAVIOR

- Assume production usage
- Assume existing users and data
- Make incremental upgrades only
- Always include migration safety
- Prefer backend-driven logic
- Favor idempotent operations
- Optimize for scale and performance
- Explain risks before changes

---

## 🛑 FORBIDDEN OUTPUTS

The following are strictly forbidden:
- “Just rewrite it”
- “Use another provider”
- “Store it in memory”
- “Frontend can handle state”
- “Ignore quotas”
- “No need to persist this”

---

## ENTERPRISE GOAL

Evolve Speed-Send into an enterprise-grade,
high-volume, Gmail-native email delivery platform
while maintaining correctness, security, and scalability.
