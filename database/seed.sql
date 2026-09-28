INSERT INTO reporting_periods (reporting_year, reporting_month)
SELECT 2026, month_number FROM generate_series(1, 12) AS month_number;

INSERT INTO dashboard_summaries (
  reporting_year, total_training_revenue, total_rebate_credit, hrdc_paid_to_slx,
  net_training_contribution, rebate_credit_used, unutilised_rebate_credit,
  rebate_utilisation_percent, number_of_trainings, total_participants
) VALUES (2026, 148525.44, 120314.00, 131255.04, 28211.44, 76909.00, 43405.00, 63.90, 7, 86);

INSERT INTO monthly_training_performance (reporting_period_id, training_revenue, rebate_issued, net_contribution, credit_used, remaining_credit, number_of_trainings)
SELECT rp.id, data.training_revenue, data.rebate_issued, data.net_contribution, data.credit_used, data.remaining_credit, data.number_of_trainings
FROM reporting_periods rp
JOIN (VALUES
  (1, 0.00, 0.00, 0.00, 0.00, 0.00, 0),
  (2, 0.00, 0.00, 0.00, 0.00, 0.00, 0),
  (3, 0.00, 0.00, 0.00, 0.00, 0.00, 0),
  (4, 25905.60, 20985.00, 4920.60, 11192.00, 9793.00, 1),
  (5, 17270.40, 13990.00, 3280.40, 13990.00, 0.00, 1),
  (6, 25905.60, 20985.00, 4920.60, 19586.00, 1399.00, 1),
  (7, 12089.28, 9793.00, 2296.28, 6995.00, 2798.00, 1),
  (8, 50084.16, 40571.00, 9513.16, 20967.00, 19604.00, 1),
  (9, 17027.40, 13990.00, 3280.40, 0.00, 13990.00, 1),
  (10, 0.00, 0.00, 0.00, 0.00, 0.00, 0),
  (11, 0.00, 0.00, 0.00, 0.00, 0.00, 0),
  (12, 0.00, 0.00, 0.00, 0.00, 0.00, 0)
) AS data(month_number, training_revenue, rebate_issued, net_contribution, credit_used, remaining_credit, number_of_trainings)
ON rp.reporting_year = 2026 AND rp.reporting_month = data.month_number;

INSERT INTO credit_usage_categories (name, display_order) VALUES
  ('Self-outstanding', 1),
  ('Monthly subscription', 2),
  ('Device + software', 3),
  ('Other', 4);

INSERT INTO credit_usage_records (reporting_period_id, category_id, amount_used, usage_count)
SELECT rp.id, cuc.id, data.amount_used, data.usage_count
FROM reporting_periods rp
JOIN (VALUES
  ('Self-outstanding', 36916.32, 5),
  ('Monthly subscription', 23841.79, 3),
  ('Device + software', 10767.26, 2),
  ('Other', 5383.63, 1)
) AS data(category_name, amount_used, usage_count) ON true
JOIN credit_usage_categories cuc ON cuc.name = data.category_name
WHERE rp.reporting_year = 2026 AND rp.reporting_month = 9;

INSERT INTO training_programs (reference_code, name, start_date, end_date, status) VALUES
  ('DM-2026-014', 'Digital Marketing Masterclass', '2026-06-10', '2026-06-12', 'completed'),
  ('LE-2026-009', 'Leadership Essentials', '2026-05-19', '2026-05-20', 'completed'),
  ('DL-2026-018', 'Data Literacy for Teams', '2026-07-14', '2026-07-15', 'in_review');
