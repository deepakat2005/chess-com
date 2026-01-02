export default class Engine {
    constructor() {
        // Ensure stockfish.js is in the public folder
        this.stockfish = new Worker("/stockfish.js");
        this.onMessage = (data) => { }; // Callback

        this.stockfish.onmessage = (event) => {
            this.onMessage(event.data);
        };
    }

    evaluatePosition(fen, depth = 10) {
        this.stockfish.postMessage(`position fen ${fen}`);
        this.stockfish.postMessage(`go depth ${depth}`);
    }

    stop() {
        this.stockfish.postMessage("stop");
    }

    quit() {
        this.stockfish.postMessage("quit");
    }
}
