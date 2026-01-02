import React, { useState, useEffect, useRef, useContext } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useSearchParams } from 'react-router-dom';
import socket from '../socket';
import { AuthContext } from '../context/AuthContext';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Chess game crashed:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center p-4 min-h-screen bg-gray-900 text-white">
                    <h2 className="text-3xl font-bold text-red-500 mb-4">Game Error</h2>
                    <p className="text-gray-300 mb-4">Something went wrong with the chess game.</p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                    >
                        Try Again
                    </button>
                    <details className="mt-4 text-sm text-gray-400">
                        <summary>Error Details</summary>
                        <pre className="mt-2 p-2 bg-gray-800 rounded text-xs overflow-auto">
                            {this.state.error?.toString()}
                        </pre>
                    </details>
                </div>
            );
        }

        return this.props.children;
    }
}

const GameBoard = () => {
    const { user, loadUser } = useContext(AuthContext);
    const [searchParams] = useSearchParams();
    const modeParam = searchParams.get('mode');
    const roomParam = searchParams.get('room');

    console.log('GameBoard mounted, mode:', modeParam, 'room:', roomParam);

    const [game, setGame] = useState(new Chess());
    const [history, setHistory] = useState([]);
    const [roomId, setRoomId] = useState(roomParam || sessionStorage.getItem('currentRoom') || 'demo-room');
    const [gameMode, setGameMode] = useState(modeParam || 'online'); // 'online' | 'computer'
    const [gameResult, setGameResult] = useState(null); // 'White Wins', 'Draw', etc.
    const [playerColor, setPlayerColor] = useState(null); // 'w' | 'b' | null (spectator)
    const [error, setError] = useState('');
    const [whiteTime, setWhiteTime] = useState(600); // 10 minutes in seconds
    const [blackTime, setBlackTime] = useState(600);
    const [selectedSquare, setSelectedSquare] = useState(null);
    const [moveSquares, setMoveSquares] = useState({});
    const [boardLocked, setBoardLocked] = useState(false);
    const [lastMoveSquares, setLastMoveSquares] = useState({});
    const [findingMatch, setFindingMatch] = useState(false);
    const [showCheck, setShowCheck] = useState(false);
    const [promotionMove, setPromotionMove] = useState(null);
    const [showPromotionModal, setShowPromotionModal] = useState(false);
    const [ratingChange, setRatingChange] = useState(null);
    const engine = useRef(null);
    const [engineReady, setEngineReady] = useState(false);

    // DEBUG: Expose to window
    useEffect(() => {
        window.GAME = game;
        window.CHESS = Chess;
    }, [game]);

    // Update internal state if url changes
    useEffect(() => {
        if (modeParam) setGameMode(modeParam);
    }, [modeParam]);

    // Initialize Engine
    useEffect(() => {
        if (gameMode === 'computer') {
            try {
                engine.current = new Worker('/stockfish.js');
                engine.current.onmessage = (event) => {
                    const line = event.data;
                    console.log('Stockfish:', line);
                    if (line === 'uciok') {
                        engine.current.postMessage('isready');
                    } else if (line === 'readyok') {
                        engine.current.postMessage('ucinewgame');
                        setEngineReady(true);
                    } else if (line.startsWith('bestmove')) {
                        const moveString = line.split(' ')[1];
                        if (!moveString) return;
                        const from = moveString.substring(0, 2);
                        const to = moveString.substring(2, 4);
                        const promotion = moveString.length > 4 ? moveString.substring(4, 5) : 'q';

                        setBoardLocked(true);
                        setTimeout(() => {
                            let move = null;
                            let newFen = '';

                            setGame(prev => {
                                const temp = new Chess(prev.fen());
                                move = temp.move({ from, to, promotion });
                                newFen = temp.fen();
                                highlightLastMove(move, temp);
                                return temp;
                            });

                            // Append to history state correctly
                            setHistory(prev => {
                                const updatedHistory = [...prev, move.san];

                                // Save to sessionStorage for computer mode within history update
                                sessionStorage.setItem(`game_${roomId}`, JSON.stringify({
                                    fen: newFen,
                                    playerColor: 'w',
                                    lastMove: move,
                                    history: updatedHistory
                                }));

                                return updatedHistory;
                            });

                            // Wait a moment for user to see the move, then check game over
                            setTimeout(() => {
                                setGame(currentGame => {
                                    const temp = new Chess(currentGame.fen());
                                    if (temp.isGameOver()) {
                                        handleGameOver(temp);
                                    }
                                    return currentGame;
                                });
                                setSelectedSquare(null);
                                setMoveSquares({});
                                setBoardLocked(false);
                            }, 600);
                        }, 350);
                    }
                };
                engine.current.postMessage('uci');
            } catch (e) {
                console.error("Stockfish not found", e);
                setError('Stockfish engine not available');
            }
        }
        return () => {
            if (engine.current) {
                engine.current.terminate();
                setEngineReady(false);
            }
        };
    }, [gameMode]);    // Socket Logic
    useEffect(() => {
        if (gameMode === 'online' && user) {
            socket.emit('join_game', { roomId, userId: user.id || user._id });

            socket.on('game_state', ({ fen, color, history: serverHistory }) => {
                const savedGame = sessionStorage.getItem(`game_${roomId}`);
                if (savedGame) {
                    const { fen: savedFen, gameResult: savedResult, playerColor: savedColor, lastMove, history: savedHistory } = JSON.parse(savedGame);
                    setGame(new Chess(savedFen));
                    setHistory(savedHistory || []);
                    setGameResult(savedResult);
                    setPlayerColor(savedColor || color);
                    if (lastMove) highlightLastMove(lastMove, new Chess(savedFen));
                } else {
                    setGame(new Chess(fen));
                    setHistory(serverHistory || []);
                    setPlayerColor(color);
                }
            });

            socket.on('receive_move', ({ move, fen, history: serverHistory, result }) => {
                setGame(currentGame => {
                    if (currentGame.fen() === fen) return currentGame;

                    setBoardLocked(true);
                    setTimeout(() => {
                        const newGame = new Chess(fen);
                        setGame(newGame);
                        setHistory(serverHistory); // Update history state
                        setSelectedSquare(null);
                        setMoveSquares({});
                        highlightLastMove(move, newGame);
                        if (result) {
                            setGameResult(result);
                        }
                        setBoardLocked(false);
                    }, 350);

                    // Save to sessionStorage
                    sessionStorage.setItem(`game_${roomId}`, JSON.stringify({
                        fen,
                        gameResult: result,
                        playerColor,
                        lastMove: move,
                        history: serverHistory
                    }));

                    return currentGame;
                });
            });

            socket.on('game_found', ({ roomId: newRoomId, color }) => {
                setFindingMatch(false);
                setRoomId(newRoomId);
                setPlayerColor(color);
                sessionStorage.setItem('currentRoom', newRoomId);
                // Update URL
                const newUrl = `${window.location.pathname}?mode=online&room=${newRoomId}`;
                window.history.replaceState(null, '', newUrl);
            });

            socket.on('game_reset', ({ fen }) => {
                setGame(new Chess(fen));
                setGameResult(null);
                setLastMoveSquares({});
                setSelectedSquare(null);
                setMoveSquares({});
                setHistory([]); // Clear history on reset
            });

            socket.on('rating_update', (data) => {
                setRatingChange(data);
                loadUser(); // Refresh user data to get new rating
            });

            return () => {
                socket.off('game_state');
                socket.off('receive_move');
                socket.off('game_found');
                socket.off('game_reset');
                socket.off('rating_update');
            };
        }
    }, [roomId, gameMode, user, playerColor]); // Added playerColor to dependencies

    // Timer Logic (commented out for testing)
    // useEffect(() => {
    //     if (gameMode === 'online' && !gameResult) {
    //         const interval = setInterval(() => {
    //             if (game.turn() === 'w') {
    //                 setWhiteTime(prev => {
    //                     if (prev <= 1) {
    //                         setGameResult('Black Wins (Time)');
    //                         return 0;
    //                     }
    //                     return prev - 1;
    //                 });
    //             } else {
    //                 setBlackTime(prev => {
    //                     if (prev <= 1) {
    //                         setGameResult('White Wins (Time)');
    //                         return 0;
    //                     }
    //                         return prev - 1;
    //                 });
    //             }
    //         }, 1000);
    //         return () => clearInterval(interval);
    //     }
    // }, [game, gameMode, gameResult]);

    // Trigger Computer Move
    useEffect(() => {
        console.log('Checking computer move: mode', gameMode, 'turn', game.turn(), 'isGameOver', game.isGameOver(), 'engineReady', engineReady);
        if (gameMode === 'computer' && game.turn() === 'b' && !game.isGameOver() && engineReady && engine.current) {
            console.log('Triggering Stockfish move');
            engine.current.postMessage('position fen ' + game.fen());
            engine.current.postMessage('go movetime 1000'); // 1 second thinking time
        }
    }, [game, gameMode, engineReady]);

    function findRandomMatch() {
        if (!user) {
            setError('Please login to find a match');
            return;
        }
        setFindingMatch(true);
        setError('');
        socket.emit('join_queue', { userId: user.id || user._id });
    }

    function handleGameOver(game) {
        if (game.isCheckmate()) {
            // The player who just moved caused checkmate, so the opponent wins
            const winner = game.turn() === 'w' ? 'Black' : 'White';
            setGameResult(`${winner} Wins`);
        } else if (game.isDraw()) {
            setGameResult('Draw');
        } else if (game.isStalemate()) {
            setGameResult('Stalemate');
        } else {
            setGameResult('Game Over');
        }
        setShowCheck(false); // Clear check indicator when game ends
    }

    function resetGame() {
        setGame(new Chess());
        setHistory([]);
        setGameResult(null);
        setLastMoveSquares({});
        setSelectedSquare(null);
        setMoveSquares({});
        setPlayerColor(null);
        setShowCheck(false);
        setRatingChange(null);
        sessionStorage.removeItem(`game_${roomId}`);
    }

    function highlightLastMove(move, currentGame = game) {
        if (!move) return;

        // The currentGame passed here should already be the state AFTER the move
        // has been applied. We check the state of that game to see if the move
        // resulted in check or checkmate for the side now to move.

        if (currentGame.isCheckmate()) {
            // Highlight checkmate moves in red
            setLastMoveSquares({
                [move.from]: { background: "rgba(255, 0, 0, 0.6)" },
                [move.to]: { background: "rgba(255, 0, 0, 0.8)" }
            });
            setShowCheck(true);
        } else if (currentGame.isCheck()) {
            // Highlight check moves in orange
            setLastMoveSquares({
                [move.from]: { background: "rgba(255, 165, 0, 0.5)" },
                [move.to]: { background: "rgba(255, 165, 0, 0.7)" }
            });
            setShowCheck(true);
        } else {
            // Normal move highlighting
            setLastMoveSquares({
                [move.from]: { background: "rgba(255, 255, 0, 0.4)" },
                [move.to]: { background: "rgba(255, 255, 0, 0.7)" }
            });
            setShowCheck(false);
        }
    }

    function onSquareClick(square) {
        if (boardLocked) return;
        if (!selectedSquare) {
            // First click: select piece and show moves
            const piece = game.get(square);
            if (!piece || piece.color !== game.turn()) return;

            if (gameMode === 'computer' && game.turn() === 'b') return;
            if (gameMode === 'online' && playerColor && game.turn() !== playerColor) return;
            if (gameResult) return;

            const moves = game.moves({
                square,
                verbose: true
            });

            if (moves.length === 0) return;

            const highlights = {};
            moves.forEach(m => {
                highlights[m.to] = {
                    background:
                        game.get(m.to) && game.get(m.to).color !== game.turn()
                            ? "radial-gradient(circle, transparent 25%, rgba(0,0,0,.5) 28%)"
                            : "radial-gradient(circle, rgba(0,0,0,.5) 25%, transparent 28%)",
                    borderRadius: "50%"
                };
            });

            highlights[square] = {
                background: "rgba(255, 255, 0, 0.4)"
            };

            setSelectedSquare(square);
            setMoveSquares(highlights);
        } else {
            // Second click: attempt move
            if (square === selectedSquare) {
                // Deselect
                setSelectedSquare(null);
                setMoveSquares({});
                return;
            }

            // Check if clicking another own piece to switch selection
            const piece = game.get(square);
            if (piece && piece.color === game.turn()) {
                // Switch to new piece
                const moves = game.moves({
                    square,
                    verbose: true
                });

                if (moves.length === 0) {
                    setSelectedSquare(square);
                    setMoveSquares({ [square]: { background: "rgba(255, 255, 0, 0.4)" } });
                    return;
                }

                const highlights = {};
                moves.forEach(m => {
                    highlights[m.to] = {
                        background:
                            game.get(m.to) && game.get(m.to).color !== game.turn()
                                ? "radial-gradient(circle, transparent 25%, rgba(0,0,0,.5) 28%)"
                                : "radial-gradient(circle, rgba(0,0,0,.5) 25%, transparent 28%)",
                        borderRadius: "50%"
                    };
                });

                highlights[square] = {
                    background: "rgba(255,255,0,0.4)"
                };

                setSelectedSquare(square);
                setMoveSquares(highlights);
                return;
            }

            const tempGame = new Chess(game.fen());

            // Check if game is already over
            if (tempGame.isGameOver()) {
                console.log('Game is already over');
                return;
            }

            // Check if it's promotion
            const movingPiece = tempGame.get(selectedSquare);
            const isPromotion = movingPiece && movingPiece.type === 'p' &&
                ((movingPiece.color === 'w' && square[1] === '8') ||
                    (movingPiece.color === 'b' && square[1] === '1'));

            if (isPromotion) {
                setPromotionMove({ from: selectedSquare, to: square });
                setShowPromotionModal(true);
                return;
            }

            let move;
            try {
                move = tempGame.move({
                    from: selectedSquare,
                    to: square,
                    promotion: 'q' // Default for non-modal moves if any
                });

                if (!move) {
                    console.log('Invalid move attempted');
                    return;
                }
            } catch (e) {
                console.error('Move error:', e);
                setError('Invalid move');
                return;
            }

            // Optimistic update
            setSelectedSquare(null);
            setMoveSquares({});
            setGame(tempGame);

            setHistory(prev => {
                const newHistory = [...prev, move.san];

                // Save to sessionStorage
                sessionStorage.setItem(`game_${roomId}`, JSON.stringify({
                    fen: tempGame.fen(),
                    gameResult,
                    playerColor,
                    lastMove: move,
                    history: newHistory
                }));

                if (gameMode === 'online' && user) {
                    socket.emit('make_move', {
                        roomId,
                        move: {
                            from: move.from,
                            to: move.to,
                            promotion: move.promotion
                        },
                        userId: user.id || user._id,
                        history: newHistory
                    });
                }

                return newHistory;
            });

            highlightLastMove(move, tempGame);

            if (tempGame.isGameOver()) {
                handleGameOver(tempGame);
            }
        }
    }

    function onDrop(sourceSquare, targetSquare, piece) {
        console.log('onDrop called:', sourceSquare, targetSquare, piece);
        // Check turn
        if (boardLocked) return false; // Added boardLocked check
        if (gameMode === 'computer' && game.turn() === 'b') {
            console.log('Not your turn');
            return false;
        }
        if (gameMode === 'online' && playerColor && game.turn() !== playerColor) {
            console.log('Not your turn in online mode');
            setError('Not your turn');
            return false;
        }

        if (gameResult) return false;

        setError('');

        // Extra validation: piece color must match turn
        if (piece && piece[0] !== game.turn()) {
            console.log('Wrong piece color for turn');
            return false;
        }

        // Check if game is already over
        if (game.isGameOver()) {
            console.log('Game is already over');
            return false;
        }

        try {
            const tempGame = new Chess(game.fen());
            console.log('Trying move from', sourceSquare, 'to', targetSquare);

            // Check if it's promotion
            const movingPiece = tempGame.get(sourceSquare);
            const isPromotion = movingPiece && movingPiece.type === 'p' &&
                ((movingPiece.color === 'w' && targetSquare[1] === '8') ||
                    (movingPiece.color === 'b' && targetSquare[1] === '1'));

            if (isPromotion) {
                setPromotionMove({ from: sourceSquare, to: targetSquare });
                setShowPromotionModal(true);
                return true; // Keep piece at target square visually
            }

            // Try move
            let move = {
                from: sourceSquare,
                to: targetSquare
            };

            const result = tempGame.move(move);

            if (!result) {
                console.log('Invalid move attempted');
                return false;
            }

            setGame(tempGame);

            setHistory(prev => {
                const newHistory = [...prev, result.san];

                // Save to sessionStorage for resuming
                sessionStorage.setItem(`game_${roomId}`, JSON.stringify({
                    fen: tempGame.fen(),
                    gameResult,
                    playerColor,
                    lastMove: result,
                    history: newHistory
                }));

                if (gameMode === 'online' && user) {
                    socket.emit('make_move', {
                        roomId,
                        move: {
                            from: result.from,
                            to: result.to,
                            promotion: result.promotion
                        },
                        userId: user.id || user._id,
                        history: newHistory
                    });
                }

                return newHistory;
            });

            console.log('Game updated, new fen:', tempGame.fen());
            highlightLastMove(result, tempGame);

            if (tempGame.isGameOver()) {
                handleGameOver(tempGame);
            }

            return true;
        } catch (e) {
            console.error("Move error:", e);
            setError('Invalid move');
            return false;
        }
    }

    function onPromotionSelect(piece) {
        if (!promotionMove) return;

        const { from, to } = promotionMove;
        const tempGame = new Chess(game.fen());

        try {
            const move = tempGame.move({
                from,
                to,
                promotion: piece
            });

            if (move) {
                setGame(tempGame);

                setHistory(prev => {
                    const newHistory = [...prev, move.san];

                    if (gameMode === 'online' && user) {
                        socket.emit('make_move', {
                            roomId,
                            move: { from, to, promotion: piece },
                            userId: user.id || user._id,
                            history: newHistory
                        });
                    }

                    // Save state
                    sessionStorage.setItem(`game_${roomId}`, JSON.stringify({
                        fen: tempGame.fen(),
                        gameResult,
                        playerColor,
                        lastMove: move,
                        history: newHistory
                    }));

                    return newHistory;
                });

                highlightLastMove(move, tempGame);

                if (tempGame.isGameOver()) {
                    handleGameOver(tempGame);
                }
            }
        } catch (e) {
            console.error('Promotion error:', e);
        }

        setShowPromotionModal(false);
        setPromotionMove(null);
        setSelectedSquare(null);
        setMoveSquares({});
    }

    function resetMatch() {
        if (gameMode === 'online' && user) {
            socket.emit('reset_game', { roomId, userId: user.id });
        } else {
            resetGame();
        }
    }

    return (
        <ErrorBoundary>
            <div className="flex flex-col items-center justify-center p-4 min-h-screen bg-gray-900">
                <h2 className="text-3xl font-bold text-white mb-6">Play Chess</h2>

                <div className="mb-4 text-gray-400 flex flex-col items-center">
                    <div className="flex space-x-4 mb-2">
                        <button
                            onClick={() => { setGameMode('online'); resetGame(); }}
                            className={`px-4 py-2 rounded font-bold ${gameMode === 'online' ? 'bg-blue-600 text-white' : 'bg-gray-700'}`}
                        >
                            Online
                        </button>
                        <button
                            onClick={() => { setGameMode('computer'); resetGame(); }}
                            className={`px-4 py-2 rounded font-bold ${gameMode === 'computer' ? 'bg-blue-600 text-white' : 'bg-gray-700'}`}
                        >
                            Vs Computer
                        </button>
                    </div>

                    {gameMode === 'online' && (
                        <div className="flex flex-col items-center space-y-2">
                            <span>Room ID: <span className="font-mono text-green-400">{roomId}</span></span>
                            {!playerColor && !findingMatch && (
                                <button
                                    onClick={findRandomMatch}
                                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition"
                                >
                                    Find Random Match
                                </button>
                            )}
                            {findingMatch && (
                                <div className="text-yellow-400 font-bold animate-pulse">Finding match...</div>
                            )}
                            {playerColor && (
                                <div className="text-blue-400 font-bold">You are {playerColor === 'w' ? 'White' : 'Black'}</div>
                            )}
                        </div>
                    )}
                    {error && (
                        <div className="text-red-500 text-center mt-2">{error}</div>
                    )}
                </div>

                {/* Time Display (commented out for testing) */}
                {/* {gameMode === 'online' && (
                <div className="flex justify-center space-x-8 mb-4 text-white">
                    <div className="text-center">
                        <div className="text-sm text-gray-400">White</div>
                        <div className={`text-xl font-mono ${game.turn() === 'w' ? 'text-green-400' : 'text-gray-300'}`}>
                            {Math.floor(whiteTime / 60)}:{(whiteTime % 60).toString().padStart(2, '0')}
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-sm text-gray-400">Black</div>
                        <div className={`text-xl font-mono ${game.turn() === 'b' ? 'text-green-400' : 'text-gray-300'}`}>
                            {Math.floor(blackTime / 60)}:{(blackTime % 60).toString().padStart(2, '0')}
                        </div>
                    </div>
                </div>
            )} */}

                <div className="flex flex-col lg:flex-row gap-8 items-stretch justify-center w-full max-w-6xl">
                    {/* Left Side: Game Board */}
                    <div className="w-full lg:w-[600px] flex flex-col items-center">
                        <div className={`relative w-full aspect-square shadow-2xl border-4 ${gameResult ? 'border-yellow-500' : 'border-gray-700'} rounded-lg overflow-hidden bg-gray-800`}>
                            <div className="w-full h-full">
                                <Chessboard
                                    key={roomId}
                                    position={game.fen()}
                                    onSquareClick={!boardLocked ? onSquareClick : undefined}
                                    onPieceDrop={!boardLocked ? onDrop : undefined}
                                    customSquareStyles={{
                                        ...moveSquares,
                                        ...lastMoveSquares
                                    }}
                                    pieces="cburnett"
                                    animationDuration={300}
                                    arePiecesDraggable={!boardLocked}
                                />
                            </div>
                            {showPromotionModal && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20 backdrop-blur-sm">
                                    <div className="bg-gray-800 p-6 rounded-2xl border border-gray-600 shadow-2xl animate-in zoom-in duration-300">
                                        <h3 className="text-xl font-bold text-white mb-4 text-center">Promote to:</h3>
                                        <div className="flex space-x-4">
                                            {[
                                                { type: 'q', label: 'Queen', icon: '♕' },
                                                { type: 'r', label: 'Rook', icon: '♖' },
                                                { type: 'b', label: 'Bishop', icon: '♗' },
                                                { type: 'n', label: 'Knight', icon: '♘' }
                                            ].map((p) => (
                                                <button
                                                    key={p.type}
                                                    onClick={() => onPromotionSelect(p.type)}
                                                    className="w-16 h-16 bg-gray-700 hover:bg-blue-600 rounded-xl flex items-center justify-center text-4xl text-white transition-all transform hover:scale-110 shadow-lg border border-gray-500"
                                                >
                                                    {p.icon}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => { setShowPromotionModal(false); setPromotionMove(null); }}
                                            className="mt-6 w-full text-gray-400 hover:text-white text-sm transition"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {gameResult && (
                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                                    <div className="text-center p-6 bg-gray-800 rounded-xl border border-gray-600 shadow-2xl transform scale-110">
                                        <h3 className="text-4xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-yellow-400 to-red-500 mb-2">
                                            Game Over
                                        </h3>
                                        <p className="text-2xl text-white font-bold">{gameResult}</p>

                                        {ratingChange && playerColor && (
                                            <div className="mt-4 p-3 bg-gray-700/50 rounded-lg border border-gray-600">
                                                <span className="text-gray-300 mr-2">Rating:</span>
                                                <span className={`text-2xl font-bold ${(playerColor === 'w' ? ratingChange.white : ratingChange.black) > 0
                                                    ? 'text-green-400'
                                                    : 'text-red-400'
                                                    }`}>
                                                    {(playerColor === 'w' ? ratingChange.white : ratingChange.black) > 0 ? '+' : ''}
                                                    {playerColor === 'w' ? ratingChange.white : ratingChange.black}
                                                </span>
                                            </div>
                                        )}

                                        <button
                                            onClick={resetGame}
                                            className="mt-6 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition transform hover:scale-105"
                                        >
                                            Play Again
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex gap-4 flex-wrap justify-center w-full">
                            <div className="text-xl text-gray-300 font-semibold bg-gray-800 px-6 py-2 rounded-lg border border-gray-700 flex-1 text-center min-w-[200px]">
                                Turn: <span className={game.turn() === 'w' ? 'text-green-400' : 'text-yellow-400'}>
                                    {game.turn() === 'w' ? 'White' : 'Black'}
                                </span>
                                {gameMode === 'online' && playerColor && (
                                    <span className={`ml-2 text-sm ${game.turn() === playerColor ? 'text-blue-400' : 'text-gray-500'}`}>
                                        ({game.turn() === playerColor ? 'Your turn' : 'Opponent\'s turn'})
                                    </span>
                                )}
                            </div>
                            {game.inCheck() && !gameResult && (
                                <div className="text-xl text-red-500 font-bold bg-gray-800 px-6 py-2 rounded-lg border border-red-900 animate-pulse">
                                    CHECK!
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Side: Game Info & Moves */}
                    <div className="flex-1 flex flex-col min-w-[300px] max-h-[600px]">
                        <div className="bg-gray-800 rounded-lg border border-gray-700 flex-1 flex flex-col overflow-hidden shadow-xl">
                            <div className="p-4 border-b border-gray-700 bg-gray-750">
                                <h3 className="text-lg font-bold text-white flex items-center">
                                    <span className="w-3 h-3 bg-red-500 rounded-full mr-2 animate-pulse"></span>
                                    Game Analysis
                                </h3>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 font-mono text-sm scrollbar-thin scrollbar-thumb-gray-600">
                                <div className="grid grid-cols-[30px_1fr_1fr] gap-x-2 gap-y-1">
                                    <div className="text-gray-500 font-bold border-b border-gray-700 pb-1 text-center">#</div>
                                    <div className="text-gray-400 font-bold border-b border-gray-700 pb-1 px-2">White</div>
                                    <div className="text-gray-400 font-bold border-b border-gray-700 pb-1 px-2">Black</div>
                                    {(() => {
                                        const rows = [];
                                        for (let i = 0; i < history.length; i += 2) {
                                            rows.push(
                                                <React.Fragment key={i}>
                                                    <div className="py-1 text-gray-600 text-center font-bold">
                                                        {Math.floor(i / 2) + 1}
                                                    </div>
                                                    <div className="py-1 px-3 rounded bg-gray-700/30 text-white border border-gray-700/50 shadow-sm">
                                                        {history[i]}
                                                    </div>
                                                    <div className="py-1 px-3 rounded bg-gray-700/30 text-white border border-gray-700/50 shadow-sm">
                                                        {history[i + 1] || ''}
                                                    </div>
                                                </React.Fragment>
                                            );
                                        }
                                        return rows.length > 0 ? rows : <div className="col-span-3 text-gray-600 italic py-8 text-center">Waiting for moves...</div>;
                                    })()}
                                </div>
                            </div>

                            <div className="p-4 border-t border-gray-700 bg-gray-750 flex justify-between gap-2">
                                {gameMode === 'online' && playerColor && (
                                    <button
                                        onClick={resetMatch}
                                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition text-sm"
                                    >
                                        Resign
                                    </button>
                                )}
                                <button
                                    onClick={resetGame}
                                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded transition text-sm"
                                >
                                    New Game
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 bg-gray-800 rounded-lg border border-gray-700 p-4 shadow-lg text-sm text-gray-400">
                            <p>Mode: <span className="text-blue-400 capitalize">{gameMode}</span></p>
                            <p>ID: <span className="text-green-400 font-mono text-xs">{roomId}</span></p>
                        </div>
                    </div>
                </div>

            </div>
        </ErrorBoundary>
    );
};

export default GameBoard;
