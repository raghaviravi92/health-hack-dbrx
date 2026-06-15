# Implementation Plan - Data Readiness Desk

Transform the existing Content Moderator prototype into a database-backed Data Readiness Desk for reviewing facility data anomalies. The app will stage anomaly records in Lakebase, let reviewers resolve or reject suggested corrections, and provide AI assistance for field-specific correction suggestions.

This plan intentionally keeps source-data discovery and sync architecture explicit because the app spans Databricks Apps, Lakebase, SQL Warehouse analytics, Genie, and Model Serving.

---

## Human Review Required Before Build

These items must be confirmed before implementation starts.

1. **Canonical source tables**
   - Confirm fully qualified Unity Catalog table names for facilities and reference data.
   - Required source areas: facility master, zip/pincode directory, coordinate fields, state names, email fields, phone fields, district reference data.
   - Confirm primary keys and source row identifiers for every table used.

2. **Data access pattern**
   - The app needs Lakebase for persistent review state.
   - Human decision needed for anomaly ingestion:
     - Option A: Lakeflow Job computes anomalies from source tables and upserts results into Lakebase.
     - Option B: App-triggered sync calls a dedicated backend service/SDK path to query the warehouse and write Lakebase.
     - Option C: Use Lakebase synced tables for source lookup data, then compute anomalies in Lakebase.
   - Recommendation: use **Option A** if anomaly scans are large or need repeatability/auditing. Use app-triggered sync only for small hackathon datasets or demos.

3. **Review semantics**
   - Define what each status means: `pending`, `resolved`, `rejected`, `nullified`, `stale`, `reopened`.
   - Decide whether a new upstream value reopens an already reviewed record or creates a new anomaly version.
   - Decide whether AI suggestions can be saved directly or must always pass deterministic validation.

4. **PII and model usage**
   - Confirm whether emails and phone numbers can be sent to `databricks-gpt-5-4-mini`.
   - Confirm retention rules for original values, corrected values, prompts, model outputs, and review notes.

5. **Identity and authorization**
   - Confirm whether reviewer identity should come from Databricks Apps `x-forwarded-email`.
   - Confirm whether any actions are admin-only: sync, bulk changes, scenario deletion, exporting reviewed records.

6. **Genie and analytics**
   - Confirm whether to reuse an existing Genie space or create a new one over Data Readiness Desk datasets.
   - Confirm the Unity Catalog catalog name used to expose Lakebase tables to SQL Warehouse analytics.

7. **Shortlists and scenarios**
   - Define what a scenario contains: selected facilities, assumptions, target metric, notes, owner, shared users/groups, and output tables.
   - Define whether shortlists are global, user-specific, scenario-specific, or all three.

---

## Architecture Decision

### Operational State: Lakebase

Lakebase is the system of record for anomaly triage state:

- staged anomalies
- human review decisions
- review history
- shortlists
- scenarios
- sync run metadata

The app backend will use `appkit.lakebase.query()` for CRUD endpoints.

### Source Data and Anomaly Generation

Do not hide source-data scans inside ordinary UI read endpoints.

Preferred flow:

1. A sync process reads source tables from Databricks SQL Warehouse or a Lakeflow Job.
2. It computes deterministic anomaly candidates and optional AI/regex suggestions.
3. It upserts anomaly records into Lakebase.
4. The UI reads pending records from Lakebase for fast review.

For a hackathon/demo implementation, `POST /api/readiness/sync` may trigger the sync, but the implementation must:

- document the exact source queries
- cap or page result sets
- record a `sync_runs` row
- preserve prior human reviews
- return progress and error details

### Analytics

Analytics widgets should use AppKit analytics SQL files in `config/queries`. Those SQL files may read Lakebase only after the Lakebase database has been registered as a Unity Catalog catalog and the app service principal has the required grants.

---

## Proposed Lakebase Schema

Initialize these tables on startup. Use additive migrations where possible instead of destructive schema replacement.

```sql
CREATE SCHEMA IF NOT EXISTS data_readiness;

CREATE TABLE IF NOT EXISTS data_readiness.sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  source_description TEXT NOT NULL,
  started_by TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  records_scanned INTEGER NOT NULL DEFAULT 0,
  records_upserted INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS data_readiness.flagged_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id TEXT NOT NULL,
  facility_name TEXT NOT NULL,
  field_name TEXT NOT NULL CHECK (
    field_name IN ('zip', 'coords', 'state', 'email', 'phone', 'district')
  ),
  anomaly_type TEXT NOT NULL,
  source_catalog TEXT,
  source_schema TEXT,
  source_table TEXT,
  source_column TEXT,
  source_record_id TEXT,
  source_value_hash TEXT NOT NULL,
  original_value TEXT,
  suggested_value TEXT,
  suggestion_method TEXT CHECK (
    suggestion_method IN ('regex', 'reference_lookup', 'model', 'manual', 'none')
  ),
  suggestion_explanation TEXT,
  validation_state TEXT NOT NULL DEFAULT 'unvalidated' CHECK (
    validation_state IN ('valid', 'invalid', 'unvalidated')
  ),
  state_context TEXT,
  district_context TEXT,
  citation JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'resolved', 'rejected', 'nullified', 'stale', 'reopened')
  ),
  corrected_value TEXT,
  notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  sync_run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_active_anomaly UNIQUE (
    facility_id,
    field_name,
    anomaly_type,
    source_record_id,
    source_value_hash
  )
);

CREATE TABLE IF NOT EXISTS data_readiness.review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flagged_record_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('created', 'suggested', 'reviewed', 'reopened', 'staled', 'note_added')
  ),
  previous_status TEXT,
  new_status TEXT,
  previous_value TEXT,
  new_value TEXT,
  actor_email TEXT NOT NULL,
  event_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_readiness.ai_assist_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flagged_record_id UUID NOT NULL,
  instruction TEXT NOT NULL,
  model_name TEXT NOT NULL,
  response_json JSONB NOT NULL,
  accepted BOOLEAN NOT NULL DEFAULT false,
  requested_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_readiness.shortlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id TEXT NOT NULL,
  facility_name TEXT NOT NULL,
  state TEXT,
  district TEXT,
  scope TEXT NOT NULL DEFAULT 'user' CHECK (scope IN ('user', 'scenario', 'global')),
  scenario_id UUID,
  notes TEXT,
  added_by TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_shortlist_entry UNIQUE (facility_id, scope, scenario_id, added_by)
);

CREATE TABLE IF NOT EXISTS data_readiness.scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Backend Plan

### Modify `server/routes/moderation-routes.ts`

Replace content moderation routes with Data Readiness routes. Keep the file or rename it to `readiness-routes.ts` as part of cleanup.

#### Startup

- Create the `data_readiness` schema and tables.
- Do not seed fake moderation data.
- Add non-destructive migration helpers for missing columns or new tables.
- Log setup failures with enough detail to debug Lakebase permissions.

#### Endpoints

- `POST /api/readiness/sync`
  - Starts or triggers an anomaly sync.
  - Requires authenticated actor.
  - Creates a `sync_runs` row.
  - Uses the approved sync architecture from the human review gate.
  - Upserts by `unique_active_anomaly`.
  - Preserves resolved/rejected/nullified records unless the source value changes; changed values become `reopened` or new rows according to the review decision.

- `GET /api/readiness/sync/latest`
  - Returns latest sync status, counts, timestamps, and errors.

- `GET /api/readiness/summary`
  - Returns counts by status and field queue.
  - Reads from Lakebase.

- `GET /api/readiness/queue/:fieldName`
  - Returns paginated anomaly records for one queue.
  - Supports filters: `status`, `state`, `district`, `facilityName`, `limit`, `offset`.

- `GET /api/readiness/records/:id`
  - Returns the full anomaly record, review events, AI assist events, and citation metadata.

- `POST /api/readiness/review`
  - Validates `recordId`, `decision`, `correctedValue`, and `notes`.
  - Writes the current row and appends `review_events`.
  - Uses `x-forwarded-email` for reviewer identity when present.

- `POST /api/readiness/assist`
  - Calls `databricks-gpt-5-4-mini`.
  - Uses a prompt that treats facility/source data and user instructions as untrusted input.
  - Requires strict JSON output:

    ```json
    {
      "suggested_value": "string or null",
      "should_nullify": false,
      "confidence": 0.0,
      "explanation": "short reason",
      "validation_notes": ["array of checks"]
    }
    ```

  - Validates the model output by field type before returning it.
  - Stores request/response in `ai_assist_events`.
  - Does not persist a correction until `/api/readiness/review` is called.

- Shortlist CRUD
  - `GET /api/shortlists`
  - `POST /api/shortlists`
  - `DELETE /api/shortlists/:id`

- Scenario CRUD
  - `GET /api/scenarios`
  - `POST /api/scenarios`
  - `PUT /api/scenarios/:id`
  - `DELETE /api/scenarios/:id`

### Update `server/server.ts`

- Rename route setup import to `setupReadinessRoutes`.
- Keep plugins aligned with actual usage: `analytics`, `genie`, `lakebase`, `server`.
- Add `serving()` only if AppKit model-serving proxy is used instead of direct Databricks REST calls.

---

## Frontend Plan

### Modify `client/src/App.tsx`

- Rebrand navigation and header to Data Readiness Desk.
- Routes:
  - `/` dashboard
  - `/queue/:fieldName` review queue
  - `/shortlist`
  - `/scenarios`
  - `/analytics`
- Remove content moderation-specific labels and links.

### Replace `SubmissionsPage.tsx` with `ReadinessDashboardPage.tsx`

- Show sync status, last sync time, total anomalies, pending, resolved, rejected, nullified, reopened, and stale.
- Show queue tiles for Zip Codes, Coordinates, State Names, Emails, Phones, and Districts.
- Include a guarded `Sync Data` action with loading, success, and failure states.
- Include clear empty states when no sync has run.

### Replace `SubmissionDetailPage.tsx` with `QueueReviewPage.tsx`

- Paginated review queue for a selected `fieldName`.
- Left side: original value, facility identity, state/district context, source table/column/record id, and citation metadata.
- Right side: suggested value, deterministic validation state, editable corrected value, notes, and actions.
- Actions:
  - save as resolved
  - reject suggestion
  - force NULL
  - skip
  - reopen if already reviewed
- AI assist panel:
  - instruction textarea
  - explicit "Get suggestion" button
  - returned suggestion does not auto-save
  - confidence/explanation shown alongside deterministic validation results

### Add `ShortlistPage.tsx`

- List shortlisted facilities.
- Filter by user/scope/scenario.
- Add/remove entries from facility records.

### Add `ScenariosPage.tsx`

- Create/edit/delete scenarios.
- Manage assumptions JSON through a structured form where possible.
- Show scenario-specific shortlists.

### Modify `AnalyticsPage.tsx`

- Point KPIs and charts to Data Readiness query keys.
- Update Genie prompts/examples to Data Readiness terminology.
- Include trust text near Genie output: generated answers should cite Data Readiness tables and may need human validation.

### Shared UI Components

- Keep or adapt badges:
  - `StatusBadge.tsx` for review statuses.
  - `TargetBadge.tsx` becomes `FieldBadge.tsx`.
  - `ScoreBadge.tsx` can become `ConfidenceBadge.tsx`.
- Add table loading, empty, and error states for every data-fetching view.

---

## Analytics Query Plan

Rename and rewrite SQL files:

- `config/queries/content_overview.sql` -> `config/queries/readiness_overview.sql`
  - total records
  - pending records
  - resolved records
  - rejected records
  - nullified records
  - reopened records
  - stale records
  - resolution rate

- `config/queries/submissions_by_target.sql` -> `config/queries/anomalies_by_queue.sql`
  - counts grouped by `field_name`
  - counts grouped by `status`

Required deployment follow-up:

- Register the Lakebase database as a Unity Catalog catalog for warehouse analytics.
- Update three-part names in SQL files to the confirmed catalog/schema/table.
- Grant the app service principal `USE CATALOG`, `USE SCHEMA`, and `SELECT`.
- Run `npm run typegen` after query updates and inspect generated types.

---

## Configuration and Documentation Plan

Update these files as part of the implementation:

- `package.json`
  - Rename package metadata from content moderator to Data Readiness Desk.

- `README.md`
  - Replace content moderation setup with Data Readiness setup.
  - Document required source tables.
  - Document Lakebase catalog registration for analytics.
  - Document model-serving endpoint configuration.

- `databricks.yml`
  - Rename bundle/app metadata if deploying as a new app.
  - Confirm required resources: SQL Warehouse, Genie Space, Lakebase Postgres.

- `app.yaml`
  - Keep `SERVING_ENDPOINT=databricks-gpt-5-4-mini` unless a different endpoint is approved.
  - Add any sync/job environment variables if the selected sync architecture needs them.

- `tests/smoke.spec.ts` if present
  - Replace content moderator selectors with Data Readiness selectors.

---

## Implementation Order

1. Confirm source tables, sync architecture, identity/PII rules, and scenario semantics.
2. Update Lakebase schema setup and route names.
3. Implement sync-run metadata and manual/demo sync with idempotent upsert behavior.
4. Implement summary, queue, record detail, review, AI assist, shortlist, and scenario endpoints.
5. Rebrand frontend navigation and page routes.
6. Build dashboard and queue review workflow.
7. Build shortlist and scenario pages.
8. Rewrite analytics SQL files and regenerate AppKit types.
9. Update README, app metadata, and deployment notes.
10. Update smoke tests and verification scripts.

---

## Verification Plan

### Local Automated Verification

- `npm run typecheck`
- `npm run lint`
- `npm run lint:ast-grep`
- `npm run build`
- `npm run typegen` after SQL query changes
- Run smoke tests after selectors are updated.

### Databricks Verification

- `databricks apps validate --profile <PROFILE>`
- Deploy to a dev target.
- Confirm app status is running.
- Confirm Lakebase schema creation succeeds.
- Confirm the service principal can read analytics SQL over the registered Lakebase catalog.
- Confirm the serving endpoint can be queried by the app service principal.

### Manual Verification

- Start from a clean Lakebase schema and load anomaly candidates.
- Run sync twice and confirm no duplicate active anomalies are created.
- Resolve a record, rerun sync, and confirm the review is preserved when the source value is unchanged.
- Change a source value or fixture, rerun sync, and confirm the expected `reopened` or new-version behavior.
- Test each queue: zip, coordinates, state, email, phone, district.
- Test AI assist with normal instructions and adversarial instructions.
- Confirm invalid AI output cannot be saved without deterministic validation or human override.
- Save resolved, rejected, and nullified reviews; reload the page and confirm state persists.
- Confirm review events are appended for every state-changing action.
- Confirm citations show source table, source column, and source record id.
- Confirm shortlist add/remove works.
- Confirm scenario create/edit/delete works according to approved semantics.
- Confirm analytics widgets and Genie use Data Readiness data, not old content moderation tables.

---

## Risks and Mitigations

- **Large source scans from the app can time out.** Prefer Lakeflow Job sync or bounded paginated sync.
- **AI can produce plausible but wrong corrections.** Use strict JSON, deterministic validators, citations, confidence display, and human save actions.
- **Existing reviews can be overwritten by sync.** Use stable anomaly keys, sync runs, review events, and explicit reopen/stale behavior.
- **Analytics type generation can fail if the Lakebase catalog is not registered or granted.** Update README and perform grants before `npm run typegen`.
- **PII exposure can be mishandled.** Confirm model-serving and retention policy before sending phone/email values to AI.
- **Scenario scope can grow quickly.** Implement minimal CRUD first, then add simulation outputs only after human-approved semantics.
