const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3333;

// Serve static files from current directory
app.use(express.static(path.join(__dirname)));

// Start server
app.listen(PORT, () => {
    console.log(`🎵 server running at http://localhost:${PORT}`);
});