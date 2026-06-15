SELECT
  COUNT(*) AS total_records,
  SUM(CASE WHEN status IN ('pending', 'reopened') THEN 1 ELSE 0 END) AS pending_count,
  SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
  SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
  SUM(CASE WHEN status = 'nullified' THEN 1 ELSE 0 END) AS nullified_count,
  SUM(CASE WHEN status = 'stale' THEN 1 ELSE 0 END) AS stale_count,
  ROUND(
    100.0 * SUM(CASE WHEN status IN ('resolved', 'rejected', 'nullified') THEN 1 ELSE 0 END)
    / NULLIF(COUNT(*), 0),
    0
  ) AS resolution_rate
FROM data_readiness.data_readiness.flagged_records
