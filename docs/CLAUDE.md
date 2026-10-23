# Project Guidelines: FirOb Educational Repository (مستودع FirOb التعليمي)

## Architecture & Tech Stack

- **Framework:** Laravel 12 (PHP 8.3+, `declare(strict_types=1);`), Livewire 3/4, Alpine.js, Tailwind CSS (RTL/LTR support).
- **Pattern:** Strict Service-Repository Pattern.
    - **Repositories:** Handle database queries ONLY (`app/Repositories/`). Extends `BaseRepository`.
    - **Services/Actions:** Handle complex business logic, AI features, and security validations (`app/Services/`).
- **SaaS Architecture:** Single-DB Multi-Tenancy scoped via `BelongsToTenant` trait and `TenantScope`. Tenant identity resolution is centralized — see **Multi-Tenancy Implementation** below; no repository, service, or policy may resolve `tenant_id` on its own.
- **Routing Rules**: NEVER write Closure logic or inline callbacks inside `routes/*.php` files. Always extract route actions into dedicated Controllers or Invokable Controllers (e.g., `DashboardController`, `LogoutController`). Keep routes files purely for route declarations, middleware assignment, and naming.

## Multi-Tenancy Implementation

- **Unified Tenant Resolution — `InitializeTenantContext` Middleware:**
    - A single `InitializeTenantContext` middleware is the ONLY place allowed to resolve the active tenant. It runs early in the pipeline (web and API groups alike) and:
        1. Resolves the active tenant ID using the resolution hierarchy defined below.
        2. Binds the resolved value into the Service Container as a singleton: `app()->instance('currentTenantId', $tenantId);`.
        3. Calls `setPermissionsTeamId($tenantId)` (Spatie `laravel-permission` teams feature) so that all role/permission checks for the current request are automatically scoped to the active tenant.
    - If no tenant can be resolved for a route that requires one, the middleware MUST abort the request (`403`/`404` as appropriate) before any controller, Livewire component, or Service executes — never allow a "null tenant" request to reach business logic.

- **Tenant Resolution Hierarchy (Web & API, evaluated in order):**
    1. `session('impersonated_tenant_id')` — Web requests / Super Admin (Landlord) impersonation.
    2. `auth()->user()?->tenant_id` — Authenticated Web sessions or Sanctum API users.
    3. `$request->header('X-Tenant-ID')` — Direct/stateless API calls, **only** after the middleware verifies the authenticated user actually owns or has access to that `tenant_id`. A mismatched header MUST fail closed (reject the request), never silently fall back to another source.
    - This exact hierarchy is shared verbatim between Web and Mobile API contexts (see **Mobile API Readiness**) — do not duplicate or fork tenant-resolution logic per surface.

- **`TenantScope` & `BelongsToTenant` Refactor:**
    - `TenantScope.php` and the `BelongsToTenant` trait MUST resolve the active tenant strictly and uniformly via `app('currentTenantId')` — never via `auth()->user()->tenant_id`, `session()`, or request input directly inside the scope/trait.
    - This guarantees a single source of truth: if `InitializeTenantContext` hasn't bound `currentTenantId`, tenant-scoped Eloquent queries and model events (`creating`, etc.) must fail loudly (throw) rather than silently returning unscoped/cross-tenant data.
    - Any Artisan command, queued job, or console context that needs tenant scoping outside an HTTP request MUST explicitly bind `currentTenantId` into the container itself before touching tenant-scoped models (see **Queued Audit Logging** for the Activity Log-specific case).

## Mobile API Readiness

- **Stateless Sanctum Support:** API routes (`routes/api.php`) authenticate via Laravel Sanctum (token-based, stateless — no session cookie assumed).
- `InitializeTenantContext` runs on the `api` middleware group exactly as it does on `web`, applying the same three-step resolution hierarchy defined in **Multi-Tenancy Implementation**. API-only requests will typically resolve via hierarchy step 2 (`auth()->user()?->tenant_id`) or step 3 (`X-Tenant-ID` header for multi-tenant-per-user scenarios); step 1 (`impersonated_tenant_id`) only applies when the token belongs to a Super Admin session with an active impersonation.
- No API controller, Form Request, or Resource may read `tenant_id` from the request body/query string as a trust boundary — it is only ever read from the resolved `currentTenantId` container binding.

## Security & Hardening Rules

- **Authorization:** Enforce Laravel Policies & Spatie Roles/Permissions on ALL Service actions and Livewire components. Permission checks rely on `setPermissionsTeamId()` having already been called by `InitializeTenantContext` — never call it ad hoc inside a controller or Service.
- **Data Isolation:** Strictly scope queries by `tenant_id` to prevent cross-tenant data leaks (IDOR), via `TenantScope`/`BelongsToTenant` as described in **Multi-Tenancy Implementation**.
- **Input Sanitization:** Use `mews/purifier` for HTML content/rich-text sanitization.
- **File Uploads:** Validate true MIME types, block executable scripts (`.php`, `.exe`, `.sh`), and sandbox SCORM/HTML5 ZIP extractions.
- **Rate Limiting:** Enforce dedicated limiters on Auth, Quiz Submissions, AI Generation, and Chatbot endpoints.
- **Activity Log Isolation:** The `spatie/laravel-activitylog` `Activity` model does NOT include `tenant_id` by default. Add it as an explicit column and apply `TenantScope` to it — never rely on the implicit `causer`/`subject` relation alone to prevent cross-tenant activity-log leaks. The log itself is read-only from the UI (no edit/delete actions), only scheduled retention/archiving. **When logging is queued, see the Queued Audit Logging rule below — `TenantScope`'s container-based resolution is unavailable inside Queue Workers.**
- **Spatie Permission Cache Invalidation:** Any role or permission mutation MUST explicitly invoke `app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions()` immediately inside the Service method right after the DB write. Do not rely on the package's default cache TTL to self-expire — a stale permission cache after a mutation is a security gap, not just a UX lag.

## Database Standards

- **No Single-Column Unique Constraints on Tenant-Scoped Tables:** Single-column unique constraints (e.g., `$table->unique('code');`) are strictly forbidden on any tenant-scoped table. All unique constraints MUST be composite and explicitly include `tenant_id`:
    ```php
    $table->unique(['tenant_id', 'code']);
    ```
- This applies at the migration/database level as the authoritative guarantee — the `Rule::unique(...)->where('tenant_id', ...)` check in Form Requests (see **Validation & Localization Rules**) is a UX-layer convenience only and is never a substitute for the composite database constraint.
- Migration reviews must reject any `unique()` call on a tenant-scoped column that does not include `tenant_id` in the same composite index.

## Academic Structure (Configurable per Tenant)

Full spec: `ACADEMIC_STRUCTURE_AR.md`. Hierarchy: `Grade (optional) → Subject (mandatory) → Unit (optional) → Lesson (optional) → Concept`.

- **Subject is always mandatory; Grade, Unit, and Lesson are optional levels** controlled by the tenant setting `academic.structure` in `tenant_settings` (`enabled`, `required`, and AR/EN `label` per level; default = all disabled). A Concept always has `subject_id`; `unit_id` / `lesson_id` are nullable and validated according to the settings.
- **Single source of truth:** read the settings ONLY through `AcademicStructureService::config()` (`AcademicStructureConfig` DTO). Never read `tenant_settings` directly from Form Requests, Policies, Livewire components, or Blade.
- **Grade lives on the Subject** (`subjects.grade_id`); a concept's grade is derived from its subject. Do NOT add `grade_id` to `concepts`.
- **Validation:** concept classification is validated only by `ConceptClassificationValidator` (called from `Store/UpdateConceptRequest` and `SubmitForReviewAction`): unit/lesson must belong to the concept's subject, `lesson.unit_id` must match `concept.unit_id`, and every id must exist inside the current tenant (`Rule::exists(...)->where('tenant_id', app('currentTenantId'))`).
- **Disabled level = not shown, not validated, not modified.** Never null out or delete data when a level is disabled. A level becoming `required` is enforced on create/update and before submit-for-review, never retroactively blocking existing records.
- **Deleting a structural item never deletes content:** `grade_id`, `unit_id`, `lesson_id` FKs on subjects/lessons/concepts are `SET NULL`. `StructureDeletionGuard` blocks deletion of a used grade/unit/lesson until its children are reassigned. Deleting a subject soft-deletes its units, lessons, and concepts via Service/Observer.
- **Unique constraints stay composite with `tenant_id`:** `grades (tenant_id, code)`, `units (tenant_id, subject_id, code)`, `lessons (tenant_id, subject_id, code)`.
- **UI labels for these levels come from the tenant's `label` setting**, not from fixed translation keys. Permissions: `configure-academic-structure`, `manage-academic-structure`, `view-academic-structure`.
- Migration order: `grades → subjects → units → lessons → concepts → learning_objects`.

## Queued Audit Logging

- Any activity log write dispatched asynchronously (`activity()->...->queue()`, or any job that writes to the `Activity` model) MUST explicitly carry `tenant_id` and `causer_id` inside `withProperties()` or the job's own payload/constructor arguments.
- **Rationale:** `auth()` and `session()` — and therefore the `currentTenantId` container binding set by `InitializeTenantContext` — are completely `null`/unavailable inside asynchronous Queue Workers. A queued job that assumes request-time context will silently log with a missing or wrong tenant, corrupting isolation.
- Pattern: capture `tenant_id` and `causer_id` at dispatch time (while still inside the request lifecycle, where `currentTenantId` and `auth()->user()` are valid) and pass them explicitly into the queued job/log call — never re-resolve them from `auth()`/`session()`/`app('currentTenantId')` inside the job itself.

## Implementation Cycle (Mandatory Order)

For every feature, strictly follow this sequence:
`Migration/Model -> Interface & Repository -> Service/Actions -> Enums -> Security Policies -> Livewire Component/Views -> Feature & Security Test`

### Feature Priority Order (Control Layer Before Content)
Build the control/management layer fully — and make it functionally enforced, not assumed — **before** building any academic content module (Subjects, Concepts, Learning Objects). In order:
1. Tenants, Plans & Subscriptions (`TenantService`, `SubscriptionService`, `PlanLimitEnforcementService`)
2. Roles & Permissions (RBAC) — including a `RoleMatrixEditor` admin UI, not just seeded roles
3. Tenant Settings & System Settings (`TenantSettingsService`, `SystemSettingsService`)
4. Activity Log (`ActivityLogService`, tenant-scoped, with an admin-facing timeline UI)

Only after these four are complete and enforced server-side should the Academic Structure (grades/units/lessons + `academic.structure` settings), Concepts, Learning Objects, and the hybrid AI-resource pipeline be built — in that order: Academic Structure → Subjects/Concepts → the rest. Any Policy or Service written for academic content must assume real roles/permissions and real plan limits already exist — never stub them out "to be wired later."

### Definition of Done (adds to the mandatory cycle above)
A module (especially Tenants/Plans, RBAC, Settings, Activity Log) is not "done" after functional + security tests pass alone. Also confirm:
- **No trust in UI:** every permission/plan-limit check is enforced server-side (Service/Policy). A disabled button or hidden menu item is a UX nicety, never a substitute for server-side authorization.
- **Performance/load check on critical paths:** login, tenant switching, role/permission updates, and activity-log listing must be checked for N+1 queries and, where growth is expected (activity_log, usage logs), must use cursor pagination and proper composite indexes (`tenant_id` + relevant column) before the module is considered closed.
- **Concurrency safety on limits:** `PlanLimitEnforcementService` and similar quota checks must be race-condition safe under concurrent requests, not just correct in the single-request case. Explicitly use **Redis Atomic Locks (`Cache::lock`) combined with DB transactions** — the lock serializes concurrent quota checks for the same tenant/resource, and the transaction ensures the read-check-increment sequence commits atomically. Neither mechanism alone is sufficient.

## Code Output Rules

- Write clean, production-ready PHP/Blade code with strict type-hinting.
- Specify exact relative file paths for all generated/modified files.
- Minimize conversational fluff and jump straight to the technical implementation.
- Real-Time UI Feedback: Ensure Livewire fields use updated validation hooks or wire:model.blur so inline error messages render immediately below the inputs in the active language before database operations are executed.

## UI & UX Conventions

- **Forms & CRUD Interactions:** Use Livewire Slide-overs or Modals for CRUD operations instead of navigating to separate create/edit pages wherever applicable.
- **Notifications & Confirmation:** Integrate SweetAlert2 (via Livewire events / Alpine.js) for all system feedback, confirm-delete dialogs, and success/error notifications.
- **Localization:** Never hardcode UI labels, validation messages, or SweetAlert texts. Always use Laravel translation keys `__('messages.key_name')` referencing `lang/ar/messages.php` and `lang/en/messages.php`.

## Execution & Terminal Rules

- Write and update code directly into the respective files.
- NEVER run terminal/artisan commands (e.g., `php artisan`, `composer`, `npm`, `git`) automatically. Leave execution to the user.
- Always use `declare(strict_types=1);` at the top of every PHP file.

## Cloudflare R2, Media & Validation Rules

### 1. Storage Provider & Driver Standard

- Use Cloudflare R2 as the primary storage provider via standard S3-compatible driver configuration in `config/filesystems.php`.
- Environment abstraction: Local testing/CI must default to `filesystem_driver = 'public'` or `s3` mock, while staging/production defaults to `r2`.
- NEVER store uploaded files directly on the local server filesystem in production code.

### 2. Multi-Tenant Folder Isolation & Pathing

- Every uploaded file MUST be organized under a strict tenant-isolated path structure:
  `tenants/{tenant_id}/{module_name}/{year}/{hash_name}.{extension}`
- Enforce strict `tenant_id` verification before generating presigned upload URLs or stream links.
- No tenant may read, overwrite, or reference media keys belonging to another `tenant_id`.

### 3. Direct-to-R2 Upload Architecture (Presigned URLs)

- Heavy files and rich-text media uploads MUST bypass the Application Server using Presigned S3/R2 PUT URLs.
- `MediaUploadService` must generate short-lived signed URLs (valid for 5–10 minutes) with strict content-type and payload size validation.
- The browser uploads directly to Cloudflare R2; Laravel receives only the metadata payload (path, file_name, mime_type, size) to persist in the database.

### 4. Security & Sanitization Policy

- **MIME Type Whitelisting**: Strictly limit allowed extensions per context (e.g., Images: `jpg, png, webp, svg`; Documents: `pdf`).
- **SVG Sanitization**: Any SVG media MUST pass through XSS/XML sanitization before being attached or published.
- **Filename Hashing**: Always strip original file names and replace them with secure random UUIDs or hashes to prevent directory traversal and overwrite bugs.

### 5. Polymorphic Integration & Media Services

- Implement polymorphic relationships via `ConceptMedia` or Spatie Media Library models for flexibility.
- File attachment logic must be encapsulated inside dedicated Service classes (`MediaUploadService`), keeping Livewire components light.

### 6. Dedicated Form Request Validation

- **No Direct Validation**: NEVER define or run inline validation rules inside Livewire components or Controllers directly.
- **Dedicated Request Classes**: Always instantiate dedicated Form Request classes for creation and update operations (e.g., `StoreConceptRequest`, `UpdateConceptRequest`).
- **Media & File Rules**: Request classes must strictly validate file MIME types, maximum file size thresholds, and verify that text fields conform to sanitization specs before passing data to the Service layer.
- **Tenant Authorization Check**: Ensure the `authorize()` method within each Form Request explicitly verifies tenant context ownership (`tenant_id`) before executing validation.

## Validation & Localization Rules

1. **Automatic Localization for Forms**:
    - All validation error messages and field attributes must be localized in `lang/ar/validation.php` or `lang/ar.json`.
    - Never hardcode dynamic text mixes like `"The الرمز field is required."`.
2. **Attributes Centralization**:
    - Every new field added to a Form Request or Livewire component must have its Arabic counterpart defined in `lang/ar/validation.php` under the `'attributes'` array (e.g., `'code' => 'الرمز'`).

3. **Validation Messages**:
    - Custom form messages must either rely on the default Arabic translation files (`laravel-lang`) or define standardized localized messages using `__('validation.required')` / custom keys in `lang/ar/*.php`.

4. **Strict Multi-language Validation Messages**: Every Form Request or Livewire component performing validation MUST define custom localized messages in Arabic and English for all rules (e.g., `required`, `unique`, `max`, `min`).
5. **Translation Keys Usage**: Always resolve validation messages using Laravel translation files (`lang/ar/validation.php` / `lang/en/validation.php`) or direct array maps with translated strings.
6. **Tenant-Scoped Unique Validation**: For any `unique` constraint check, strictly scope the query by the active tenant ID:
    ```php
    Rule::unique('table_name', 'column')
        ->where('tenant_id', app('currentTenantId'))
        ->ignore($this->modelId)
    ```
    Note: per the **Database Standards** section above, this Form Request-level check complements — and never replaces — the composite `['tenant_id', 'column']` unique index at the migration level.

## Media Services & Multi-Tenant Cloud Storage Rules

1. **Unified Storage Architecture (`MediaUploadService`)**:
    - All media files (Concepts, Objects, Subjects, etc.) MUST be processed and stored through a centralized `MediaUploadService`.
    - Hardcoding raw `Storage::disk('r2')->put()` calls outside of this unified service is strictly forbidden.

2. **Tenant & Entity Directory Isolation**:
    - Every file path stored in Cloudflare R2 MUST observe strict Multi-Tenant and Entity classification layout.
    - Standard Path Structure:
      `tenants/{tenant_id}/{entity_type}/{year}/{month}/{hash_filename}.{extension}`
      _(Example: `tenants/01J0.../concepts/2026/09/a8f9c1...png`)_
    - If the request belongs to a global scope or Landlord (Super Admin), default to `landlord/{entity_type}/...`.

3. **Standardized Method Signature**:
    - `MediaUploadService` must accept:
        - `UploadedFile|string $file`
        - `string $entityType` (e.g., `'concepts'`, `'objects'`, `'subjects'`)
        - `?string $tenantId = null` (auto-resolved from current tenant context if null)
        - `array $options = []` (custom directory prefix, public/private visibility, file validation)

4. **Security & Sanitization**:
    - Filenames must be automatically generated using secure random UUID/ULID or sha256 hashing to prevent filename collisions and path traversal attacks.
    - Validate MIME types and enforce file size limits according to the specific entity requirement prior to execution.

## Performance & Optimization Rules

- **Eloquent & Queries:**
    - Avoid N+1 queries; always use eager loading (`with()`) for relations used in views.
    - Select only required columns in heavy queries (`select(['id', 'name'])`).
    - Use `exists()` or `count()` instead of loading collections when checking existence.

- **Livewire & Alpine.js:**
    - Minimize server round-trips; defer data binding with `wire:model.blur` or `wire:model.live.debounce` where appropriate.
    - Keep Livewire component state lean (avoid storing large models/collections as public properties; pass IDs instead).
    - Use Alpine.js for pure UI state (dropdowns, modals, toggles) without triggering Livewire network requests.

- **Blade & Asset Rendering:**
    - Use `@includeWhen` or `@includeUnless` to prevent unnecessary template rendering.
    - Ensure dynamic images use `loading="lazy"` and proper spatial attributes (`width`/`height`).
