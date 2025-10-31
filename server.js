require('dotenv').config(); // load .env

const express = require('express');
const travelRoutes = require('./routes/travelRoutes');
const cors = require('cors');
const app = express();
app.use(
  cors({
    origin: [
        'https://poc.codedrivo.com',
      'http://localhost:5173',
      '*',
      'http://localhost:5174',
    ],
  }),
);
app.use(express.json());
app.get('/', (req, res) => {
    res.send('API is running!');
});
// Routes
app.use('/api/travel', travelRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
