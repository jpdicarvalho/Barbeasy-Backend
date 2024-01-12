// index.js
import express from 'express';
import cors from 'cors';
import 'dotenv/config'
import bodyParser from "body-parser";
import mysql from "mysql2";
import multer from 'multer';
import path from 'path';
import jwt  from 'jsonwebtoken';
import MercadoPago from "mercadopago";

const app = express();
const port = process.env.PORT || 3000;

// CORS Settings to Only Allow Frontend Deployment to Netlify
const corsOptions = {
  origin: 'https://barbeasy.netlify.app',
  optionsSuccessStatus: 200, // Some browser versions may need this code
};
app.use(cors(corsOptions));
app.use(cors());

app.use(express.json());
app.use(bodyParser.json());

// Create the connection to the database mysql on PlanetScale
const db = mysql.createConnection(process.env.DATABASE_URL)

// Verify connection to the database
db.connect((error) => {
  if (error) {
    console.error('Erro ao conectar ao banco de dados:', error.message);
  } else {
    console.log('Conexão bem-sucedida ao banco de dados!');
  }
});

//Route show "API running"
app.get('/', (req, res) => {
  console.log('API running');
  res.send('API running');
});
//ROTAS USER-CLIENT-BARBEARIA
// Cadastro de usuário com senha criptografada
app.post("/SignUp", async (req, res) => {
  const { name, email, senha, celular } = req.body;

  // Verificação se o e-mail ou o número de celular já estão cadastrado
  db.query('SELECT * FROM user WHERE email = ? OR celular = ?', [email, celular], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Erro ao verificar o e-mail ou o número de celular');
    }

    // Se houver resultados, significa que o e-mail ou o número de celular já estão cadastrado
    if (results.length > 0) {
      const existingUser = results[0];
      if (existingUser.email === email) {
        return res.status(400).send('E-mail já cadastrado. Por favor, escolha outro e-mail.');
      } else if (existingUser.celular === celular) {
        return res.status(400).send('Número de celular já cadastrado. Por favor, escolha outro número.');
      }
    }
   
    const user = {
      name,
      email,
      senha,
      celular
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
});

//Realizando Login e Gerando Token de autenticação
app.post('/SignIn', async (req, res) => {
  const {email, senha} = req.body;

  // Buscar usuário pelo email
  db.query('SELECT * FROM user WHERE email = ? AND senha = ?', [email, senha],
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
      console.error(err);
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

//ROTAS USER-BARBEARIA

//Cadastro de ususário Barbearia
app.post("/SignUp_Barbearia", async (req, res) => {
  const { name, email, usuario, senha, endereco } = req.body;

  // Verificação se o e-mail já está cadastrado
  db.query('SELECT * FROM barbearia WHERE email = ?', [email], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Erro ao verificar o e-mail');
    }

    // Se já houver resultados, significa que o e-mail já está cadastrado
    if (results.length > 0) {
      return res.status(400).send('E-mail já cadastrado. Por favor, escolha outro e-mail.');
    }

    // Hash da senha antes de salvar no banco de dados
    const barbearia = {
      name,
      email,
      usuario,
      senha,
      status: 'Fechado',
      endereco
    };

    // Inserção no banco de dados
    db.query('INSERT INTO barbearia SET ?', barbearia, (error, results) => {
      if (error) {
        console.error(error);
        return res.status(500).send('Erro ao registrar usuário');
      }

      res.status(201).send('Usuário registrado com sucesso');
    });
  });
});

//Realizando Login e Gerando Token de autenticação
app.post('/SignIn_Barbearia', async (req, res) => {
  const {email, senha} = req.body;

  // Buscar usuário pelo email
  db.query('SELECT * FROM barbearia WHERE email = ? AND senha = ?', [email, senha],
  (err, result) => {
    if(err){
      res.send({err: err});
    }
    if (result.length > 0) {
      const barbearia = result[0];
      // Criação do token
      const token = jwt.sign({ barbeariaId: barbearia.id, barbeariaEmail: barbearia.email }, process.env.tokenWordSecret, { expiresIn: "1h" });
      // Envie o token no corpo da resposta
      res.status(200).json({ success: true, token: token, barbearia: result });
      
    } else {
      // Usuário não encontrado
      res.status(404).json({success: false, message: 'Usuário não encontrado'});
    }
  });
});

//Upload de Imagem de Usuário
// Configuração do Multer para armazenar as imagens no diretório 'uploads'
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // The directory where uploaded files will be stored
  },
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage });

// Endpoint for uploading user image
app.post('/uploadImageUser', upload.single('userImage'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  const imagePath = path.join(__dirname, 'uploads', req.file.filename);

  // Assume you have a 'users' table in your database
  const userId = 1; // Replace with the actual user ID

  // Update the 'profile_image' column with the file path in the 'users' table
  const updateQuery = 'UPDATE images SET profile_img = ? WHERE id = ?';

  db.query(updateQuery, [imageUrl, userId], (updateErr, updateResults) => {
    if (updateErr) {
      console.error('Error updating user image in the database:', updateErr);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    return res.json({ imageUrl });
  });
});



// Inicia o servidor na porta especificada
app.listen(port, () => {
    console.log("Servidor rodando");
  });
