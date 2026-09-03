CREATE DATABASE IF NOT EXISTS barbeasy;
USE barbeasy;

CREATE TABLE user (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    senha VARCHAR(255),
    celular VARCHAR(50),
    user_image VARCHAR(255),
    isVerified VARCHAR(50)
);

CREATE TABLE barbearia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    usuario VARCHAR(255),
    senha VARCHAR(255),
    status VARCHAR(50),
    user_image VARCHAR(255),
    banner_main VARCHAR(255),
    banners TEXT,
    rua VARCHAR(255),
    N VARCHAR(50),
    bairro VARCHAR(255),
    cidade VARCHAR(255),
    amountVisibility VARCHAR(50),
    celular VARCHAR(50),
    isVerified VARCHAR(50)
);

CREATE TABLE professional (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    cell_phone VARCHAR(50),
    user_image VARCHAR(255),
    amountVisibility VARCHAR(50)
);

CREATE TABLE Barb_Professional (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barbearia_id INT,
    professional_id INT
);

CREATE TABLE servico (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    preco DECIMAL(10, 2),
    duracao VARCHAR(50),
    commission_fee DECIMAL(10,2),
    barbearia_id INT,
    professional_id INT
);

CREATE TABLE bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    barbearia_id INT,
    professional_id INT,
    service_id INT,
    payment_id BIGINT,
    booking_date VARCHAR(50),
    booking_time VARCHAR(50),
    date_created VARCHAR(50),
    token VARCHAR(255),
    booking_date_no_formated VARCHAR(255)
);

CREATE TABLE payments (
    payment_id BIGINT PRIMARY KEY,
    user_id INT,
    barbearia_id INT,
    professional_id INT,
    service_id INT,
    transaction_amount DECIMAL(10, 2),
    status VARCHAR(50),
    date_created VARCHAR(50)
);

CREATE TABLE agenda (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barbearia_id INT,
    professional_id INT,
    dias TEXT,
    qnt_dias INT,
    dom TEXT,
    seg TEXT,
    ter TEXT,
    qua TEXT,
    qui TEXT,
    sex TEXT,
    sab TEXT
);

CREATE TABLE days_off (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barbearia_id INT,
    professional_id INT,
    day VARCHAR(50),
    times TEXT
);

CREATE TABLE avaliations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    barbearia_id INT,
    estrelas INT,
    comentarios TEXT,
    data_avaliacao VARCHAR(50)
);

CREATE TABLE averageAvaliations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barbearia_id INT,
    totalAvaliations INT,
    average DECIMAL(10, 2)
);

CREATE TABLE BarbeariaCredentials (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barbearia_id INT,
    access_token TEXT,
    refresh_token TEXT,
    date_renovation VARCHAR(50)
);

CREATE TABLE notificationProfessional (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barbearia_id INT,
    professional_id INT
);

CREATE TABLE bookingPolicies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barbearia_id INT,
    booking_with_payment BOOLEAN,
    service_percentage INT
);
