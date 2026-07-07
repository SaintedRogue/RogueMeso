-- Remove the wellness snapshot feature (watch collector + server ingestion removed).
-- Only held throwaway test snapshots; dropping the table with them is intentional.
-- The index and the userId FK drop with the table.

-- DropTable
DROP TABLE "WellnessSnapshot";
