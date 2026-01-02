const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/auth');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  describe('POST /api/auth/register', () => {
    test('should register a new user', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('username', 'testuser');
    });

    test('should not register user with existing email', async () => {
      // First create a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Try to register again with same email
      const userData2 = {
        username: 'testuser2',
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData2)
        .expect(400);

      expect(response.body.msg).toBe('User already exists');
    });

    test('should not register user with existing username', async () => {
      // First create a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Try to register again with same username
      const userData2 = {
        username: 'testuser',
        email: 'test2@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData2)
        .expect(400);

      expect(response.body.msg).toBe('Username already taken');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a user for login tests
      const userData = {
        username: 'loginuser',
        email: 'login@example.com',
        password: 'password123'
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData);
    });

    test('should login with correct credentials', async () => {
      const loginData = {
        email: 'login@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('username', 'loginuser');
    });

    test('should not login with wrong password', async () => {
      const loginData = {
        email: 'login@example.com',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body.msg).toBe('Invalid Credentials');
    });

    test('should not login with non-existent email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body.msg).toBe('Invalid Credentials');
    });
  });

  describe('GET /api/auth', () => {
    let token;

    beforeEach(async () => {
      // Register and get token
      const userData = {
        username: 'authuser',
        email: 'auth@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      token = response.body.token;
    });

    test('should get user data with valid token', async () => {
      const response = await request(app)
        .get('/api/auth')
        .set('x-auth-token', token)
        .expect(200);

      expect(response.body).toHaveProperty('username', 'authuser');
      expect(response.body).toHaveProperty('email', 'auth@example.com');
      expect(response.body).not.toHaveProperty('password');
    });

    test('should not get user data without token', async () => {
      const response = await request(app)
        .get('/api/auth')
        .expect(401);

      expect(response.body.msg).toBe('No token, authorization denied');
    });

    test('should not get user data with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth')
        .set('x-auth-token', 'invalid_token')
        .expect(401);

      expect(response.body.msg).toBe('Token is not valid');
    });
  });
});