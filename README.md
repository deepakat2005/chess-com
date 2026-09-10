# ♟️ Chess.com Clone — Unified Full-Stack Real-Time Platform

A unified full-stack chess web application with real-time multiplayer, AI opponent (Stockfish), JWT authentication, and an ELO-based leaderboard — consolidating React and Express into a streamlined single full-stack project.

---

## 🚀 Live Features

- **Real-Time Multiplayer** — Play vs another user over WebSocket (Socket.IO) with live move sync, timers, and match rooms
- **AI Opponent (Stockfish)** — Play vs computer powered by Stockfish WASM running directly in the browser
- **User Authentication** — Secure register/login with JWT and bcrypt password hashing
- **ELO Leaderboard** — Global rankings with real rating updates after every match
- **Game History** — Persist and replay all games stored as PGN in MongoDB
- **In-Game Chat** — Real-time messaging between players during a match
- **Responsive UI** — Modern chessboard with drag-and-drop piece movement powered by Tailwind CSS

---

## 🛠️ Tech Stack

### Frontend
- **React 18** (Vite build tool)
- **Tailwind CSS v4** & PostCSS
- **React Router DOM v7**
- **chess.js** & **react-chessboard**
- **Socket.IO Client** & **Axios**
- **Stockfish WASM**

### Backend
- **Node.js** & **Express.js v5**
- **Socket.IO** (Real-time events, room matchmaking & ELO calculator)
- **MongoDB** & **Mongoose**
- **JWT** & **bcryptjs**

---

## 🏗️ Unified Architecture

```
chess.com/
├── server.js              # Combined backend entry (Express, Mongoose Models, Auth, Games API, Socket.IO, Static Serving)
├── src/                   # React frontend application
│   ├── components/
│   │   ├── GameBoard.jsx      # Core game UI — board, timers, move history
│   │   ├── Dashboard.jsx      # Dashboard — play options & recent games
│   │   ├── Leaderboard.jsx    # ELO rankings table
│   │   ├── Chat.jsx           # Real-time in-game messaging
│   │   ├── Login.jsx          # Login form
│   │   └── Register.jsx       # Register form
│   ├── context/               # React Context (AuthContext)
│   ├── engine/                # Stockfish WASM wrapper
│   ├── socket.js              # Socket.IO client instance
│   ├── index.css              # Tailwind CSS entry
│   ├── App.jsx                # React routing
│   └── main.jsx               # React entry point
├── public/                # Static assets (Stockfish WASM / JS)
├── index.html             # Single Page Application HTML root
├── vite.config.js         # Vite configuration with API & WebSocket proxy
├── tailwind.config.mjs    # Tailwind CSS config
├── postcss.config.mjs     # PostCSS config
├── package.json           # Unified dependencies & scripts
└── .env                   # Unified environment variables
```

---

## ⚙️ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create or edit `.env` in the root:
```env
PORT=5002
MONGO_URI=mongodb://localhost:27017/chess
JWT_SECRET=your_jwt_secret_change_in_production
VITE_API_URL=/api
VITE_SOCKET_URL=/
```

### 3. Development Mode
Run both backend and frontend concurrently with a single command:
```bash
npm run dev
```
- Frontend Dev Server: `http://localhost:5173`
- Backend Server: `http://localhost:5002`

### 4. Production Build & Run
Build the React frontend and serve everything directly from `server.js`:
```bash
npm run build
npm start
```
Access the complete application at `http://localhost:5002`.

---

## 👤 Author

**Deepak** — [GitHub: deepakat2005](https://github.com/deepakat2005)
