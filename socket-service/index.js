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
const LARAVEL_API_URL = process.env.LARAVEL_API_URL || "http://172.20.10.2:8000/api";

// Proxy GET products
app.get("/api/qr-order/products", async (req, res) => {
    try {
        const apiKey = req.query.apiKey;
        const targetUrl = `${LARAVEL_API_URL}/qr-order/products?apiKey=${apiKey}`;
        console.log('[PROXY] GET', targetUrl);
        
        const response = await fetch(targetUrl);
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();

        console.log('[PROXY] Response status:', response.status);
        console.log('[PROXY] Content-Type:', contentType);

        if (!response.ok) {
            return res.status(response.status).json({ 
                status: 'error', 
                message: `Laravel API error ${response.status}` 
            });
        }

        if (!contentType.includes('application/json')) {
            return res.status(500).json({ 
                status: 'error', 
                message: 'Laravel returned HTML instead of JSON' 
            });
        }

        const data = JSON.parse(text);
        res.json(data);
    } catch (error) {
        console.error('[PROXY] Error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Proxy POST create order
app.post("/api/qr-order/create", async (req, res) => {
    try {
        const targetUrl = `${LARAVEL_API_URL}/qr-order/create`;
        console.log('[PROXY] POST', targetUrl, 'body:', req.body);
        
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });

        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();

        console.log('[PROXY] Response status:', response.status);
        console.log('[PROXY] Content-Type:', contentType);
        console.log('[PROXY] Response body:', text.substring(0, 200));

        if (!response.ok) {
            return res.status(response.status).json({ 
                status: 'error', 
                message: `Laravel API error ${response.status}: ${text.substring(0, 100)}` 
            });
        }

        if (!contentType.includes('application/json')) {
            return res.status(500).json({ 
                status: 'error', 
                message: `Laravel returned HTML instead of JSON. Check route: ${targetUrl}` 
            });
        }

        const data = JSON.parse(text);
        res.json(data);
    } catch (error) {
        console.error('[PROXY] Error:', error);
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
   KÊNH /order (mobile, bếp, QR code, text-order)
======================= */
const orderNamespace = io.of("/order");

orderNamespace.on("connection", (socket) => {
    console.log("✅ ORDER namespace connected:", socket.id);

    // Nhận event 'order:create' từ QR code hoặc text-order
    socket.on("order:create", (data) => {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("📥 Received order:create event");
        console.log("📦 Data:", JSON.stringify(data, null, 2));
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        // Phân biệt nguồn tạo đơn
        const isFromTextOrder = data.mess_id !== undefined; // Text order có mess_id
        const isFromQROrder = !isFromTextOrder; // QR order không có mess_id

        if (isFromQROrder) {
            io.sockets.emit("order-web", data);
            console.log("✅ [QR Order] Emitted 'order-web' to ROOT namespace");
            console.log("   User ID:", data.user_id);
            console.log("   Room ID:", data.roomId || data.room_id);
        } else {
            io.sockets.emit("order-created", data);
            console.log("✅ [Text Order] Emitted 'order-created' to ROOT namespace");
            console.log("   Mess ID:", data.mess_id);
            console.log("   User ID:", data.user_id);
        }

        // Emit 'order:new' tới namespace /order-web (cho web client khác nếu có)
        orderWebNamespace.emit("order:new", data);
    });

    socket.on("disconnect", () => {
        console.log("❌ ORDER namespace disconnected:", socket.id);
    });
});

/* =======================
   KÊNH /order-web (web - optional)
======================= */
const orderWebNamespace = io.of("/order-web");

orderWebNamespace.on("connection", (socket) => {
    console.log("ORDER-WEB namespace connected:", socket.id);

    socket.on("order:status", (data) => {
        console.log("Update status:", data);
        orderNamespace.emit("order:update", data);
    });

    socket.on("disconnect", () => {
        console.log("ORDER-WEB namespace disconnected:", socket.id);
    });
});

/* ======================= */

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("Server running on port", PORT);
});