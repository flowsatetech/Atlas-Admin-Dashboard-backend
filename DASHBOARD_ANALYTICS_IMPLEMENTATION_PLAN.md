# Dashboard + Analytics Implementation Plan

This checklist tracks the full backend work from foundation setup to complete API delivery for Dashboard and Analytics.

## 1. Foundation: Collections and Indexes

- [x] Add missing Mongo collections in `functions/db/index.js`:
- [x] `tasks`
- [x] `activityLogs`
- [x] `analyticsSnapshots`
- [x] `campaignStats`
- [x] Create indexes for performance:
- [x] `tasks`: `status`, `dueDate`, `assigneeId`, `projectId`
- [x] `activityLogs`: `createdAt`, `type`, `actorId`
- [x] `analyticsSnapshots`: `periodStart`, `periodEnd`
- [x] `campaignStats`: `campaignName`, `createdAt`

## 2. Foundation: DB Access Methods

- [x] Add DB methods for `tasks`:
- [x] create task
- [x] list/filter tasks
- [x] count pending tasks
- [x] count overdue tasks
- [x] Add DB methods for `activityLogs`:
- [x] create activity log
- [x] paginated activity list
- [x] Add DB methods for `analyticsSnapshots`:
- [x] upsert snapshot by period
- [x] query snapshots by date range
- [x] Add DB methods for `campaignStats`:
- [x] list campaigns with pagination/sorting
- [x] query campaign stats by date range

## 3. Foundation: Aggregation Helpers

- [x] Add helper utilities for:
- [x] period parsing (`7d`, `30d`, `3months`, `6months`, `12months`)
- [x] date bucket generation (daily/weekly/monthly labels)
- [x] month-over-month percentage calculation
- [x] safe rate calculation (avoid divide-by-zero)
- [x] trend direction mapping (`up`, `down`, `flat`)

## 4. Dashboard Data Contracts

- [x] Finalize response contracts for:
- [x] `GET /api/dashboard/metrics`
- [x] `GET /api/dashboard/performance`
- [x] `GET /api/dashboard/projects/in-progress`
- [x] `GET /api/dashboard/activities`
- [x] Standardize error format for dashboard routes.
- [x] Define default empty-state payloads for no-data cases.

## 5. Dashboard Implementation

- [x] Implement `GET /api/dashboard/metrics`:
- [x] total clients (current + previous period + change%)
- [x] active projects (current + previous period + change%)
- [x] pending tasks (current + previous period + change%)
- [x] new leads (current + previous period + change%)
- [x] Implement `GET /api/dashboard/performance`:
- [x] revenue series by period
- [x] new client series by period
- [x] Implement `GET /api/dashboard/projects/in-progress`:
- [x] filter active/in-progress projects
- [x] return project status label and progress %
- [x] Implement `GET /api/dashboard/activities`:
- [x] paginated recent activities
- [x] include actor info and relative timestamps

## 6. Analytics Data Contracts

- [x] Finalize response contracts for:
- [x] `GET /api/analytics/overview`
- [x] `GET /api/analytics/traffic`
- [x] `GET /api/analytics/sources`
- [x] `GET /api/analytics/campaigns`
- [x] `GET /api/analytics/distribution`
- [x] Define required query params and defaults.

## 7. Analytics Implementation

- [x] Implement `GET /api/analytics/overview`:
- [x] website visitors
- [x] page views
- [x] conversion rate
- [x] top traffic source
- [x] with trend percentages
- [x] Implement `GET /api/analytics/traffic`:
- [x] visits/page views/conversion trends by range
- [x] Implement `GET /api/analytics/sources`:
- [x] normalized traffic source percentages
- [x] Implement `GET /api/analytics/campaigns`:
- [x] campaign table with impressions/clicks/conversions/conversionRate
- [x] pagination/sorting support
- [x] Implement `GET /api/analytics/distribution`:
- [x] pie chart breakdown payload

## 8. Data Ingestion and Consistency

- [x] Add activity logging hooks in write operations:
- [x] client created
- [x] project created/updated
- [x] task created/updated
- [x] media uploaded
- [x] Add/update analytics snapshot write flow:
- [x] scheduled job or on-demand aggregation
- [x] Ensure consistent timezone handling for date bucketing.

## 9. Validation, Security, and Performance

- [x] Add zod validation for all dashboard/analytics query params.
- [x] Add route-level rate limiters for analytics endpoints.
- [x] Add DB projections to reduce payload size.
- [x] Add optional caching for heavy dashboard/analytics aggregations.

## 10. Swagger and Documentation

- [x] Add/refresh Swagger docs for all dashboard + analytics endpoints.
- [x] Add schema examples for chart/table payloads.
- [x] Add notes about auth requirements for each endpoint.

## 11. Testing and QA

- [ ] Add integration tests for:
- [ ] dashboard metrics + performance
- [ ] recent activities pagination
- [ ] analytics overview + campaigns
- [ ] Add fixtures/seed data for realistic dashboard/analytics outputs.
- [ ] Verify empty dataset behavior.
- [ ] Verify large dataset pagination and performance.

## 12. Delivery Checklist

- [ ] Confirm all endpoints return frontend-ready shape from provided UI.
- [ ] Confirm no placeholder values remain.
- [ ] Confirm Swagger is up to date.
- [ ] Confirm logs and errors are actionable.
- [ ] Final smoke test in local environment.

## Notes

- Keep this file updated as tasks move from pending to done.
- Execute in this order: foundation first, routes second, polish/testing last.
