const request = require('supertest');
const { app, pool } = require('./server');

// Mock complet de pg avec toutes les méthodes nécessaires
jest.mock('pg', () => {
  const mClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  const mPool = {
    connect: jest.fn().mockResolvedValue(mClient),
    query: jest.fn(),
    on: jest.fn(), // Ajouté pour gérer les événements
    end: jest.fn(),
  };

  return { Pool: jest.fn(() => mPool) };
});

describe('Microservice Paiement', () => {
  let client;

  beforeAll(() => {
    // Initialisation des mocks
    client = {
      query: jest.fn(),
      release: jest.fn(),
    };
    
    pool.connect.mockResolvedValue(client);
    pool.on.mockImplementation((event, callback) => {
      if (event === 'error') {
        // Simulation basique pour les erreurs de connexion
        callback(new Error('Erreur de connexion simulée'));
      }
    });
  });

  beforeEach(() => {
    // Réinitialisation et configuration de base pour chaque test
    jest.clearAllMocks();
    
    // Configuration par défaut
    client.query.mockResolvedValue({ rows: [] });
    pool.query.mockImplementation((query) => {
      if (query === 'SELECT 1') return Promise.resolve({ rows: [{}] }); // Pour le middleware
      if (query === 'SELECT NOW()') return Promise.resolve({ rows: [{ now: new Date() }] }); // Pour testConnection
      return Promise.resolve({ rows: [] });
    });
  });

  describe('GET /api/health', () => {
    it('devrait retourner 200 et le statut OK', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.body).toEqual({
        status: 'OK',
        timestamp: expect.any(String),
        database: 'Connected'
      });
    });
  });

  describe('POST /api/paiements', () => {
    const validPayment = {
      montant: 100,
      mode_paiement: 'credit',
      client_email: 'test@example.com',
      client_name: 'Test User',
      trajet: 'Paris-Lyon'
    };

    it('devrait créer un paiement valide (201)', async () => {
      // Mock spécifique pour l'INSERT
      const mockPayment = {
        id: 1,
        montant: 100,
        statut: 'completed',
        created_at: new Date().toISOString()
      };

      pool.query.mockImplementationOnce(() => Promise.resolve({ rows: [{}] })) // SELECT 1
             .mockImplementationOnce(() => Promise.resolve({ rows: [mockPayment] })); // INSERT

      const response = await request(app)
        .post('/api/paiements')
        .send(validPayment)
        .expect(201);
      
      expect(response.body).toEqual({
        success: true,
        payment: expect.objectContaining({
          id: 1,
          montant: 100,
          statut: 'completed'
        }),
        receipt_url: expect.stringContaining('/api/paiements/1/receipt')
      });
    });

    it('devrait refuser un montant invalide (400)', async () => {
      const response = await request(app)
        .post('/api/paiements')
        .send({ ...validPayment, montant: 'invalid' })
        .expect(400);
      
      expect(response.body.error).toMatch(/montant doit être un nombre/);
    });

    it('devrait gérer les erreurs SQL (500)', async () => {
      pool.query.mockImplementationOnce(() => Promise.resolve({ rows: [{}] })) // SELECT 1
             .mockImplementationOnce(() => Promise.reject(new Error('Erreur SQL'))); // INSERT

      const response = await request(app)
        .post('/api/paiements')
        .send(validPayment)
        .expect(500);
      
      expect(response.body.error).toBe('Erreur base de données');
    });
  });

  describe('Gestion des erreurs', () => {
    it('devrait retourner 404 pour route inexistante', async () => {
      const response = await request(app)
        .get('/inexistant')
        .expect(404);
      
      expect(response.body.error).toBe('Endpoint non trouvé');
    });
  });
});