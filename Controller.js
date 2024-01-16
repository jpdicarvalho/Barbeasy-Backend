// index.js
import express from 'express';
import cors from 'cors';
import bodyParser from "body-parser";

import mysql from "mysql2";

import jwt  from 'jsonwebtoken';
import MercadoPago from "mercadopago";

import multer from 'multer';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import 'dotenv/config'

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
//Set multer
const storage = multer.memoryStorage()
const upload = multer({storage: storage})

//Set AWS S3
const awsBucketName = process.env.AWS_S3_BUCKET_NAME
const awsRegion = process.env.AWS_REGION
const awsAccessKey = process.env.AWS_ACCESS_KEY_ID
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

const s3 = new S3Client({
  credentials:{
    accessKeyId: awsAccessKey,
    secretAccessKey: awsSecretAccessKey,
  },
  region: awsRegion
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

//Upload de Imagem de Usuário na AWS S3
app.post('/api/upload-image-user-barbearia', upload.single('image'), (req, res) => {
  const barbeariaId = req.body.barbeariaId;
  const newImageUser = req.file.originalname;
  console.log('id da barbearia',barbeariaId)
  //Verifica se o usuário possuí imagem cadastrada
  const verifyImage = "SELECT * from images WHERE barbearia_id = ?";
  db.query(verifyImage, [barbeariaId], (err, result) =>{
    //Mensagem de erro caso não seja possuível realizar a consulta no Banco de Dados
    if(err){
      console.error('Error on verification image:', err);
      return res.status(500).json({ error: 'Verify Image - Internal Server Error' });
    }else{
      if(result.length > 0){
        //Update da imagem cadastrada no Banco de Dados
        const sql = "UPDATE images SET user_image = ? WHERE barbearia_id = ?";
        db.query(sql, [newImageUser, barbeariaId], (updateErr, updateResult) => {
          if (updateErr) {
            //Mensagem de erro caso não seja possuível realizar a atualização da imagem no Banco de Dados
            console.error('Error on Update Image:', updateErr);
            return res.status(500).json({ error: 'Update Image - Internal Server Error' });
          }else{
              // Cria os parâmetros para enviar a imagem para o bucket da AWS S3
              const params = {
              Bucket: awsBucketName,
              Key: newImageUser,
              Body: req.file.buffer,
              ContentType: req.file.mimetype,
            }

            // Cria um comando PutObject para enviar o arquivo para o AWS S3
            const command = new PutObjectCommand(params)

            // Envia o comando para o Amazon S3 usando a instância do serviço S3
            s3.send(command)

            //Mensagem de sucesso referente atualização da imagem no Banco de Dados
            return res.status(200).json({ Status: "Success" });
          }
        });
      }else{
        // Cadastra a imagem no Banco de Dados caso o usuário não possua nenhuma imagem
        const insertImageQuery = "INSERT INTO images (barbearia_id, user_image) VALUES (?, ?)";
        db.query(insertImageQuery, [barbeariaId, newImageUser], (insertErr, insertResult) => {
          if (insertErr) {
            //Mensagem de erro caso não seja possuível realizar o cadastro no Banco de Dados
            console.error('Erro ao inserir imagem no banco de dados:', insertErr);
            return res.status(500).json({ error: 'Insert Image - Internal Server Error' });
          }else{
            // Cria os parâmetros para enviar a imagem para o bucket da AWS S3
            const params = {
              Bucket: awsBucketName,
              Key: newImageUser,
              Body: req.file.buffer,
              ContentType: req.file.mimetype,
            }

            // Cria um comando PutObject para enviar o arquivo para o AWS S3
            const command = new PutObjectCommand(params)

            // Envia o comando para o Amazon S3 usando a instância do serviço S3
            s3.send(command)
            //Mensagem de sucesso referente atualização da imagem no Banco de Dados
            return res.status(200).json({ Status: "Success" });
          }
        });
      }
    }
  })
});



// Inicia o servidor na porta especificada
app.listen(port, () => {
    console.log("Servidor rodando");
  });
