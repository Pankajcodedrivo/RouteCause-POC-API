require('dotenv').config(); // load .env

const express = require('express');
const path = require("path");;
const rcaRoutes = require('./routes/rcaRoutes');
const cors = require('cors');
const app = express();
const __dirname = path.resolve();

app.use(
  cors({
    origin: [
        'https://aiqe.codedrivo.com',
      'http://localhost:5173',
      '*',
      'http://localhost:5174',
    ],
  }),
);
app.use(express.json({ limit: '1000mb' })); // allow up to 10MB
app.use(express.urlencoded({ limit: '1000mb', extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")))
app.get('/', (req, res) => {
    res.send('API is running!');
});
// Routes
app.use('/rca', rcaRoutes);
console.log(process.env.PORT);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
