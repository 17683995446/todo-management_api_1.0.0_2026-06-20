fetch('http://localhost:80/health')
  .then((response) => process.exit(response.ok ? 0 : 1))
  .catch(() => process.exit(1))
