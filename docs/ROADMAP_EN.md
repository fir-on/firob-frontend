# FirOb Platform — New Implementation Plan (Built from Scratch)
## Architecture: Laravel 12 + Livewire + Tailwind 4 + Hybrid AI Engine

This document outlines the master implementation plan for building the FirOb multi-tenant SaaS platform completely from scratch, incorporating all previously designed and validated architectural patterns, security modules, and advanced AI features (such as the 7-driver Hybrid AI Resource Generator, Publishing Workflow, and Tenant Impersonation).

---

## Sprint 1: Core Foundation & Single-DB Multi-Tenancy Architecture
*Objective: Establish the immutable foundational layers (Tenancy, Database, Repositories, Services).*

1. **Database & Tenancy Schema:**
   - Create `tenants`, `plans`, `subscriptions`, and `tenant_settings` tables with strict composite unique indexes `(tenant_id, key)`.
   - Implement ULID/BigInt primary keys and storage counter columns (`cached_user_count`, `cached_storage_mb`).
2. **Unified Tenant Resolution:**
   - Build `InitializeTenantContext` Middleware (handling session impersonation, authenticated user tenant, and verified `X-Tenant-ID` headers).
   - Bind `currentTenantId` as a singleton in the service container.
3. **Eloquent Traits & Scopes:**
   - Build `BelongsToTenant` trait and `TenantScope` global scope reading exclusively from `app('currentTenantId')`.
4. **Base Architecture:**
   - Establish `BaseRepository`, `BaseService`, and `RepositoryServiceProvider`.
   - Configure global rate limiters in `SecurityServiceProvider` (including `ai-generation` and `chatbot`).

---

## Sprint 2: Authentication, Hybrid 2FA & Dashboard Shell
*Objective: Secure user access, establish role hierarchies, and build the navigation shell.*

1. **Laravel Fortify & Hybrid 2FA:**
   - Configure Fortify authentication and TOTP two-factor verification (`two_factor_confirmed_at`).
   - Implement `TwoFactorRequirementService` and `EnforceSuperAdminTwoFactor` (sovereign mandatory for Super Admin).
   - Build Profile UI for voluntary 2FA management and recovery codes.
2. **User Management & Role Hierarchy:**
   - Implement `UserRoleEnum` with numeric `level()` and `assignableBy()` guard.
   - Build user invitations, role assignments, and `LastAdminDeletionGuard`.
3. **Dashboard Shell & Tenant Impersonation:**
   - Build responsive layout navigation (sidebar, tenant switcher, notifications, language switcher).
   - Implement **Tenant Impersonation Service & Policy** allowing Super Admins to log in as organization tenants securely.

---

## Sprint 3: Control & Governance Layer (RBAC, Settings & Audit Logs)
*Objective: Full administrative governance before academic content introduction.*

1. **Role Matrix Editor:**
   - Build `RoleMatrixEditor` Livewire component (permission × role grid with instant team-scoped Spatie permission updates).
   - Implement permission cache invalidation via `forgetCachedPermissions()`.
2. **Tenant & System Settings:**
   - Build `TenantSettingsService` with Redis cache-aside and immediate invalidation.
   - Implement the **Tenant 2FA Policy** (`security.require_2fa`) with self-lockout guards and `EnsureTwoFactorEnforced` middleware.
3. **Activity Audit Trail:**
   - Extend Spatie activity log with a non-nullable `tenant_id` and `TenantScope`.
   - Implement queued audit logging with explicit dispatch-time context capture.
   - Build the cursor-paginated `ActivityTimeline` dashboard view.

---

## Sprint 4: Academic Structure, Academic Content & Hybrid AI Resource Pipeline
*Objective: Tenant-configurable academic structure, Subjects, Concepts, and the advanced multi-driver AI generation subsystem.*

1. **Tenant-Configurable Academic Structure — built first within this sprint; full spec in `ACADEMIC_STRUCTURE_AR.md`:**
   - **Decisions:** each institution freely defines its own structure; `Subject` is always mandatory; `Grade`, `Unit`, and `Lesson` are optional levels; a `Concept` is always linked to a subject, and to grade/unit/lesson according to tenant settings.
   - **Data layer:** `grades`, `units`, `lessons` tables, `subjects.grade_id`, and nullable `concepts.unit_id` / `concepts.lesson_id`, with composite indexes starting with `tenant_id` and composite unique constraints; migration order: `grades → subjects → units → lessons → concepts`.
   - **Settings:** `academic.structure` key in `tenant_settings` (enabled / required / AR-EN label per level) via `TenantSettingsService`; `AcademicStructureService` with an `AcademicStructureConfig` DTO; an "Academic Structure" tab in `TenantSettingsForm` and a step in `TenantOnboardingWizard`.
   - **Services & guards:** `GradeService`, `UnitService`, `LessonService`, `StructureDeletionGuard` (deleting a structural item never deletes content), and `ConceptClassificationValidator` (tree consistency + tenant isolation).
   - **Permissions:** `configure-academic-structure`, `manage-academic-structure`, `view-academic-structure` in `RoleMatrixEditor`.
   - **UI:** Grades screen, Units/Lessons tabs on Subject details, cascading selects (subject → unit → lesson) in the Concept editor, filters in the Concept list, hierarchical student browsing.
2. **Subjects & Concepts CRUD:**
   - Build translatable `Subject` management (with `grade_id` per settings) and `Concept` management with XSS HTML sanitization (`mews/purifier`); enforce mandatory classification via `ConceptClassificationValidator` on create, update, and before submit-for-review.
3. **Hybrid Resource Management System (Module 3.2B):**
   - **Data Layer:** `ai_generation_jobs` table, queue connection (`ai-generation`), and polymorphic `concept_media`.
   - **7 AI Drivers Integration:** Implement `AIProviderManager` supporting `OpenAI`, `Ollama`, `FluxLocal`, `PiperLocal`, `ElevenLabs`, `Replicate`, and `OpenRouter`.
   - **Generators:** Text structure, TTS audio, Image diagram, Presentation (PPTX), PDF, and **DOCX document renderer** (with template assets).
   - **Advanced Features:** Generation cancellation, AI Suggestion assistant on Concept forms, and multi-provider fallback testing.
   - **Quota & Rate Limiting:** Enforce monthly token quotas via `PlanLimitEnforcementService` (using Redis locks + DB transactions) and per-resource rate limits.
4. **Content Publishing Workflow:**
   - Implement `PublishingModeEnum` state machine (`DRAFT` → `PENDING` → `PUBLISHED` / `REJECTED`) with submit/approve/reject actions and notifications.

---

## Sprint 5: Learning Objects & Quiz/Assessment Engine
*Objective: Extend educational delivery with package handling and evaluations.*

1. **Learning Objects Management:**
   - Implement file attachments and SCORM/HTML5 package handling reusing the R2 storage and queue patterns.
2. **Quiz & Assessment Engine:**
   - Build `Quiz`, `Question`, `QuizAttempt`, and `QuizAnswer` models and services.
   - Implement auto-grading logic and student-facing quiz player.

---

## Sprint 6: Advanced AI Ecosystem & Analytics
*Objective: Platform-wide AI tools and usage tracking.*

1. **General AI Content & Question Generator:**
   - Build general generator panels and prompt sanitization services.
2. **AI Chatbot Assistant:**
   - Build conversational chatbot widgets utilizing the pre-wired `chatbot` rate limiter.
3. **AI Usage Analytics Dashboard:**
   - Build the dedicated analytics UI consuming `AiUsageLog` data.

---

## Sprint 7: Public Portal, SaaS Billing & CI/CD
*Objective: Public distribution, monetization, and automated testing.*

1. **Public Catalog & Viewer Portal:**
   - Build sandboxed public learning object delivery views.
2. **SaaS Subscriptions & Billing:**
   - Build plan and subscription management workflows, payment hooks, and upgrade guards.
3. **CI Automation & Regression Testing:**
   - Configure GitHub Actions for automated test execution.
   - Build consolidated end-to-end tenant lifecycle and security regression test suites.