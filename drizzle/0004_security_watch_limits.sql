-- Enforce quotas within D1's transaction, including concurrent requests.
-- Re-saving an existing watch is allowed even when the account is at its limit.
CREATE TRIGGER `watches_account_limit`
BEFORE INSERT ON `watches`
WHEN NOT EXISTS (
  SELECT 1 FROM watches WHERE user_id = NEW.user_id AND term = NEW.term AND section_id = NEW.section_id
) AND (
  (SELECT COUNT(*) FROM watches WHERE user_id = NEW.user_id) >= 40
  OR (
    NOT EXISTS (SELECT 1 FROM watches WHERE user_id = NEW.user_id AND term = NEW.term AND course_id = NEW.course_id)
    AND (SELECT COUNT(*) FROM (SELECT DISTINCT term, course_id FROM watches WHERE user_id = NEW.user_id)) >= 10
  )
)
BEGIN
  SELECT RAISE(ABORT, 'watch_limit');
END;
