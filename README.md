# Data Readiness Desk

Facility data readiness review desk with Lakebase-backed anomaly triage, human review workflows, analytics, Genie, and AI-assisted correction suggestions.

## Current Implementation

The app now creates a `data_readiness` Lakebase schema on startup and exposes:

- dashboard and queue review pages
- indicator review page for facility-to-health-indicator coverage problems
- demo anomaly sync via `POST /api/readiness/sync`
- demo indicator issue sync via `POST /api/indicator-reviews/sync`
- review persistence with audit events
- AI assist endpoint using `databricks-gpt-5-4-mini`
- shortlist and scenario CRUD
- analytics query files for readiness overview and anomalies by queue

`POST /api/readiness/sync` now runs a bounded whole-database warehouse scan when `DATABRICKS_HOST`, `DATABRICKS_WAREHOUSE_ID`, and auth are configured. It discovers reviewable tables in `READINESS_SOURCE_CATALOG`, samples recognized facility/contact/location columns, upserts anomalies into Lakebase, and preserves prior human decisions. Use `POST /api/readiness/sync?mode=demo` to load the original fixture. Indicator review still uses a bounded demo fixture until canonical indicator joins are finalized.

## Required Human Decisions

- Fully qualified source tables for facilities, pincode/zip reference, states, districts, coordinates, emails, and phones.
- Ingestion architecture: Lakeflow Job, app-triggered sync, or Lakebase synced source tables.
- PII rules for phone/email values sent to Model Serving and retained in Lakebase.
- Review semantics for reopened/stale records when upstream values change.
- Genie space reuse or creation for Data Readiness datasets.
- Scenario semantics and whether shortlists are user, global, or scenario scoped.

## Setup

Edit `databricks.yml` values:

```yaml
workspace:
  host: https://<workspace-host>
variables:
  sql_warehouse_id: <warehouse-id>
  genie_space_id: <genie-space-id>
  postgres_branch: projects/<project>/branches/<branch>
  postgres_database: projects/<project>/branches/<branch>/databases/<database>
```

Then:

```bash
npm install
npm run build
databricks bundle deploy --profile <PROFILE>
```

## Analytics Catalog

The analytics SQL files read:

```sql
data_readiness.data_readiness.flagged_records
```

Register the Lakebase database as a Unity Catalog catalog named `data_readiness`, or update `config/queries/*.sql` to the catalog name you choose. Grant the app service principal access before running type generation or deploying:

```sql
GRANT USE CATALOG ON CATALOG data_readiness TO `<sp-client-id>`;
GRANT USE SCHEMA ON SCHEMA data_readiness.data_readiness TO `<sp-client-id>`;
GRANT SELECT ON SCHEMA data_readiness.data_readiness TO `<sp-client-id>`;
```

## Verification

```bash
npm run typecheck
npm run lint
npm run lint:ast-grep
npm run build
databricks apps validate --profile <PROFILE>
```

Manual checks:

- Run Sync Data twice and confirm records are not duplicated.
- Run `POST /api/readiness/sync?mode=demo` if you need the prototype fixture instead of the warehouse scan.
- Resolve, reject, and nullify records, then reload and confirm state persists.
- Confirm AI Assist returns a suggestion but does not auto-save it.
- Confirm analytics and Genie use Data Readiness tables, not old content moderation tables.

## Whole-Database Scan Configuration

```bash
READINESS_SOURCE_CATALOG=databricks_virtue_foundation_dataset_dais_2026
# Optional: restrict to one schema.
READINESS_SOURCE_SCHEMA=default
READINESS_MAX_TABLES=50
READINESS_MAX_ROWS_PER_TABLE=1000
```

The scanner is intentionally bounded for app responsiveness. Increase limits cautiously, or move the same anomaly generation into a Lakeflow Job for full production-scale scans.
