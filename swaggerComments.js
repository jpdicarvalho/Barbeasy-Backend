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