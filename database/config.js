// config.js
module.exports = {
  database: {
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_LoQ5RBJjif2k@ep-still-meadow-a4hzplir-pooler.us-east-1.aws.neon.tech/neondb',
    ssl: { rejectUnauthorized: false }  // Assurer une configuration SSL uniforme
  }
};
