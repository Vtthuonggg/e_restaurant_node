const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fetch = require("node-fetch");

const app = express();
const server = http.createServer(app);

app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

/* =======================
   PROXY API TO LARAVEL
======================= */
const LARAVEL_API_URL = process.env.LARAVEL_API_URL || "http://192.168.100.198:8000/api";

// Proxy GET products
app.get("/api/qr-order/products", async (req, res) => {
    try {
        const apiKey = req.query.apiKey;
        const response = await fetch(`${LARAVEL_API_URL}/qr-order/products?apiKey=${apiKey}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Proxy POST create order
app.post("/api/qr-order/create", async (req, res) => {
    try {
        const response = await fetch(`${LARAVEL_API_URL}/qr-order/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

/* =======================
   SERVE STATIC FILES (HTML)
======================= */
app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (req, res) => {
    res.send("Socket.IO running - E-Restaurant");
});

app.get("/order.html", (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

/* =======================
   ROOT NAMESPACE (cho Flutter app)
======================= */
io.on('connection', (socket) => {
    console.log('ROOT namespace connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('ROOT namespace disconnected:', socket.id);
    });
});

/* =======================
   KÊNH /order (mobile, bếp)
======================= */
const orderNamespace = io.of("/order");

orderNamespace.on("connection", (socket) => {
    console.log("ORDER connected:", socket.id);

    socket.on("order:create", (data) => {
        console.log("New order:", data);

        // Emit event 'order-web' lên ROOT namespace (cho Flutter app)
        io.emit("order-web", data);
        console.log("Emitted 'order-web' to root namespace:", data);

        // Emit 'order:new' tới namespace /order-web (nếu có web client khác)
        orderWebNamespace.emit("order:new", data);
    });

    socket.on("disconnect", () => {
        console.log("ORDER disconnected:", socket.id);
    });
});

/* =======================
   KÊNH /order-web (web - optional)
======================= */
const orderWebNamespace = io.of("/order-web");

orderWebNamespace.on("connection", (socket) => {
    console.log("ORDER-WEB connected:", socket.id);

    socket.on("order:status", (data) => {
        console.log("Update status:", data);
        orderNamespace.emit("order:update", data);
    });

    socket.on("disconnect", () => {
        console.log("ORDER-WEB disconnected:", socket.id);
    });
});

/* ======================= */

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("Server running on port", PORT);
});