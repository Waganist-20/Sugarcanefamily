const app = require('./app');

const DEFAULT_PORT = 3000;
const PORT = Number(process.env.PORT || DEFAULT_PORT);

const server = app.listen(PORT, () => {
  console.log(`Sugarcane marketplace server running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try running with a different port, for example:\n  set PORT=3001 && node server.js`);
    process.exit(1);
  }
  throw err;
});
