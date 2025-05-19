require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const port = process.env.PORT || 3002;

// Middleware
app.use(morgan('dev'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Configuration de la base de données
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://neondb_owner:npg_LoQ5RBJjif2k@ep-still-meadow-a4hzplir-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 20
});

// Gestion des erreurs de connexion
pool.on('error', (err) => {
  console.error('Erreur de connexion à la base de données:', err);
});

// Test de connexion à la base (modifié pour les tests)
async function testConnection() {
  if (process.env.SKIP_DB_CONNECTION === 'true') {
    console.log('Skipping DB connection in test mode');
    return;
  }

  let client;
  try {
    client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    console.log('Connexion à la base réussie:', res.rows[0]);
  } catch (err) {
    console.error('Échec de connexion à la base:', err);
    if (process.env.NODE_ENV !== 'test') process.exit(1);
    throw err; // Pour les tests
  } finally {
    if (client) client.release();
  }
}

// Middleware de vérification de la base
app.use(async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    next();
  } catch (err) {
    console.error('Erreur de base de données:', err);
    res.status(503).json({
      success: false,
      error: 'Service indisponible',
      message: 'Problème de connexion à la base'
    });
  }
});

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: 'Connected'
  });
});

// Nouvelle Route de paiement optimisée
app.post('/api/paiements', async (req, res) => {
  const requiredFields = {
    montant: 'number',
    mode_paiement: "['credit','debit']",
    client_email: 'string',
    client_name: 'string',
    trajet: 'string'
  };

  // Validation améliorée
  for (const [field, type] of Object.entries(requiredFields)) {
    if (!req.body[field]) {
      return res.status(400).json({
        error: `Champ manquant: ${field}`,
        details: `Type attendu: ${type}`
      });
    }
  }

  // Validation supplémentaire
  if (isNaN(req.body.montant)) {
    return res.status(400).json({
      error: 'Le montant doit être un nombre',
      details: `Reçu: ${typeof req.body.montant}`
    });
  }

  if (!['credit', 'debit'].includes(req.body.mode_paiement)) {
    return res.status(400).json({
      error: 'Mode de paiement invalide',
      details: 'Doit être "credit" ou "debit"'
    });
  }

  try {
    const { rows } = await pool.query(`
      INSERT INTO paiements (
        montant, mode_paiement, client_email, 
        client_name, trajet, card_last4, card_brand, statut
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
      RETURNING id, montant, statut, created_at
    `, [
      Number(req.body.montant),
      req.body.mode_paiement,
      req.body.client_email,
      req.body.client_name,
      req.body.trajet,
      req.body.card_last4?.replace(/\D/g, '').slice(-4),
      req.body.card_brand || null
    ]);

    console.log('Paiement enregistré:', rows[0]);
    
    res.status(201).json({
      success: true,
      payment: rows[0],
      receipt_url: `/api/paiements/${rows[0].id}/receipt`
    });

  } catch (error) {
    console.error('Erreur SQL:', {
      message: error.message,
      stack: error.stack,
      query: error.query
    });
    
    res.status(500).json({
      success: false,
      error: 'Erreur base de données',
      details: process.env.NODE_ENV === 'development' 
        ? error.message 
        : undefined,
      code: error.code
    });
  }
});

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint non trouvé',
    availableEndpoints: [
      '/api/health (GET)',
      '/api/paiements (POST)'
    ]
  });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('Erreur globale:', err);
  res.status(500).json({
    success: false,
    error: 'Erreur interne du serveur',
    timestamp: new Date().toISOString()
  });
});

// Démarrer le serveur conditionnellement
let server;
if (require.main === module) {
  testConnection().then(() => {
    server = app.listen(port, () => {
      console.log(`Serveur de paiement démarré sur http://localhost:${port}`);
      console.log(`Environnement: ${process.env.NODE_ENV || 'development'}`);
      console.log('Configuration CORS:', {
        origin: process.env.FRONTEND_URL || 'http://localhost:8080'
      });
    });
  }).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

// Export pour les tests
module.exports = {
  app,
  pool,
  start: async () => {
    await testConnection();
    if (!server) {
      server = app.listen(port);
    }
    return server;
  },
  stop: async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await pool.end();
  },
  testConnection
};