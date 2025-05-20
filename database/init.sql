-- Création de la table des paiements (Si elle n'existe pas déjà)
CREATE TABLE IF NOT EXISTS paiements (
    id SERIAL PRIMARY KEY,
    reservation_id INTEGER NOT NULL,
    montant DECIMAL(10, 2) NOT NULL,
    mode_paiement VARCHAR(50) NOT NULL,
    date_paiement TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    statut VARCHAR(20) DEFAULT 'en cours'
);
