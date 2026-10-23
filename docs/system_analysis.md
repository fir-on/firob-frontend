# Comprehensive Technical & Architectural Analysis Document — FirOb Educational Repository
## Version 3.4 — Built from Scratch Master Blueprint & Integrated Architecture

> This document serves as the authoritative architectural blueprint for building the FirOb multi-tenant SaaS platform completely from scratch. It integrates all validated governance models, unified tenant resolution mechanics (`InitializeTenantContext`), hybrid two-factor authentication (Hybrid 2FA), and the advanced multi-driver Hybrid AI Resource Subsystem (7 drivers, multi-format media generation, queue cancellation, and publishing lifecycle).

---

## 1. System Architecture Overview

### 1.1 General Architectural Pattern

- **Laravel 12** (PHP 8.3+, `declare(strict_types=1);` in every file) as the base framework, with **Livewire 3/4** for the interaction layer, **Alpine.js** for pure UI state, and **Tailwind CSS 4** with full RTL/LTR support.
- **Strict Service/Repository/Action Pattern:**
    - **Repository layer** (`app/Repositories/`): Responsible exclusively for database queries, extends `BaseRepository`, and contains no business logic.
    - **Service/Action layer** (`app/Services/`, `app/Actions/`): Contains complex business logic, AI features, and security validation. This is the only layer authorized to call more than one Repository or to orchestrate multi-step operations.
    - **Thin Livewire Components:** Contain no business logic or direct queries; they call only the Service layer and render the result. Goal: any logic must be testable independently of the HTTP/Livewire lifecycle.
- **API-First Readiness:** Every Service is designed so it can be invoked from:
    1. A Livewire component (current usage in the admin dashboard).
    2. A `Controller` + `JsonResource` (for future API / mobile applications — Section 8).

    No business logic is embedded inside a Livewire component in a way that prevents its reuse from an API path — every business decision is made inside a Service/Action only.

- **Strict rule for routing files:** No Closures or Callbacks inside `routes/*.php`; every action is extracted into a dedicated Controller, Invokable Controller, or Livewire component route. `routes/` files remain purely declarative.
- **No Repository, Service, or Policy resolves `tenant_id` on its own:** Tenant identity resolution is fully centralized through the `InitializeTenantContext` Middleware (Section 2).

### 1.2 Execution Philosophy: Control Layer Before Content

The formally adopted engineering rule:

> **Everything that imposes a boundary (Tenancy, Roles, Governance, Quotas) is built and enforced server-side before everything that is constrained by that boundary (Academic Content & AI Media).**

Build Order:
```
Sprint 1: Core Foundation & Multi-Tenancy Architecture
Sprint 2: Authentication, Hybrid 2FA & Dashboard Shell (with Impersonation)
Sprint 3: Control & Governance Layer (RBAC RoleMatrixEditor, Settings, Activity Log)
Sprint 4: Academic Structure (configurable), Academic Content & Hybrid AI Resource Subsystem (7 Drivers + Publishing)
Sprint 5: Learning Objects & Quiz/Assessment Engine
Sprint 6: General AI Ecosystem & Analytics
Sprint 7: Public Portal, SaaS Billing & CI/CD
```

Mandatory implementation cycle per feature:
```
Migration/Model → Interface & Repository → Service/Actions → Enums
→ Security Policies → Livewire Component/Views → Feature & Security Test
```

---

## 2. Native Multi-Tenancy Engine

### 2.1 General Strategy

The system adopts **Single-Database Multi-Tenancy** (a single shared database, logical isolation via a `tenant_id` column), without relying on third-party tenancy packages.
- Simplifies schema migrations and indexing across tenants.
- Facilitates Super Admin cross-tenant analytics.
- Reduces operational overhead as organization counts grow.

### 2.2 Unified Tenant Identity Resolution — `InitializeTenantContext` Middleware

`InitializeTenantContext` is the sole authority for resolving the active tenant for both Web and API requests alike.

**Resolution Hierarchy (Verbatim across Web and Mobile):**

| Order | Source | Context |
|---|---|---|
| 1 | `session('impersonated_tenant_id')` | Web requests / Super Admin (Landlord) impersonation |
| 2 | `auth()->user()?->tenant_id` | Authenticated web sessions or Sanctum API users |
| 3 | `$request->header('X-Tenant-ID')` | Stateless API requests (verified against user authorization) |

**Middleware Duties:**
1. Injects resolved `tenantId` into container: `app()->instance('currentTenantId', $tenantId);`.
2. Sets Spatie team ID: `setPermissionsTeamId($tenantId);`.
3. **Fail-Closed Execution:** Aborts immediately (`403`/`404`) if a tenant-scoped route lacks a valid tenant context before reaching controllers or Livewire components.

### 2.3 The `BelongsToTenant` Trait & `TenantScope`

Models belonging to a tenant use `BelongsToTenant`, which attaches `TenantScope`.
- `TenantScope` queries `app('currentTenantId')` exclusively.
- Running tenant-scoped queries outside a bound container throws a `BindingResolutionException` (Fail Closed).
- Super Admin operations explicitly bypass isolation via `withoutGlobalScope(TenantScope::class)` inside dedicated Super Admin services only.

### 2.4 Asynchronous Queue Context Rule

Queue Workers operate outside the HTTP request lifecycle (`auth()` and `session()` are null).
- Any queued job or activity log write **must** capture `tenant_id` and `causer_id` at dispatch time inside the request lifecycle and pass them explicitly via job constructors/payloads.

---

## 3. Domain Entities, AI Engine & Publishing Architecture

### 3.1 Entity Relationship Overview

```
Tenant (1) ───< Subscription (N) ── Plan (1)
Tenant (1) ───< User (N) ───< ModelHasRoles (Spatie team-scoped)
Tenant (1) ───< TenantSetting (N, composite unique key)
Tenant (1) ───< Activity (N, explicit tenant_id)
Tenant (1) ───< Grade (N, optional level) ───< Subject (N)
Tenant (1) ───< Subject (N) ───< Unit (N, optional) ───< Lesson (N, optional)
Tenant (1) ───< Subject (N) ───< Concept (N) ───< LearningObject (N)
Concept (N) >─── Unit (0..1) / Lesson (0..1)   [per tenant academic.structure settings]
Tenant (1) ───< ConceptMedia (N, polymorphic) ─── AiGenerationJob (1)
Tenant (1) ───< AiUsageLog (N)
```

### 3.2 Hybrid AI Resource Pipeline (Module 3.2B)

The AI subsystem integrates manual media uploads and on-demand AI generation across a multi-provider ecosystem:

1. **7 AI Provider Drivers (`AIProviderManager`):**
   - Cloud Drivers: `OpenAI`, `ElevenLabs`, `Replicate`, `OpenRouter`.
   - Local Drivers: `Ollama`, `FluxLocal`, `PiperLocal`.
2. **Supported Resource Types & Renderers (`AIResourceGeneratorInterface`):**
   - **Text Structure Generator:** Educational breakdowns and Concept prompts.
   - **Audio TTS Generator:** Voiceovers via ElevenLabs / PiperLocal.
   - **Image Diagram Generator:** Diagrams via Flux / Replicate / OpenAI.
   - **Presentation Renderer:** PPTX deck generation.
   - **PDF Renderer:** Document layout exports.
   - **DOCX Renderer:** Word document generation using structured templates (`ai_document_template_{en,ar}.docx`).
3. **Job Execution & Controls:**
   - Dedicated `ai-generation` queue connection.
   - Async generation jobs (`GenerateAudioResourceJob`, `GenerateImageResourceJob`, etc.).
   - Support for **Job Cancellation** (`ResourceGenerationCancelled` event).
   - AI Suggestion assistant (`AiSuggestionService`) integrated directly into Concept forms.
4. **Cloudflare R2 Storage Integration:**
   - Unified `r2` disk storage via `MediaStoragePathGenerator` ensuring isolated storage paths: `tenants/{tenant_id}/concepts/{concept_id}/...`.

### 3.3 Content Publishing Workflow

Content lifecycle follows a strict state machine (`PublishingModeEnum`):
- States: `DRAFT` → `PENDING` → `PUBLISHED` / `REJECTED`.
- Enforced via `PublishingService`, `SubmitForReviewAction`, `ApproveContentAction`, and `RejectContentAction`.
- Protected by `review-content` permission and automated notification dispatches (`ContentApprovedNotification`, `ContentRejectedNotification`).

### 3.4 Super Admin Tenant Impersonation

- `TenantImpersonationService` allows Super Admins to assume tenant context securely by setting `session('impersonated_tenant_id')`.
- Fully audited via activity logs while preserving original causer identity.

### 3.5 Tenant-Configurable Academic Structure

Full specification: `ACADEMIC_STRUCTURE_AR.md`.

- **Hierarchy:** `Grade (optional) → Subject (mandatory) → Unit (optional) → Lesson (optional) → Concept`. A Concept always belongs to a Subject; `unit_id` / `lesson_id` are nullable. A concept's grade is derived from its subject (`subjects.grade_id`); it is not stored on `concepts`.
- **Per-tenant configuration:** `tenant_settings` key `academic.structure` holds `enabled`, `required`, and an AR/EN `label` for each of `grades`, `units`, `lessons`. Default: all disabled (subjects and concepts only). Read exclusively through `AcademicStructureService::config()` (`AcademicStructureConfig` DTO, cached via `TenantSettingsService`).
- **Behavior on change:** disabling a level hides it and stops validating it but never deletes or nulls existing data; making a level required is enforced on concept create/update and on `SubmitForReviewAction`, and legacy concepts show an "incomplete classification" badge.
- **Integrity:** `ConceptClassificationValidator` enforces that unit/lesson belong to the concept's subject, that `lesson.unit_id` matches `concept.unit_id`, and that every referenced id belongs to the current tenant. `StructureDeletionGuard` blocks deleting a used grade/unit/lesson until its children are reassigned; deleting a structural item never deletes concepts (`SET NULL`).
- **Permissions:** `configure-academic-structure` (settings + grades, Tenant Admin), `manage-academic-structure` (units + lessons, Tenant Admin + Teacher/Editor), `view-academic-structure`.

---

## 4. Production Database Schema Rules

### 4.1 Mandatory Composite Unique Constraints

Single-column unique constraints on any tenant-scoped table are strictly forbidden.
- **Forbidden:** `$table->unique('code');`
- **Mandatory:** `$table->unique(['tenant_id', 'code']);`

### 4.2 Primary Tables Summary

1. `tenants`: `id`, `name`, `slug` (unique global), `domain` (unique global), `status`, `logo_path`, `cached_user_count`, `cached_storage_mb`.
2. `plans`: `id`, `code` (unique global), `max_users`, `max_storage_mb`, `ai_token_quota_monthly`, `price_monthly`.
3. `subscriptions`: `id`, `tenant_id`, `plan_id`, `status`, `starts_at`, `ends_at`. Composite index `(tenant_id, status)`.
4. `tenant_settings`: `id`, `tenant_id`, `key`, `value` (JSON), `updated_by`. Composite unique constraint `(tenant_id, key)`.
5. `activity_log`: Spatie extension with explicit `tenant_id` FK. Composite indexes `(tenant_id, created_at)` and `(causer_id)`.
6. `ai_generation_jobs`: `id`, `tenant_id`, `user_id`, `resource_type`, `provider`, `status`, `started_at`, `cancelled_at`.
7. `ai_usage_logs`: `id`, `tenant_id`, `user_id`, `provider`, `tokens_used`, `created_at`. Composite index `(tenant_id, created_at)`.
8. `grades`: `id`, `tenant_id`, `code`, `name` (json), `sort_order`, `is_active`, `created_by`, SoftDeletes. Unique `(tenant_id, code)`; index `(tenant_id, is_active, sort_order)`.
9. `units`: `id`, `tenant_id`, `subject_id`, `code`, `title` (json), `sort_order`, `is_active`, `created_by`, SoftDeletes. Unique `(tenant_id, subject_id, code)`; index `(tenant_id, subject_id, sort_order)`.
10. `lessons`: `id`, `tenant_id`, `subject_id`, `unit_id` (nullable), `code`, `title` (json), `sort_order`, `is_active`, `created_by`, SoftDeletes. Unique `(tenant_id, subject_id, code)`; index `(tenant_id, subject_id, unit_id, sort_order)`.
11. Added columns: `subjects.grade_id` (nullable, SET NULL), `concepts.unit_id` and `concepts.lesson_id` (nullable, SET NULL). Migration order: `grades → subjects → units → lessons → concepts`.

---

## 5. Security, Hybrid 2FA & Governance

### 5.1 Hybrid Two-Factor Authentication (Hybrid 2FA)

Powered by Laravel Fortify with three distinct enforcement layers:
1. **Sovereign Mandatory (Super Admin):** Enforced globally via `EnforceSuperAdminTwoFactor` middleware. Cannot be disabled.
2. **Tenant Policy (`security.require_2fa`):** Organization-wide requirement set via `tenant_settings`. Enforced via `EnsureTwoFactorEnforced` middleware. Features a self-lockout guard preventing admins without 2FA from enabling the policy.
3. **Voluntary:** User-managed via Profile UI with TOTP QR codes and recovery code downloads.

### 5.2 Server-Side Authorization & Privilege Escalation Guards

- **No Trust in UI:** Hiding buttons or inputs in Alpine/Blade is UX only; every action requires explicit server-side Policy checks.
- **Vertical Escalation Guard (`RoleAssignmentPolicy`):** Prevents users from assigning roles above their numeric level (`RoleLevelEnum`).
- **Horizontal Escalation Guard (`CrossTenantRoleTamperingTest`):** Prevents tenant admins from modifying users in other tenants.
- **Last Admin Guard (`LastAdminDeletionGuard`):** Prevents deleting or revoking the final admin in a tenant.

### 5.3 Concurrency-Safe Quota Enforcement

`PlanLimitEnforcementService` guards usage thresholds (`max_users`, `max_storage_mb`, `ai_token_quota_monthly`) using two mandatory synchronization layers:
1. **Redis Atomic Lock:** `Cache::lock("plan-limit:{tenant_id}:{resource}", 10)`.
2. **Database Transaction with Pessimistic Lock:** `DB::transaction()` + `Tenant::lockForUpdate()`.

---

## 6. Performance & Quality Gates

| Path | Tool | Target |
|---|---|---|
| Login + Tenant Switch | k6 / Artillery | p95 < 300ms @ 100 concurrent users |
| Authenticated Middleware Check | Telescope / k6 | 0 extra DB queries when settings cache is warm |
| `RoleMatrixEditor` Grid | Telescope | Constant query count regardless of permission count |
| `ActivityTimeline` (100k rows) | Benchmark | First page load < 500ms using Cursor Pagination |
| Quota Enforcement | Concurrency Test | 0 overruns under parallel load |

---

## 7. UI/UX Standards

- **Design System:** Tailwind CSS 4 with native RTL/LTR support, dark mode readiness, and responsive mobile drawers.
- **State Coverage:** Every screen must implement Default, Empty, Loading (`wire:loading` skeleton/spinners), Validation Error, and Toast/SweetAlert2 notification states.
- **Core Components:**
  - `TenantOnboardingWizard`: Multi-step registration stepper.
  - `RoleMatrixEditor`: Interactive permission x role matrix with instant Livewire toggling.
  - `AcademicStructureSettings` (tab inside `TenantSettingsForm`): enable/require/label for Grade, Unit, Lesson with presets and a live tree preview; the same presets appear as a step in `TenantOnboardingWizard`.
  - `TenantSettingsForm`: Tabbed settings (General, Branding, Publishing, Security 2FA) with live branding preview.
  - `ResourceSection`: Dual-action manual upload / AI generation workbench with audio/image/document previews.

---

## 8. Mobile API Readiness

- All business logic resides in Services/Actions callable by both Livewire components and API Controllers.
- Mobile authentication handled via Laravel Sanctum tokens tied to specific tenant contexts.
- API requests enforce the identical `InitializeTenantContext` resolution hierarchy and return structured `JsonResource` payloads.

---

*This document serves as the master system analysis for the FirOb platform build.*