// index.js
const express = require('express');
const app = express();
const port = 3000;

// Rota principal que exibe "API running" na tela
/*app.get('/', (req, res) => {
  res.send('API running');
});*/

app.use("/", (req, res) =>{
    res.send('API running');
})

// Inicia o servidor na porta especificada
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
