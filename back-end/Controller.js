import 'dotenv/config'
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import mysql from "mysql";
import jwt  from 'jsonwebtoken';
import MercadoPago from "mercadopago";


const app = express();

app.use(express.json());
app.use(bodyParser.json());
app.use(cors());

//Create conection with BD MySQL
const db = mysql.createConnection({
  host: process.env.database_Host,
  user: process.env.database_User,
  password: process.env.database_Password,
  database: process.env.database_Name
});

/*Send rest to Api-Distance-Matrix-Google
app.post('/reqApiGoogle', async (req, res) => {
    try {
      const apiKey = 'AIzaSyD-reRtGdFi5iiZqqVUeIjAt0HoY4SxNRY';
      const {latUser, lonUser, coordenadasBarbearias } = req.body;
      // Criar um array de strings formatadas para as coordenadas das barbearias
      const destinations = coordenadasBarbearias.map(coord => `${coord.latitude}%2C${coord.longitude}`).join('%7C');

      const apiUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?destinations=${destinations}&origins=${latUser}%2C${lonUser}&mode=walking&key=${apiKey}`;
    
      const response = await fetch(apiUrl);
      const data = await response.json();

      res.json(data);
      //res.send(JSON.stringify(data.rows));
    } catch (error) {
      console.error('Erro na solicitação à API Distance Matrix:', error);
      res.status(500).json({ error: 'Erro na solicitação à API Distance Matrix' });
    }
    
});*/

//Cadastro de ususário com senha criptografada
app.post("/SingUp", async (req, res) => {
  const {name, email, senha} = req.body;

  // Hash da senha antes de salvar no banco de dados
  const user = {
    name,
    email,
    senha
  };

  db.query('INSERT INTO user SET ?', user, (error, results) => {
    if (results) {
      res.status(201).send('Usuário registrado com sucesso');
    } else {
      console.error(error);
      res.status(500).send('Erro ao registrar usuário');
    }
  });
});

//Realizando Login e Gerando Token de autenticação
app.post('/SignIn', async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  // Buscar usuário pelo email
  db.query('SELECT * FROM user WHERE email = ? AND senha = ?', [email, password],
  (err, result) => {
    if(err){
      res.send({err: err});
    }
    if (result.length > 0) {
      const user = result[0];
      // Criação do token
      const token = jwt.sign({ userId: user.id, userEmail: user.email }, process.env.tokenWordSecret, { expiresIn: "1h" });
      // Envie o token no corpo da resposta
      res.status(200).json({ success: true, token: token, user: result });
      
    } else {
      // Usuário não encontrado
      res.status(404).json({success: false, message: 'Usuário não encontrado'});
    }
  });
});

//listando as barbearias cadastradas
app.get('/listBarbearia', async (req, res) => {
  try {
    db.query('SELECT * FROM barbearia', (err, rows) => {
      if (err) throw err;
      res.json(rows);
    });
  } catch (error) {
    console.error('Erro ao obter os registros:', error);
    res.status(500).json({ success: false, message: 'Erro ao obter os registros' });
  }
});

/*listando os Serviços cadastrados pelas barbearias*/
app.get('/listServico', async (req, res)=>{
  try {
    db.query('SELECT * FROM servico', (err, rows) => {
      if (err) throw err;
      res.json(rows);
    });
    } catch (error) {
      console.error('Erro ao obter os registros:', error);
    }
});

//Cadastrando a avaliação do usuário
app.post("/avaliacao", (req, res) => {
  const sql = "INSERT INTO avaliacoes (`user_name`,`barbearia_id`, `estrelas`, `comentarios`, `data_avaliacao`) VALUES (?)";
  const values = [
    req.body.userName,
    req.body.barbeariaId,
    req.body.avaliacao,
    req.body.comentario,
    req.body.data_avaliacao
  ]
  db.query(sql, [values], (err, result) => {
    if (err) {
      res.status(500).json({ success: false, message: 'Erro ao registrar avaliação' });
    } else {
      res.status(201).json({ success: true, message: 'Avaliação registrada com sucesso' });
    }
  });
});

//Buscando a avaliação da barbearia em especifico
app.get('/SearchAvaliation', async(req, res)=>{
  try {
    db.query('SELECT * FROM avaliacoes', (err, rows) => {
      if (err) throw err;
      res.json(rows);
    });
    } catch (error) {
      console.error('Erro ao obter os registros:', error);
    }
});

//Salvando o agendamento feito pelo cliente
app.post('/agendamento', (req, res) => {
  const { selectedDate, selectedTime, selectedService, barbeariaId, userId} = req.body;
  db.query('INSERT INTO agendamentos (dia_agendamento, horario, user_id, barbearia_id, servico_id) VALUES (?, ?, ?, ?, ?)', 
    [selectedDate, selectedTime, userId, barbeariaId, selectedService], 
    (err, results) => {
      if (err) {
        console.error('Erro ao inserir os dados:', err);
        res.status(500).json({ message: 'Erro ao inserir os dados' });
        return;
      }
      res.json({ message: 'Agendamento criado com sucesso' });
  });
});

//RoutesPayment
app.post('/Checkout', async (req, res) => {
  //set API Mercago Pago
  const client = new MercadoPago.MercadoPagoConfig({
    accessToken: process.env.accessTokenMercadoPago,
  });
  
  const preference = new MercadoPago.Preference(client);

  //create preferences
  let body = {
    items:[{
          title: req.body.nameServico,
          quantity: 1,
          currency_id: 'BRL',
          description: req.body.DescricaoServico,
          unit_price: parseFloat(req.body.preco)
    }],
    payer:{
      email: "demo@gmail.com"
    },
    payment_methods:{
      installments:3
    },
    "back_urls": {
      "success": "http://localhost:5173/",
      "failure": "http://localhost:5173/failure",
      "pending": "http://localhost:5173/pending"
  },
  "auto_return": "approved",
  };
  preference.create({ body }).then(function (data) {
    res.send(JSON.stringify(data.init_point));
    //console.log(data);
   }).catch(function (error){
     console.log(error);
   });
 });

app.listen({
  host: '0.0.0.0',
  port: process.env.portServerNode ?? 8080
});