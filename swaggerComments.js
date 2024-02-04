/**
 * @swagger
 * /api/SignUp:
 *   post:
 *     summary: Cadastro de usuário com senha criptografada
 *     description: Rota utilizada para registrar um novo usuário com informações criptografadas.
 *     tags:
 *       - User
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nome do usuário.
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Endereço de e-mail do usuário.
 *               senha:
 *                 type: string
 *                 format: password
 *                 description: Senha do usuário (criptografada).
 *               celular:
 *                 type: string
 *                 description: Número de celular do usuário.
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
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Endereço de e-mail do usuário.
 *               senha:
 *                 type: string
 *                 format: password
 *                 description: Senha do usuário.
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
 *       - Barber Shops
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Número da página a ser recuperada
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Número máximo de resultados por página
 *     responses:
 *       200:
 *         description: Lista de barbearias obtida com sucesso.
 *       500:
 *         description: Erro interno do servidor ao obter a lista de barbearias.
 */
