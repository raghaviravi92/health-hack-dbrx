SELECT
  field_name,
  COUNT(*) AS total_count,
  SUM(CASE WHEN status IN ('pending', 'reopened') THEN 1 ELSE 0 END) AS remaining_count,
  SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count,
  SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
  SUM(CASE WHEN status = 'nullified' THEN 1 ELSE 0 END) AS nullified_count
FROM data_readiness.data_readiness.flagged_records
GROUP BY field_name
ORDER BY remaining_count DESC, field_name ASC
