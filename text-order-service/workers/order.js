import { Worker } from "bullmq";
import { redisConnection } from "../helpers/queue.js";
import { Manager } from "socket.io-client";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const worker = new Worker(
    "create-order",
    async (job) => {
        console.log("Processing order:", job.data);

        const manager = new Manager(process.env.SOCKET_IO_URL, {
            autoConnect: true,
        });
        const socket = manager.socket("/order");

        try {
            // Call Laravel API to create order
            const response = await axios.post(
                `${process.env.LARAVEL_API_URL}/qr-order/create`,
                {
                    apiKey: job.data.apiKey,
                    roomId: job.data.order.room_id ? Buffer.from(job.data.order.room_id.toString()).toString('base64') : null,
                    order_detail: job.data.order.order_detail,
                    note: job.data.order.note,
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            const result = response.data;
            console.log("Order created:", result);

            if (result.status === "success") {
                // Emit socket notification
                socket.emit("order:create", {
                    ...result.data.socket_data,
                    mess_id: job.data.mess_id,
                });

                console.log(`✅ Order created successfully: ${result.data.order.id}`);
            } else {
                throw new Error(result.message || "Order creation failed");
            }
        } catch (error) {
            console.error("❌ Order creation error:", error.message);

            // Emit error to socket
            socket.emit("order:create", {
                user_id: job.data.user_id,
                mess_id: job.data.mess_id,
                error: error.response?.data?.message || error.message,
            });
        } finally {
            socket.disconnect();
        }
    },
    { connection: redisConnection }
);

worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
    console.error(`Job ${job.id} failed:`, err.message);
});

console.log("Worker started");