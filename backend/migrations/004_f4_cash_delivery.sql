ALTER TABLE billing.payment_attempts ADD COLUMN cash_tender_cents bigint;
ALTER TABLE billing.payment_attempts ADD COLUMN cash_received_cents bigint;
ALTER TABLE billing.payment_attempts ADD CONSTRAINT cash_tender_covers_amount CHECK
  (cash_tender_cents IS NULL OR (method_code='cash' AND cash_tender_cents BETWEEN amount_cents AND 100000000000000));
ALTER TABLE billing.payment_attempts ADD CONSTRAINT cash_received_covers_amount CHECK
  (cash_received_cents IS NULL OR (method_code='cash' AND status='succeeded' AND cash_received_cents BETWEEN amount_cents AND 100000000000000));
ALTER TABLE delivery.assignments ADD COLUMN version integer NOT NULL DEFAULT 0 CHECK(version>=0);
CREATE FUNCTION delivery.version_assignment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.status<>OLD.status THEN NEW.version:=OLD.version+1;
  ELSIF NEW.version<>OLD.version THEN RAISE EXCEPTION 'Version changes with assignment status' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assignments_version BEFORE UPDATE ON delivery.assignments FOR EACH ROW EXECUTE FUNCTION delivery.version_assignment();
