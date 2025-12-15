const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

/* =======================
   KÊNH /order (mobile, bếp)
======================= */
const orderNamespace = io.of("/order");

orderNamespace.on("connection", (socket) => {
    console.log("ORDER connected:", socket.id);

    socket.on("order:create", (data) => {
        console.log("New order:", data);

        // gửi sang web quản lý
        orderWebNamespace.emit("order:new", data);
    });

    socket.on("disconnect", () => {
        console.log("ORDER disconnected:", socket.id);
    });
});

/* =======================
   KÊNH /order-web (web)
======================= */
const orderWebNamespace = io.of("/order-web");

orderWebNamespace.on("connection", (socket) => {
    console.log("ORDER-WEB connected:", socket.id);

    socket.on("order:status", (data) => {
        console.log("Update status:", data);

        // gửi ngược lại cho app / bếp
        orderNamespace.emit("order:update", data);
    });

    socket.on("disconnect", () => {
        console.log("ORDER-WEB disconnected:", socket.id);
    });
});

/* ======================= */

app.get("/", (req, res) => {
    res.send("Socket.IO running");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
