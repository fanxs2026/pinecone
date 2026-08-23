# Pinecone User Manual (English)

> Doc version: 1.0 ｜ Date: 2026-08-21 ｜ Applies to: Pinecone Product Management System (Web frontend)  
> This manual covers the full flow: requirement collection → feature planning → task execution → release delivery → time tracking → knowledge base → testing loop → product discovery.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Quick Start](#2-quick-start)
3. [Workspace & Settings](#3-workspace--settings)
4. [Overview Dashboard](#4-overview-dashboard)
5. [Support Requests](#5-support-requests)
6. [Idea Pool](#6-idea-pool)
7. [Feature List](#7-feature-list)
8. [Story Board](#8-story-board)
9. [Release Plan](#9-release-plan)
10. [Time Tracking](#10-time-tracking)
11. [Knowledge Base](#11-knowledge-base)
12. [Common Operations & Tips](#12-common-operations--tips)
13. [Open Platform & Integrations](#13-open-platform--integrations)
14. [Governance & Security](#14-governance--security)
15. [Smart Features](#15-smart-features)
16. [Product Discovery (Portal / Vote / Theme / Scoring)](#16-product-discovery-portal--vote--theme--scoring)
17. [FAQ](#17-faq)

---

## 1. Introduction

Pinecone is a lightweight project management system for product/R&D teams, covering the full lifecycle from **idea collection → feature planning → task execution → release delivery → time tracking → knowledge base**. It offers multiple views (**list / by status / by release / by assignee**), drag-and-drop transitions, one-click export, and a built-in knowledge base.

### 1.1 Core Concepts

| Concept | Description |
| --- | --- |
| **Workspace** | Basic unit of data isolation, usually one project/team; workspaces are mutually invisible |
| **Idea** | Initial form of a requirement, from feedback or internal ideas; can be promoted to a Feature |
| **Feature** | Formally approved development unit, belonging to a release cycle |
| **Story** | Concrete execution unit split from a Feature; assignable, estimable |
| **Release** | Version iteration timebox; features/stories organized by release, with capacity cap |
| **Support** | User feedback and defect records; convertible to Idea/Feature/Story |
| **Knowledge Base (KB)** | Team wiki organized by spaces; rich-text editing with visibility control |

### 1.2 Navigation

After login, the left sidebar provides:

| Item | Path | Description |
| --- | --- | --- |
| Overview | `/` | Stat cards, workspace management, recent activity, AI summary |
| Supports | `/supports` | Feedback & defect management |
| Ideas | `/ideas` | Requirement collection & evaluation |
| Features | `/features` | Feature planning & release orchestration |
| Stories | `/stories` | Task execution board |
| Releases | `/releases` | Version cycles (list ⇄ Gantt) |
| Time | `/time-tracking` | Time logging & stats |
| Import | `/imports` | CSV bulk import |
| Trash | `/trash` | Recover deleted entities |
| Settings | `/settings` | Members, registration control, Webhook (admin) |
| KB | `/kb` | Team docs (opens in new window) |

> Tip: switch **简体中文 / English** at the top-right; the choice is global and persisted. Log out from the bottom of the sidebar.

---

## 2. Quick Start

### 2.1 Register

1. On the login page, click "No account? Register".
2. Fill **name, email, password** (≥6 chars), confirm password.
3. Click "Register" — you are logged in automatically.

> **Registration mode** (set by admin): `open` (anyone), `whitelist` (only whitelisted emails), `invite` (requires invite code). If rejected ("registration restricted"), contact an admin.

### 2.2 Login & SSO

- **Account login**: email + password. The access token auto-refreshes every 60 minutes (seamless); refreshing the page won't drop the session.
- **Enterprise SSO**: if SSO (OIDC or SAML 2.0) is configured, a "Enterprise login" entry appears at the bottom of the login page; after IdP authentication it returns and logs you in. First SSO login auto-provisions the account and joins the workspace.

### 2.3 Forgot Password

Login page → "Forgot password?" → enter email → system sends a **one-time reset link** (valid 30 min, single use) → click "Reset password" in the email. After reset, **all active sessions are force-logged-out**.

### 2.4 First-use Three Steps

1. **Create a workspace** (guided on first login).
2. **Create a release** in Releases.
3. **Enter your first card** via Idea → Feature → Story, or start from a Support request.

---

## 3. Workspace & Settings

### 3.1 Create / Switch Workspace

- First-time: the home page shows a creation form (name required; slug optional, lowercase/number/hyphen).
- Additional: click the workspace name dropdown at the top of the sidebar → "Create workspace".
- Switch: click the workspace name, pick the target (current marked ✓).

### 3.2 Settings Tabs

| Tab | Content | Visibility |
| --- | --- | --- |
| **Members** | Invite + member list (change role / remove) | All members |
| **Registration Control** | Email whitelist + invite codes + user disable | System admin only |
| **Enterprise Login** | Identity sources (OIDC · SAML) + SCIM | Workspace admin only |
| **Webhook** | Outbound event endpoints | Workspace admin only |
| **System Admin** | Audit query & export | System admin only |

**Members**: invite (email + role: admin/member/viewer); search, change role, remove (the **sole admin cannot be removed**).

### 3.3 Registration Control (System Admin)

- **Email whitelist**: only these emails may register in whitelist mode.
- **Invite codes**: generate (custom/auto, max uses/expiry), copy, disable/enable, delete.
- **User management**: disable/enable any account — disabled users cannot log in and existing sessions end.
- Do not disable your own account (the system blocks it).

---

## 4. Overview Dashboard

- **Welcome + this week**: "N new this week" badge (sum of 4-entity creations).
- **6 stat cards**: Support → Idea → Feature → Story → Time → Release; first 5 show "in-progress / total"; time card shows monthly total; click a card to jump.
- **Recent activity**: last 10 cross-entity operations (actor, code, title, time).
- **AI summary**: one-click workspace overview (template fallback if AI not configured).

> "In-progress" means non-completed / non-closed states.

---

## 5. Support Requests

Centralizes **user support** and **defects (Bugs)**, convertible to Idea/Feature/Story.

### 5.1 New Request

Supports → "New request" → **title** (required), description, **type**: `Support` (purple) / `Defect` (red). For defects, set **severity** (Critical/Major/Minor/Trivial) and **rootCause** (optional).

### 5.2 Three Views

| View | Description | Interaction |
| --- | --- | --- |
| **List** | Table, row select, filter, export | Click row → detail |
| **By status** | Board (Pending / Reviewing / Done) | Drag to change status |
| **By assignee** | Grouped by assignee | Drag to change/clear assignee |

### 5.3 Detail (5 tabs)

Detail / Comments / History / Relations / Time. Comment & relation tabs show count badges. Detail supports editing fields, status/type change, assignee, tags, attachments, severity/rootCause for defects, and clone to Idea/Feature/Story.

### 5.4 Convert to Idea / Feature / Story

Detail "Actions" creates a same-name entity with an "upgraded-from / cloned-from" relation. If the source is a `Defect`, **converting to a Story** auto-marks it `kind=DEFECT` (red badge); tech-debt tasks can be manually marked `CHORE` (gray badge).

---

## 6. Idea Pool

### 6.1 New / Views

Ideas → "New idea" → title (required), description, category tags. Three views: list / by status (8-state board) / by assignee, all drag-enabled.

### 6.2 Promote to Feature

Idea detail → "Promote", pick priority (P0~P3); generates a Feature with an "upgraded-from" relation.

### 6.3 TO-DO List

Idea detail "TO-DO" tab: create TO-DOs (title/description/assignee/due date); completion records actual time; overdue shows red marker; only creator or assignee may edit, only creator may delete.

---

## 7. Feature List

### 7.1 New Feature

Features → "New feature" → title (required), description, **release**, **priority** (P1 highest / P2 high / P3 mid default / P4 low / P5 lowest).

### 7.2 Four Views

List / by status (Pending/Triage/Splitting/Dev/Verifying/Closed) / **by release** (board of "unassigned + each release"; drag to assign; capacity progress bar at top: <80% green / 80~99% yellow / ≥100% red) / by assignee.

Capacity = workload hours ÷ 8 = person-days (or summed directly if in days).

### 7.3 Feature Detail

5 tabs; edit, change status/priority/assignee/release, set workload (hours/days), tags, attachments, **clone to Story** (inherits release).

---

## 8. Story Board

### 8.1 Create Story

- Direct: Stories → "New story" → parent Feature (required) + title (required) + description.
- From Feature: Feature detail "Clone to story" generates a release-inheriting story.

### 8.2 Status & Views

Status: `Todo → In Progress → Review → Done`, plus `Blocked`. Four views: list / by status (drag) / by release (read-only) / by assignee (drag).

### 8.3 Detail & Subtype

5 tabs; acceptance criteria, estimated hours, parent feature/release, tags, attachments, log time, test. Subtype badges: none for normal; red "Defect" for defect-cloned; gray "Tech-debt" for CHORE.

### 8.4 Story Test (Case Verification)

Story detail "Test" tab is the **story-level verification loop**: case list, new case (auto-linked), mark `PASS/FAIL/BLOCKED` (counts into release regression), click code → case detail. Cases are dual-mounted (Story primary + Release regression).

---

## 9. Release Plan

### 9.1 New / Status

Releases → "New release" → name (required), version, start/end dates, Stage/Prod dates, total capacity (person-days). Status: `Not Started → In Progress → Closed` (closed is non-editable and hidden from boards).

### 9.2 Gantt

Toggle **list ⇄ Gantt** at top-right: month timeline, status color bars, milestone diamonds (gray=gray-release / green=live); unclosed releases support drag-body pan, edge-stretch, diamond-milestone move, auto-save on release; unscheduled/closed cannot be dragged.

### 9.3 Test Progress / TestPlan / CI Import

- **Test progress** (release detail): pass-rate bar + case list + mark execution + one-click defect from failure; disabled once release closed.
- **TestPlan**: named batch (DRAFT→ACTIVE→COMPLETED/ARCHIVED), pull release cases, auto-rollup pass rate.
- **Import CI results (JUnit)**: release detail "Import CI results" → pick JUnit XML → match/create cases → execution records → import report.
- **Test sheet + walkthrough**: sidebar "Test sheets" (`/test-plans`), cross-release case templates; "Start walkthrough" derives a batch into the walkthrough page (`/test-plans/[id]/walkthrough`) for continuous execution.

### 9.4 Public Roadmap Sharing (NARRATIVE)

A release can generate a **share token** for public view: narrative roadmap (grouped by status + milestones + multi-release aggregation) + brandable title/color; voters get in-app + email notifications on status changes.

---

## 10. Time Tracking

Time → "Log time" → pick linked **Story**, enter **hours** (0.5 step), date, description (optional). Top shows total hours; billable records tagged; hover to delete. Time can also be logged from any entity's "Time" tab.

---

## 11. Knowledge Base

Team wiki, "space → page" two levels, opens `/kb` in a new window.

- **New page**: page tree "+ New page"; "Create from template" auto-fills title/body.
- **Sub-page / Set as template / Move**: tree structure, template reuse, move to other parent (cycle-protection: cannot move under itself/descendants).
- **Page ops**: comments, attachments (hover-delete), tags, visibility (all/members/admin).
- Rich text: heading, bold/italic/underline, lists, task lists, tables, links, images, color, cell merge, etc.

---

## 12. Common Operations & Tips

- **Unified card style**: code + status/priority/type badge (delete on hover) / title / tags + assignee; click opens detail in a new tab.
- **List checkbox**: row checkbox selects one; header selects/deselects all (current filter).
- **Export**: list mode "Download" → CSV / Excel(.xlsx) / PDF; select-then-export exports only selected rows.
- **Drag rules**: by-status=change status; by-release(feature)=assign release; by-assignee=change/clear assignee; by-release(story) read-only.
- **Detail tabs**: Detail / Comments / History (release change shows name) / Relations (shows code + direction) / Time / TO-DO (Idea only).
- **Language**: sidebar bottom switches Chinese/English, instant global.
- **Tab count badges**: comment/relation tabs show green number badges, hidden when 0, live-updated.
- **Logout**: sidebar bottom icon returns to login and clears server session.

---

## 13. Open Platform & Integrations

### 13.1 Webhook

Settings → Webhook: new endpoint with name + URL + subscribed events (or `*`); **Secret shown once**; async delivery with `X-Pinecone-Signature` (HMAC-SHA256), `X-Pinecone-Event-Id`, `X-Pinecone-Timestamp` (replay protection); failed deliveries viewable with manual resend.

### 13.2 CSV Bulk Import

Import page: pick entity type → download template → upload UTF-8 CSV; auto value-mapping (e.g. "Bug"→defect), reference resolution (email→assignee, version→release), injection sanitization; preview then execute with per-row report.

### 13.3 Enterprise Login (SSO: OIDC · SAML)

Settings → Enterprise Login:
- **OIDC**: name, Issuer, Client ID, Client Secret, Scopes + domain whitelist; first login auto-provisions (JIT).
- **SAML 2.0**: name, SP Entity ID, paste IdP metadata XML; UI shows ACS URL and SP metadata export URL for IdP.
- Client Secret shown once. See the Enterprise SSO Guide for details.

### 13.4 SCIM 2.0 Provisioning

Enterprise Login → SCIM 2.0: generate/reset Token (once); copy SCIM endpoint (`/api/workspaces/<wsId>/scim/v2`) + Token to IdP; group names ending `-ADMIN/-MEMBER/-VIEWER` (or exact mapping) grant corresponding roles.

### 13.5 Generic CI Result Ingestion

Settings → Webhook/CI config: configure GitHub/GitLab/Gitee source + signing key/API Token; CI calls `POST /ci/results` (HMAC or Bearer) to report JUnit; commit/PR links auto-backlink to entities.

---

## 14. Governance & Security

- **System admin & audit**: `isSystemAdmin` sees "System Admin" tab; filter audit by time/user/type and export CSV (UTF-8 BOM).
- **Recycle bin**: sidebar "Trash" gathers soft-deleted entities; "Recover" restores (relations included).
- **Backup**: encrypted backup (pg_dump → AES-256-GCM) with retention; see `scripts/backup-db.js` and `scripts/decrypt-backup.js`; store off-site and verify recovery periodically.

---

## 15. Smart Features

### 15.1 AI Summary (BYO Endpoint)

Overview/release "AI summary" generates overviews; template fallback when AI unconfigured (source labeled). Configure 3 backend env vars:

| Param | Required | Description |
| --- | --- | --- |
| `AI_API_KEY` | ✅ | Enable switch; unset = template summary |
| `AI_BASE_URL` | optional | OpenAI-compatible gateway, default official, ends `/v1` |
| `AI_MODEL` | optional | default `gpt-4o-mini` |

Supports official OpenAI, enterprise gateway, and on-prem Ollama (any non-empty Key, base `:11434/v1`). Restart backend after config.

### 15.2 PWA Offline & Install

Auto-registers Service Worker caching core pages; offline opens visited pages; "Install app" adds to desktop/phone; refresh after update switches to latest cache.

---

## 16. Product Discovery (Portal / Vote / Theme / Scoring)

### 16.1 Customer Feedback Portal

Workspace settings → Feedback Portal: enable to generate a **portal token** (URL `/feedback/:token`); set submission landing (Support/Idea); optional email verification. Share the link; customers submit/vote without login; submissions tagged `portal`; token-rate-limited.

### 16.2 Voting

Idea / Support / Feature can be voted: internal one-click vote (badge shows count); portal customer vote; unique constraint prevents duplicates (user-based internal, email-based portal).

### 16.3 Theme Aggregation

Themes page (`/themes`): create theme → link related feedback → theme aggregates total votes & count → "Promote to feature" one-click creates a Feature with relation.

### 16.4 Priority Scoring (RICE / ICE / CUSTOM)

Workspace settings → Scoring (admin) selects model & weights. Formulas: RICE=`(Reach×Impact×Confidence)/Effort`; ICE=`Impact×Confidence×Ease`; CUSTOM=`Σ(dimension×weight)` normalized 0–100. **Key loop**: when Reach is unset in RICE, it **defaults to the item's vote count**, letting democracy drive ranking. Lists support sort by score/votes and filter by theme/lowest score.

---

## 17. FAQ

**Q2: Can't see closed releases in by-release board?** Closed releases exit scheduling; historical data remains in Releases.

**Q3: Feature/Story not draggable?** Feature drags in by-status/release/assignee; Story drags in by-status/assignee, by-release is read-only; check the view mode.

**Q4: Dragged to "unassigned" but assignee unchanged?** Dragging to unassigned clears assignee only if it had one; no-op otherwise.

**Q5: What does `2 / 5` mean?** "In-progress count / total".

**Q6: Red capacity bar on a release?** Used capacity ≥ 100%; rebalance or raise total capacity.

**Q7: Change a Story's parent Feature?** Story detail "parent Feature", or re-clone from Feature.

**Q8: Can deleted data be recovered?** Soft-deleted items are in Trash (recoverable); KB attachment deletion also removes the disk file.

**Q9: Forgot password?** Login → "Forgot password?" → email → one-time link (30 min/single) → reset; all sessions logged out after.

**Q10: Why does KB open in a new window?** Isolated layout for editing; re-enter from sidebar anytime.

**Q11: Kicked out after idle?** No; token refreshes seamlessly every 60 min.

**Q12: "Registration restricted"?** Whitelist/invite mode; ask admin to whitelist or issue a code.

**Q13: Can't check off a TO-DO?** Only creator or assignee; delete only by creator.

**Q14: Can't find a template?** Mark a page "Set as template" first; it then appears in the dropdown.

**Q15: "Cannot move under itself/descendants"?** Cycle protection; pick another parent or root.

**Q16: Email case mismatch at login?** System lowercases and matches; any case works, no duplicate accounts.

**Q17: No reset email?** Check spam; each send invalidates the previous link—use the latest; else contact admin re SMTP.

**Q18: Gantt won't drag?** Unscheduled or closed releases aren't draggable; set dates first.

**Q19: CI import "parsed 0"?** Ensure standard JUnit XML (with `<testcase>` nodes).

---

*This document is based on the Pinecone frontend implementation; for feature iterations, refer to the actual UI.*
