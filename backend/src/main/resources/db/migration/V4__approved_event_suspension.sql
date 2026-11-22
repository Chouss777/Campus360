-- D01 explicitly extends StatutEvenement with temporary administrative suspension.
ALTER TABLE evenement DROP CONSTRAINT evenement_statut_check;
ALTER TABLE evenement ADD CONSTRAINT evenement_statut_check
    CHECK (statut IN ('BROUILLON', 'PUBLIE', 'ANNULE', 'SUSPENDU'));
