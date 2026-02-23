import { useState, useEffect, useRef } from 'react';
import socket from '../socket';

const Chat = ({ roomId, user }) => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!roomId) return;

        // Join the chat room (re-using game room ID)
        socket.emit('join_chat', { roomId });

        const handleReceiveMessage = (message) => {
            setMessages((prev) => [...prev, message]);
        };

        socket.on('receive_message', handleReceiveMessage);

        return () => {
            socket.off('receive_message', handleReceiveMessage);
        };
    }, [roomId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !user) return;

        const messageData = {
            roomId,
            userId: user.id || user._id,
            username: user.username,
            text: newMessage,
            timestamp: new Date().toISOString()
        };

        socket.emit('send_message', messageData);
        setMessages((prev) => [...prev, { ...messageData, self: true }]);
        setNewMessage("");
    };

    return (
        <div className="flex flex-col h-[600px] w-full bg-gray-800 rounded-lg shadow-lg border border-gray-700">
            <div className="p-4 border-b border-gray-700 bg-gray-900 rounded-t-lg">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>💬</span> Game Chat
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
                {messages.length === 0 ? (
                    <div className="text-gray-500 text-center text-sm italic mt-10">
                        No messages yet. Say hello!
                    </div>
                ) : (
                    messages.map((msg, index) => (
                        <div
                            key={index}
                            className={`flex flex-col ${msg.self ? 'items-end' : 'items-start'}`}
                        >
                            <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${msg.self
                                    ? 'bg-blue-600 text-white rounded-br-none'
                                    : 'bg-gray-700 text-gray-200 rounded-bl-none'
                                }`}>
                                <div className={`font-bold text-xs mb-1 ${msg.self ? 'text-blue-200' : 'text-green-400'}`}>
                                    {msg.self ? 'You' : msg.username}
                                </div>
                                {msg.text}
                            </div>
                            <span className="text-[10px] text-gray-500 mt-1">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-3 bg-gray-900 border-t border-gray-700 rounded-b-lg flex gap-2">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500 text-sm"
                />
                <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded font-bold text-sm transition"
                >
                    Send
                </button>
            </form>
        </div>
    );
};

export default Chat;
