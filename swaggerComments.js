/**
 * @swagger
 * /api/SignUp:
 *   post:
 *     summary: Cadastro de usuário com senha criptografada
 *     description: Rota utilizada para registrar um novo usuário com informações criptografadas.
 *     tags:
 *       - User-Client-Barbearia
 *     parameters:
 *       - in: body
 *         name: user
 *         description: Dados do usuário a serem cadastrados.
 *         required: true
 *         schema:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               description: Nome do usuário.
 *             email:
 *               type: string
 *               format: email
 *               description: Endereço de e-mail do usuário.
 *             senha:
 *               type: string
 *               format: password
 *               description: Senha do usuário (criptografada).
 *             celular:
 *               type: string
 *               description: Número de celular do usuário.
 *     responses:
 *       201:
 *         description: Usuário registrado com sucesso.
 *       400:
 *         description: E-mail ou número de celular já cadastrado.
 *       500:
 *         description: Erro interno do servidor ao registrar usuário.
 */
/**
 * @swagger
 * /api/SignIn:
 *   post:
 *     summary: Realizando Login e Gerando Token de autenticação
 *     description: Rota utilizada para autenticar um usuário e gerar um token de autenticação.
 *     tags:
 *       - User-Client-Barbearia
 *     parameters:
 *       - in: body
 *         name: userCredentials
 *         description: Credenciais de login do usuário.
 *         required: true
 *         schema:
 *           type: object
 *           properties:
 *             email:
 *               type: string
 *               format: email
 *               description: Endereço de e-mail do usuário.
 *             senha:
 *               type: string
 *               format: password
 *               description: Senha do usuário.
 *     responses:
 *       200:
 *         description: Usuário autenticado com sucesso. Retorna um token de autenticação.
 *       404:
 *         description: Usuário não encontrado.
 *       500:
 *         description: Erro interno do servidor ao autenticar usuário.
 */
/**
 * @swagger
 * /api/listBarbearia:
 *   get:
 *     summary: Listando as barbearias cadastradas
 *     description: Rota utilizada para obter uma lista de todas as barbearias cadastradas no sistema.
 *     tags:
 *       - User-Client-Barbearia
 *     responses:
 *       200:
 *         description: Lista de barbearias obtida com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: ID da barbearia.
 *                   nome:
 *                     type: string
 *                     description: Nome da barbearia.
 *                   endereco:
 *                     type: string
 *                     description: Endereço da barbearia.
 *                   telefone:
 *                     type: string
 *                     description: Número de telefone da barbearia.
 *       500:
 *         description: Erro interno do servidor ao obter a lista de barbearias.
 */
/**
 * @swagger
 * /api/listServico:
 *   get:
 *     summary: Listando os Serviços cadastrados pelas barbearias
 *     description: Rota utilizada para listar os serviços cadastrados pelas barbearias.
 *     tags:
 *       - User-Client-Barbearia
 *     responses:
 *       200:
 *         description: Lista de serviços cadastrados pelas barbearias.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: ID do serviço.
 *                   nome:
 *                     type: string
 *                     description: Nome do serviço.
 *                   descricao:
 *                     type: string
 *                     description: Descrição do serviço.
 *                   preco:
 *                     type: number
 *                     description: Preço do serviço.
 *       500:
 *         description: Erro interno do servidor ao listar serviços.
 */
/**
 * @swagger
 * /api/avaliacao:
 *   post:
 *     summary: Cadastrando a avaliação do usuário
 *     description: Rota utilizada para cadastrar a avaliação do usuário sobre uma barbearia.
 *     tags:
 *       - User-Client-Barbearia
 *     parameters:
 *       - in: body
 *         name: Avaliação
 *         description: Objeto contendo os dados da avaliação do usuário.
 *         required: true
 *         schema:
 *           type: object
 *           properties:
 *             userName:
 *               type: string
 *               description: Nome do usuário que está fazendo a avaliação.
 *             barbeariaId:
 *               type: integer
 *               description: ID da barbearia que está sendo avaliada.
 *             avaliacao:
 *               type: integer
 *               description: Avaliação em estrelas (de 1 a 5) dada pelo usuário.
 *             comentario:
 *               type: string
 *               description: Comentário sobre a experiência na barbearia.
 *             data_avaliacao:
 *               type: string
 *               description: Data da avaliação.
 *     responses:
 *       201:
 *         description: Avaliação registrada com sucesso.
 *       500:
 *         description: Erro interno do servidor ao registrar avaliação.
 */
/**
 * @swagger
 * /api/SearchAvaliation:
 *   get:
 *     summary: Buscando a avaliação da barbearia em específico
 *     description: Rota utilizada para buscar as avaliações de uma barbearia específica.
 *     tags:
 *       - User-Client-Barbearia
 *     parameters:
 *       - in: query
 *         name: barbeariaId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID da barbearia para a qual deseja-se obter as avaliações.
 *     responses:
 *       200:
 *         description: Lista de avaliações da barbearia obtida com sucesso.
 *       500:
 *         description: Erro interno do servidor ao buscar as avaliações da barbearia.
 */
/**
 * @swagger
 * /api/SignUp-Barbearia:
 *   post:
 *     summary: Cadastro de usuário Barbearia
 *     description: Rota utilizada para registrar uma nova barbearia.
 *     tags:
 *       - User-Barbearia
 *     parameters:
 *       - in: body
 *         name: barbearia
 *         description: Dados da barbearia a serem cadastrados.
 *         required: true
 *         schema:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               description: Nome da barbearia.
 *             email:
 *               type: string
 *               format: email
 *               description: Endereço de e-mail da barbearia.
 *             usuario:
 *               type: string
 *               description: Nome de usuário da barbearia.
 *             senha:
 *               type: string
 *               format: password
 *               description: Senha da barbearia (criptografada).
 *             endereco:
 *               type: string
 *               description: Endereço da barbearia.
 *     responses:
 *       201:
 *         description: Barbearia registrada com sucesso.
 *       400:
 *         description: E-mail já cadastrado. Por favor, escolha outro e-mail.
 *       500:
 *         description: Erro interno do servidor ao registrar barbearia.
 */
/**
 * @swagger
 * /api/SignIn-Barbearia:
 *   post:
 *     summary: Realizando Login e Gerando Token de autenticação
 *     description: Rota utilizada para autenticar uma barbearia e gerar um token de autenticação.
 *     tags:
 *       - User-Barbearia
 *     parameters:
 *       - in: body
 *         name: barbeariaLogin
 *         description: Dados de login da barbearia.
 *         required: true
 *         schema:
 *           type: object
 *           properties:
 *             email:
 *               type: string
 *               format: email
 *               description: Endereço de e-mail da barbearia.
 *             senha:
 *               type: string
 *               format: password
 *               description: Senha da barbearia.
 *     responses:
 *       200:
 *         description: Barbearia autenticada com sucesso. Retorna um token de autenticação.
 *       404:
 *         description: Barbearia não encontrada.
 *       500:
 *         description: Erro interno do servidor ao autenticar barbearia.
 */
/**
 * @swagger
 * /api/upload-image-user-barbearia:
 *   post:
 *     summary: Upload de Imagem do Usuário Barbearia, na AWS S3
 *     description: Rota utilizada para realizar o upload de imagem do usuário barbearia para o AWS S3.
 *     tags:
 *       - User-Barbearia
 *     parameters:
 *       - in: formData
 *         name: image
 *         description: Arquivo de imagem a ser enviado.
 *         required: true
 *         type: file
 *       - in: formData
 *         name: barbeariaId
 *         description: ID da barbearia associada à imagem.
 *         required: true
 *         type: integer
 *     responses:
 *       200:
 *         description: Imagem do usuário barbearia foi carregada com sucesso.
 *       500:
 *         description: Erro interno do servidor ao realizar o upload da imagem.
 */
/**
 * @swagger
 * /api/image-user-barbearia:
 *   get:
 *     summary: Obter a imagem de usuário da barbearia
 *     description: Rota utilizada para obter a imagem de usuário da barbearia com base no ID da barbearia.
 *     tags:
 *       - User-Barbearia
 *     parameters:
 *       - in: query
 *         name: barbeariaId
 *         description: ID da barbearia para a qual a imagem do usuário será obtida.
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: URL da imagem de usuário da barbearia.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   format: uri
 *                   description: URL da imagem de usuário da barbearia.
 *       500:
 *         description: Erro interno do servidor ao obter a imagem de usuário.
 */


