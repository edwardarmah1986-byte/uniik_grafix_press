const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// ============================
// MIDDLEWARE
// ============================
app.use(cors());

app.use(express.json());

app.use(express.static(
  path.join(__dirname, 'public')
));

// ============================
// ROUTES
// ============================
app.use('/api', require('./routes/auth'));

app.use('/api', require('./routes/orders'));

app.use('/api', require('./routes/materials'));

app.use('/api', require('./routes/analytics'));

// ============================
// SERVER
// ============================
const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    `🚀 Server running on port ${PORT}`
  );

});