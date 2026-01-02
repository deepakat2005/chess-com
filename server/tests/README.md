# Testing Documentation

## Overview
This document describes the testing setup and strategy for the Chess.com application.

## Test Environment Setup

### Prerequisites
- Node.js installed
- MongoDB Memory Server (installed as dev dependency)
- All project dependencies installed (`npm install`)

### Environment Variables
Tests use the MongoDB Memory Server, so no local MongoDB instance is required. The test setup automatically:
- Loads environment variables from `.env` or uses defaults
- Sets `JWT_SECRET` to a test value if not provided
- Creates an in-memory MongoDB instance for each test run

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test -- auth.test.js
npm test -- games.integration.test.js
npm test -- socket.test.js
npm test -- e2e.test.js
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

## Test Structure

### 1. Unit Tests

#### Auth Tests (`tests/auth.test.js`)
Tests authentication routes and user management:
- User registration
- User login
- Token validation
- Duplicate user prevention
- Password validation
- Protected route access

**Coverage:**
- ✅ POST /api/auth/register
- ✅ POST /api/auth/login
- ✅ GET /api/auth (protected)

### 2. Integration Tests

#### Games Integration Tests (`tests/games.integration.test.js`)
Tests complete game workflows:
- Game creation
- Game retrieval
- Multi-player game flow
- Game state persistence
- Different game modes (online, computer)
- Time control variations
- Authentication requirements

**Coverage:**
- ✅ Game creation and setup
- ✅ Complete game flow from start to finish
- ✅ Move recording and persistence
- ✅ Game completion and winner determination
- ✅ Multiple game modes
- ✅ Authorization checks

### 3. Socket.IO Tests

#### Socket Tests (`tests/socket.test.js`)
Tests real-time multiplayer functionality:
- Player matchmaking
- Queue management
- Game state synchronization
- Move validation
- Turn enforcement
- Checkmate detection
- Multi-client coordination

**Coverage:**
- ✅ Matchmaking queue
- ✅ Two-player matching
- ✅ Game joining
- ✅ Move making and validation
- ✅ Invalid move rejection
- ✅ Turn-based play
- ✅ Checkmate detection
- ✅ State synchronization

### 4. End-to-End Tests

#### E2E Tests (`tests/e2e.test.js`)
Tests complete user journeys:
- Full game flow: Register → Create → Match → Play → Finish
- Authentication flow with game access
- Matchmaking flow
- Complete game with checkmate

**Coverage:**
- ✅ Complete user registration and authentication
- ✅ Game creation via API
- ✅ Socket.IO connection and gameplay
- ✅ Database persistence verification
- ✅ API and Socket.IO integration
- ✅ Matchmaking system
- ✅ Game completion scenarios

## Test Configuration

### Jest Configuration (`jest.config.js`)
```javascript
{
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  verbose: true,
  collectCoverageFrom: [
    'routes/**/*.js',
    'models/**/*.js',
    'middleware/**/*.js'
  ]
}
```

### Test Setup (`tests/setup.js`)
- Loads environment variables
- Sets default JWT_SECRET for tests
- Creates MongoDB Memory Server instance
- Handles database cleanup between tests
- Manages connection lifecycle

## Key Features

### ✅ Fixed Issues

1. **JWT_SECRET Loading**
   - Environment variables properly loaded in test setup
   - Default test secret provided if not configured
   - No more "JWT_SECRET undefined" errors

2. **MongoDB Connection**
   - Uses MongoDB Memory Server (no local MongoDB required)
   - Proper timeout configuration (60s for setup)
   - Automatic cleanup after tests
   - Database reset between test cases

3. **Auth Routes**
   - All routes return correct status codes
   - Proper error messages
   - Token generation and validation working
   - No more 500 errors

4. **Integration Testing**
   - Complete game flow tested
   - Socket.IO events fully tested
   - Multi-client scenarios covered
   - Database persistence verified

## Test Data Management

### Database Cleanup
- `afterEach` hook clears all collections
- Ensures test isolation
- No data pollution between tests

### Test Users
Tests create fresh users for each test case:
```javascript
{
  username: 'testuser',
  email: 'test@example.com',
  password: 'password123'
}
```

## Common Issues and Solutions

### Issue: Tests timeout
**Solution:** Increase timeout in test or jest.config.js
```javascript
test('my test', async () => {
  // test code
}, 30000); // 30 second timeout
```

### Issue: MongoDB connection errors
**Solution:** MongoDB Memory Server handles this automatically. If issues persist:
- Check that mongodb-memory-server is installed
- Increase timeout in beforeAll hook
- Ensure no other MongoDB instances are interfering

### Issue: Socket.IO tests fail
**Solution:**
- Ensure proper cleanup in afterEach
- Check that ports are not in use
- Verify client connections are closed

### Issue: JWT errors
**Solution:**
- Verify .env file exists or setup.js sets default
- Check that JWT_SECRET is loaded before routes

## Coverage Goals

Target coverage metrics:
- **Statements:** > 80%
- **Branches:** > 75%
- **Functions:** > 80%
- **Lines:** > 80%

Current coverage areas:
- ✅ Authentication routes
- ✅ Game routes
- ✅ Socket.IO events
- ✅ Database models
- ✅ Middleware

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
```

## Best Practices

1. **Isolation:** Each test should be independent
2. **Cleanup:** Always clean up resources (sockets, DB)
3. **Descriptive Names:** Test names should describe what they test
4. **Arrange-Act-Assert:** Follow AAA pattern
5. **Mock External Services:** Use in-memory DB, mock APIs
6. **Fast Tests:** Keep tests fast for quick feedback
7. **Comprehensive:** Cover happy paths and edge cases

## Future Improvements

- [ ] Add performance tests
- [ ] Add load testing for Socket.IO
- [ ] Add visual regression tests for client
- [ ] Add mutation testing
- [ ] Increase coverage to 90%+
- [ ] Add contract tests for API
- [ ] Add security testing

## Troubleshooting

### Debug Mode
Run tests with Node inspector:
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Verbose Output
```bash
npm test -- --verbose
```

### Single Test
```bash
npm test -- -t "should register a new user"
```

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Socket.IO Testing](https://socket.io/docs/v4/testing/)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)
